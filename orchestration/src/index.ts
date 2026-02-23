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
//
// WebSocket on PORTS.WEBSOCKET (32064)
// =============================================================================

import express from 'express';
import { config } from 'dotenv';
import { PORTS, EPOCH_VERSION } from '../../shared/types/common';

// Services (Wave 2A)
import {
  EventClassifier,
  TierRouter,
  ResilientLLMClient,
  AuditLogger,
  ModelRegistry,
} from './services';
import { LogisticsClient } from './services/logistics-client';
import { EpochWebSocketServer } from './services/websocket-server';
import { HealthAggregator } from './services/health-aggregator';

// Neural Mesh
import { CognitiveRails } from './neural-mesh/cognitive-rails';
import { NeuralMeshCoordinator } from './neural-mesh/coordinator';
import type { MeshEvent } from './neural-mesh/types';

config();

// =============================================================================
// Initialize all services
// =============================================================================

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.ORCHESTRATION;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : PORTS.WEBSOCKET;
const LOGISTICS_URL = process.env.LOGISTICS_URL || `http://localhost:${PORTS.LOGISTICS}`;

// AI Router services (Wave 2A)
const registry = new ModelRegistry();
const classifier = new EventClassifier();
const router = new TierRouter(registry);
const auditLogger = new AuditLogger(1000);
const llmClient = new ResilientLLMClient(router, auditLogger, {
  mockMode: true, // Real SDK integration in Wave 3
  mockLatencyRange: [10, 100],
});

// Infrastructure services
const logisticsClient = new LogisticsClient(LOGISTICS_URL);
const wsServer = new EpochWebSocketServer(WS_PORT);

// Neural Mesh
const cognitiveRails = new CognitiveRails();
const coordinator = new NeuralMeshCoordinator(
  classifier,
  router,
  llmClient,
  logisticsClient,
  cognitiveRails,
  auditLogger,
  wsServer,
);

// Health
const healthAggregator = new HealthAggregator(logisticsClient, wsServer);

// =============================================================================
// Express application
// =============================================================================

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
// GET /api/audit/recent — Recent audit log entries
// ---------------------------------------------------------------------------
app.get('/api/audit/recent', (req, res) => {
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

// =============================================================================
// Start server
// =============================================================================

const server = app.listen(PORT, () => {
  console.log(`[MAX] Neural Mesh Orchestration online — port ${PORT}`);
  console.log(`[MAX] WebSocket server on port ${wsServer.getPort()}`);
  console.log(`[MAX] Logistics client targeting ${LOGISTICS_URL}`);
  console.log(`[MAX] Epoch Engine v${EPOCH_VERSION} — All systems nominal`);
});

// =============================================================================
// Graceful shutdown
// =============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[MAX] ${signal} received — initiating graceful shutdown...`);

  // Close WebSocket server
  try {
    await wsServer.close();
    console.log('[MAX] WebSocket server closed');
  } catch (err) {
    console.error('[MAX] Error closing WebSocket:', err);
  }

  // Close Express server
  server.close(() => {
    console.log('[MAX] Express server closed');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error('[MAX] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
