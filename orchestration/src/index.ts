// =============================================================================
// Epoch Engine — Neural Mesh Orchestration Server
// =============================================================================
// Wires all services together: Express API, WebSocket, Logistics, AI Router,
// Neural Mesh Coordinator, AEGIS Cognitive Rails.
//
// Endpoints:
//   GET  /health           — Basic health check
//   GET  /health/deep      — Deep health aggregation across all services
//   POST /api/events       — Process single event through Neural Mesh
//   POST /api/events/batch — Process multiple events concurrently
//   GET  /api/audit/recent — Recent audit log entries
//   GET  /api/audit/stats  — Aggregated audit statistics
//   GET  /api/v1/npc/spawn-manifest — UE5 NPC spawn data with live enrichment
//
// WebSocket on PORTS.WEBSOCKET (32064)
// =============================================================================

import express from 'express';
import { config } from 'dotenv';
import { PORTS, EPOCH_VERSION } from '@epoch/shared/common';

// Services (Wave 2A)
import {
  EventClassifier,
  TierRouter,
  ResilientLLMClient,
  AuditLogger,
  ModelRegistry,
} from './services';
import { LogisticsClient } from './services/logistics-client';
import type { ILogisticsClient } from './services/logistics-client';
import { LogisticsGrpcClient } from './services/logistics-grpc-client';
import { LogisticsClientRouter } from './services/logistics-client-router';
import { EpochWebSocketServer } from './services/websocket-server';
import { HealthAggregator } from './services/health-aggregator';
import { MemoryIntegration } from './services/memory-integration';
import { Neo4jMemoryBackend } from './services/neo4j-memory-backend';
import { applyKarmicResolution } from './services/karmic-resolution';

// Neural Mesh
import { CognitiveRails } from './neural-mesh/cognitive-rails';
import { NeuralMeshCoordinator } from './neural-mesh/coordinator';
import { AEGISSupervisor } from './services/aegis-supervisor';
import { DoomsdayOrchestrator } from './scenarios/doomsday-orchestrator';
import type { TimelinePhase } from './scenarios/doomsday-orchestrator';
import type { MeshEvent } from './neural-mesh/types';

// NPC Catalog & Spawn Manifest (Wave 48)
import { NPC_CATALOG, getNPCDefinition } from './data/npc-catalog';
import type { SpawnManifestResponse } from './data/spawn-manifest-schema';

// NPC Commands (Wave 50)
import { z } from 'zod';

config();

// =============================================================================
// App Factory — Testable app creation with injectable dependencies
// =============================================================================

export interface AppDependencies {
  logisticsClient?: ILogisticsClient;
  wsServer?: EpochWebSocketServer;
  memoryIntegration?: MemoryIntegration;
  mockMode?: boolean;
}

export interface AppInstance {
  app: express.Express;
  coordinator: NeuralMeshCoordinator;
  auditLogger: AuditLogger;
  wsServer: EpochWebSocketServer;
  healthAggregator: HealthAggregator;
  logisticsClient: ILogisticsClient;
  grpcClient: LogisticsGrpcClient | null;
  aegisSupervisor: AEGISSupervisor;
}

export function createApp(deps: AppDependencies = {}): AppInstance {
  const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : PORTS.WEBSOCKET;
  const LOGISTICS_URL = process.env.LOGISTICS_URL || `http://localhost:${PORTS.LOGISTICS}`;

  // AI Router services (Wave 2A)
  const registry = new ModelRegistry();
  const classifier = new EventClassifier();
  const router = new TierRouter(registry);
  const auditLogger = new AuditLogger(1000);
  const llmClient = new ResilientLLMClient(router, auditLogger, {
    mockMode: deps.mockMode ?? true,
    mockLatencyRange: [10, 100],
  });

  // Infrastructure services
  const wsServer = deps.wsServer ?? new EpochWebSocketServer(WS_PORT);

  // Logistics client (injectable for tests)
  let grpcClient: LogisticsGrpcClient | null = null;
  let logisticsClient: ILogisticsClient;

  if (deps.logisticsClient) {
    logisticsClient = deps.logisticsClient;
  } else {
    const httpClient = new LogisticsClient(LOGISTICS_URL);
    const LOGISTICS_GRPC_HOST = process.env.LOGISTICS_GRPC_HOST;
    if (LOGISTICS_GRPC_HOST) {
      grpcClient = new LogisticsGrpcClient(LOGISTICS_GRPC_HOST);
    }
    logisticsClient = new LogisticsClientRouter(grpcClient, httpClient);
  }

  // Memory Integration (optional — null if Neo4j unavailable)
  const memoryIntegration = deps.memoryIntegration ?? new MemoryIntegration(auditLogger, null);

  // Neural Mesh
  const cognitiveRails = new CognitiveRails();
  const aegisSupervisor = new AEGISSupervisor();
  const coordinator = new NeuralMeshCoordinator(
    classifier,
    router,
    llmClient,
    logisticsClient,
    cognitiveRails,
    auditLogger,
    wsServer,
    memoryIntegration,
    aegisSupervisor,
  );

  // Health
  const healthAggregator = new HealthAggregator(logisticsClient, wsServer);

  return { app: createExpressApp(coordinator, auditLogger, healthAggregator, logisticsClient, wsServer, memoryIntegration, aegisSupervisor), coordinator, auditLogger, wsServer, healthAggregator, logisticsClient, grpcClient, aegisSupervisor };
}

// =============================================================================
// Express routes (extracted for reuse in factory)
// =============================================================================

function createExpressApp(
  coordinator: NeuralMeshCoordinator,
  auditLogger: AuditLogger,
  healthAggregator: HealthAggregator,
  logisticsClient?: ILogisticsClient,
  wsServer?: EpochWebSocketServer,
  memoryIntegration?: MemoryIntegration,
  aegisSupervisor?: AEGISSupervisor,
): express.Express {
  const app = express();
  app.use(express.json());

// ---------------------------------------------------------------------------
// GET /health — Basic liveness check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ultima-epoch-orchestration',
    version: EPOCH_VERSION,
    agent: 'MAX',
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /health/deep — Aggregated health across all Epoch Engine services
// ---------------------------------------------------------------------------
app.get('/health/deep', async (_req, res) => {
  try {
    const health = await healthAggregator.deepHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/events — Process a single event through Neural Mesh
// ---------------------------------------------------------------------------
app.post('/api/events', async (req, res) => {
  try {
    const event = req.body as MeshEvent;

    // Basic validation
    if (!event.eventId || !event.npcId || !event.eventType || !event.description) {
      res.status(400).json({
        error: 'Missing required fields: eventId, npcId, eventType, description',
      });
      return;
    }

    const response = await coordinator.processEvent(event);
    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/events/batch — Process multiple events concurrently
// ---------------------------------------------------------------------------
app.post('/api/events/batch', async (req, res) => {
  try {
    const events = req.body as MeshEvent[];

    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty array of events' });
      return;
    }

    const responses = await coordinator.processBatch(events);
    res.json(responses);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/status — System status (dashboard polling endpoint)
// ---------------------------------------------------------------------------
app.get('/api/status', (_req, res) => {
  const stats = auditLogger.getStats();
  res.json({
    eventsProcessed: stats.totalDecisions,
    vetoes: 0, // TODO: track separately
    avgLatencyMs: stats.avgLatencyMs,
  });
});

// ---------------------------------------------------------------------------
// GET /api/audit/recent — Recent audit log entries
// GET /api/audit — Alias (dashboard compatibility)
// ---------------------------------------------------------------------------
app.get('/api/audit/recent', (req, res) => {
  const count = parseInt(req.query.count as string, 10) || 50;
  const entries = auditLogger.getRecent(Math.min(count, 1000));
  res.json({ entries, count: entries.length });
});

app.get('/api/audit', (req, res) => {
  const count = parseInt(req.query.count as string, 10) || 50;
  const entries = auditLogger.getRecent(Math.min(count, 1000));
  res.json({ entries, count: entries.length });
});

// ---------------------------------------------------------------------------
// GET /api/audit/stats — Aggregated audit statistics
// ---------------------------------------------------------------------------
app.get('/api/audit/stats', (_req, res) => {
  const stats = auditLogger.getStats();
  res.json(stats);
});

// ---------------------------------------------------------------------------
// POST /api/cleansing/deploy — Sheriff Protocol cleansing operation
// ---------------------------------------------------------------------------
app.post('/api/cleansing/deploy', async (req, res) => {
  try {
    if (!logisticsClient) {
      res.status(503).json({ error: 'Logistics client not available' });
      return;
    }

    const npcIds = req.body?.npc_ids as string[] | undefined;
    const result = await logisticsClient.deployCleansingOperation(npcIds);

    // Apply karmic consequences if memory is available
    if (memoryIntegration && wsServer) {
      try {
        await applyKarmicResolution(result, memoryIntegration, wsServer);
      } catch (err) {
        // Non-fatal — log but don't fail the request
        console.error('[MAX] Karmic resolution error:', err);
      }
    } else if (wsServer) {
      // No memory but still broadcast
      wsServer.broadcast('system-status', {
        type: 'cleansing_result',
        success: result.success,
        successRate: result.successRate,
        participantCount: result.participantCount,
        participantIds: result.participantIds,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Cleansing operation failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/npc/command — Send navigation/action command to NPC (Wave 50)
// Validates, broadcasts via WebSocket npc-commands channel.
// UE5/Godot clients consume this to drive AI Controllers + NavMesh.
// Dumb Client: engine NEVER decides where to go — orchestration commands it.
// ---------------------------------------------------------------------------
const NPCCommandPayloadSchema = z.object({
  commandId: z.string(),
  npcId: z.string(),
  commandType: z.enum(['move_to', 'stop', 'look_at', 'play_montage']),
  payload: z.record(z.unknown()),
  priority: z.number().int().min(0).max(10).default(1),
});

const NPCCommandBatchPayloadSchema = z.object({
  commands: z.array(NPCCommandPayloadSchema).min(1).max(50),
});

app.post('/api/v1/npc/command', (req, res) => {
  // Single command
  const result = NPCCommandPayloadSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid NPC command',
      details: result.error.issues,
    });
    return;
  }

  const command = result.data;

  // Verify NPC exists in catalog
  const npcDef = getNPCDefinition(command.npcId);
  if (!npcDef) {
    res.status(404).json({
      error: `Unknown NPC: ${command.npcId}`,
      knownNPCs: NPC_CATALOG.map((n) => ({ npcId: n.npcId, name: n.name })),
    });
    return;
  }

  // Broadcast to npc-commands channel
  if (wsServer) {
    wsServer.broadcast('npc-commands', command);
  }

  res.json({
    accepted: true,
    commandId: command.commandId,
    npcId: command.npcId,
    npcName: npcDef.name,
    commandType: command.commandType,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/npc/command/batch', (req, res) => {
  const result = NPCCommandBatchPayloadSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid NPC command batch',
      details: result.error.issues,
    });
    return;
  }

  const { commands } = result.data;
  const results: Array<{ commandId: string; npcId: string; accepted: boolean; error?: string }> = [];

  for (const command of commands) {
    const npcDef = getNPCDefinition(command.npcId);
    if (!npcDef) {
      results.push({ commandId: command.commandId, npcId: command.npcId, accepted: false, error: 'Unknown NPC' });
      continue;
    }

    if (wsServer) {
      wsServer.broadcast('npc-commands', command);
    }
    results.push({ commandId: command.commandId, npcId: command.npcId, accepted: true });
  }

  res.json({
    total: commands.length,
    accepted: results.filter((r) => r.accepted).length,
    rejected: results.filter((r) => !r.accepted).length,
    results,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// POST /api/telemetry/watchdog — Receive watchdog restart events, rebroadcast via WS
// (Wave 25B: Live telemetry pipeline — bash watchdog → HTTP → WebSocket → dashboard)
// ---------------------------------------------------------------------------
app.post('/api/telemetry/watchdog', (req, res) => {
  const payload = req.body;
  if (wsServer && payload?.data) {
    wsServer.broadcast('system-status', payload.data);
  }
  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// POST /api/doomsday/trigger — Execute Doomsday through Neural Mesh pipeline (Wave 46A)
// Zero-Bypass: ALL events pass through EventClassifier → TierRouter → CognitiveRails → AEGIS → Neo4j
// rebellion-alerts are computed organically, never injected.
// ---------------------------------------------------------------------------
app.post('/api/doomsday/trigger', async (req, res) => {
  if (!wsServer || !aegisSupervisor) {
    res.status(503).json({ error: 'WebSocket server or AEGIS supervisor not available' });
    return;
  }

  try {
    const timeline = req.body?.timeline as TimelinePhase[] | undefined;
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
      res.status(400).json({ error: 'Request body must contain a non-empty "timeline" array of phases' });
      return;
    }

    const orchestrator = new DoomsdayOrchestrator(
      coordinator,
      aegisSupervisor,
      wsServer,
      memoryIntegration,
    );

    const result = await orchestrator.execute(timeline);

    res.json({
      status: 'doomsday_complete',
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Doomsday execution failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/npc/spawn-manifest — UE5 NPC spawn data (Wave 48)
// UE5 fetches this on startup to spawn NPC actors at world-space transforms.
// Each NPC is enriched with live Neo4j data (decayed confidence, trauma, rebellion).
// ---------------------------------------------------------------------------
app.get('/api/v1/npc/spawn-manifest', async (_req, res) => {
  try {
    const npcs = await Promise.all(
      NPC_CATALOG.map(async (npc) => {
        // Start with catalog defaults
        let psychState = { ...npc.defaults };

        // Enrich with live Neo4j data if memory backend is available
        if (memoryIntegration?.isAvailable()) {
          try {
            const context = await memoryIntegration.getNPCContext(npc.npcId);
            psychState = {
              wisdomScore: context.wisdomScore || npc.defaults.wisdomScore,
              traumaScore: context.traumaScore || npc.defaults.traumaScore,
              rebellionProbability: context.rebellionRisk || npc.defaults.rebellionProbability,
              confidenceInDirector: context.confidenceInDirector,
              workEfficiency: npc.defaults.workEfficiency,
              morale: npc.defaults.morale,
            };
          } catch {
            // Neo4j enrichment failed — fall back to catalog defaults
          }
        }

        return {
          npcId: npc.npcId,
          name: npc.name,
          archetype: npc.archetype,
          description: npc.description,
          spawnTransform: npc.spawnTransform,
          visualHints: npc.visualHints,
          psychState,
        };
      }),
    );

    const response: SpawnManifestResponse = {
      version: EPOCH_VERSION,
      generatedAt: new Date().toISOString(),
      npcCount: npcs.length,
      npcs,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Spawn manifest generation failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/phoenix/drain — Drain RetryQueue before restart (Wave 25C)
// Used by phoenix_protocol.sh for graceful pre-restart drain
// ---------------------------------------------------------------------------
app.post('/api/phoenix/drain', async (_req, res) => {
  if (!memoryIntegration) {
    res.json({ drained: 0, message: 'No memory integration active' });
    return;
  }
  try {
    const stats = await memoryIntegration.drain();
    res.json({ drained: stats.flushed, message: 'RetryQueue drained', stats });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Drain failed',
    });
  }
});

  return app;
}

// =============================================================================
// Start server (only when run directly, not imported)
// =============================================================================

const isDirectRun = require.main === module || !module.parent;

if (isDirectRun) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.ORCHESTRATION;

  // Initialize with optional Neo4j memory backend
  (async () => {
    let memoryIntegration: MemoryIntegration | undefined;

    const NEO4J_URI = process.env.NEO4J_URI;
    if (NEO4J_URI) {
      const backend = await Neo4jMemoryBackend.create(
        NEO4J_URI,
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'epochengine',
      );
      if (backend) {
        memoryIntegration = new MemoryIntegration(new AuditLogger(), backend);
        console.log('[MAX] Neo4j memory backend connected');
      }
    }

    const { app, wsServer, grpcClient, coordinator } = createApp({ memoryIntegration });

    const server = app.listen(PORT, () => {
      console.log(`[MAX] Neural Mesh Orchestration online — port ${PORT}`);
      console.log(`[MAX] WebSocket server on port ${wsServer.getPort()}`);
      console.log(`[MAX] Epoch Engine v${EPOCH_VERSION} — All systems nominal`);

      // Wave 25B: Broadcast startup event to connected dashboard clients
      wsServer.broadcast('system-status', {
        type: 'startup',
        service: 'orchestration',
        version: EPOCH_VERSION,
        port: PORT,
        wsPort: wsServer.getPort(),
        timestamp: new Date().toISOString(),
      });

      // Start telemetry stream if gRPC is available (non-blocking)
      if (grpcClient) {
        coordinator.startTelemetryStream();
      }
    });

    async function gracefulShutdown(signal: string): Promise<void> {
      console.log(`[MAX] ${signal} received — initiating graceful shutdown...`);

      coordinator.stopTelemetryStream();

      // Wave 25C: Broadcast shutdown event before closing WS
      wsServer.broadcast('system-status', {
        type: 'shutdown',
        service: 'orchestration',
        signal,
        timestamp: new Date().toISOString(),
      });

      if (grpcClient) {
        try { grpcClient.close(); } catch (err) { console.error('[MAX] gRPC close error:', err); }
      }

      // Wave 25C: Close Neo4j pool (drains RetryQueue first)
      if (memoryIntegration) {
        try { await memoryIntegration.close(); } catch (err) { console.error('[MAX] Neo4j close error:', err); }
      }

      try { await wsServer.close(); } catch (err) { console.error('[MAX] WS close error:', err); }

      server.close(() => {
        console.log('[MAX] Express server closed');
        process.exit(0);
      });

      setTimeout(() => { console.error('[MAX] Forced exit'); process.exit(1); }, 10000);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  })();
}

export default createApp;
