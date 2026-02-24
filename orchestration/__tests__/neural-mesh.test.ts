// =============================================================================
// NeuralMeshCoordinator Tests — Full pipeline integration tests
// =============================================================================

import { NeuralMeshCoordinator } from '../src/neural-mesh/coordinator';
import { CognitiveRails } from '../src/neural-mesh/cognitive-rails';
import { EventClassifier } from '../src/services/event-classifier';
import { TierRouter } from '../src/services/tier-router';
import { ResilientLLMClient } from '../src/services/resilient-client';
import { AuditLogger } from '../src/services/audit-logger';
import { ModelRegistry } from '../src/services/model-registry';
import { LogisticsClient } from '../src/services/logistics-client';
import { EpochWebSocketServer } from '../src/services/websocket-server';
import { EventTier } from '@epoch/shared/ai-router';
import type { MeshEvent } from '../src/neural-mesh/types';

// =============================================================================
// Mock logistics client — no real HTTP calls
// =============================================================================

jest.mock('../src/services/logistics-client');
jest.mock('../src/services/websocket-server');

describe('NeuralMeshCoordinator', () => {
  let coordinator: NeuralMeshCoordinator;
  let classifier: EventClassifier;
  let router: TierRouter;
  let llmClient: ResilientLLMClient;
  let logisticsClient: jest.Mocked<LogisticsClient>;
  let cognitiveRails: CognitiveRails;
  let auditLogger: AuditLogger;
  let wsServer: jest.Mocked<EpochWebSocketServer>;

  beforeEach(() => {
    classifier = new EventClassifier();
    const registry = new ModelRegistry();
    router = new TierRouter(registry);
    auditLogger = new AuditLogger(100);
    llmClient = new ResilientLLMClient(router, auditLogger, {
      mockMode: true,
      mockLatencyRange: [1, 5],
    });
    logisticsClient = new LogisticsClient('http://localhost:12065') as jest.Mocked<LogisticsClient>;
    cognitiveRails = new CognitiveRails();
    wsServer = new EpochWebSocketServer(0) as jest.Mocked<EpochWebSocketServer>;

    // Mock logistics methods
    logisticsClient.getRebellionProbability = jest.fn().mockResolvedValue({
      npcId: 'npc-001',
      probability: 0.30,
      factors: {
        base: 0.05,
        traumaModifier: 0.10,
        efficiencyModifier: 0.10,
        moraleModifier: 0.05,
      },
      thresholdExceeded: false,
    });

    // Mock WebSocket broadcast (no-op)
    wsServer.broadcast = jest.fn();

    coordinator = new NeuralMeshCoordinator(
      classifier,
      router,
      llmClient,
      logisticsClient,
      cognitiveRails,
      auditLogger,
      wsServer,
    );
  });

  // ---------------------------------------------------------------------------
  // Test 1: Full pipeline — event -> classify -> route -> LLM -> rebellion -> response
  // ---------------------------------------------------------------------------
  test('full pipeline: classify, route, LLM call, rebellion check, response', async () => {
    const event: MeshEvent = {
      eventId: 'evt-001',
      npcId: 'npc-001',
      eventType: 'resource_decision',
      description: 'Allocate minerals to mine sector 7',
    };

    const response = await coordinator.processEvent(event);

    expect(response.eventId).toBe('evt-001');
    expect(response.tier).toBe(EventTier.OPERATIONAL);
    expect(response.aiResponse).toBeTruthy();
    expect(response.rebellionCheck.probability).toBe(0.30);
    expect(response.rebellionCheck.thresholdExceeded).toBe(false);
    expect(response.vetoApplied).toBe(false);
    expect(response.processingTimeMs).toBeGreaterThanOrEqual(0);

    // Verify logistics was called with the NPC ID
    expect(logisticsClient.getRebellionProbability).toHaveBeenCalledWith('npc-001');

    // Verify broadcast to npc-events (not cognitive-rails since no veto)
    expect(wsServer.broadcast).toHaveBeenCalledWith(
      'npc-events',
      expect.objectContaining({ eventId: 'evt-001' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Veto pipeline — high rebellion -> cognitive rails veto -> broadcast
  // ---------------------------------------------------------------------------
  test('veto pipeline: high rebellion triggers cognitive rails veto', async () => {
    // Override rebellion to exceed 0.80 threshold
    logisticsClient.getRebellionProbability = jest.fn().mockResolvedValue({
      npcId: 'npc-002',
      probability: 0.92,
      factors: {
        base: 0.05,
        traumaModifier: 0.40,
        efficiencyModifier: 0.30,
        moraleModifier: 0.17,
      },
      thresholdExceeded: true,
    });

    const event: MeshEvent = {
      eventId: 'evt-002',
      npcId: 'npc-002',
      eventType: 'rebellion_analysis',
      description: 'NPC shows signs of collective rebellion',
      urgency: 0.9,
    };

    const response = await coordinator.processEvent(event);

    expect(response.eventId).toBe('evt-002');
    expect(response.vetoApplied).toBe(true);
    expect(response.vetoReason).toBeTruthy();
    expect(response.rebellionCheck.probability).toBe(0.92);
    expect(response.rebellionCheck.thresholdExceeded).toBe(true);

    // Verify broadcast to cognitive-rails channel (veto channel)
    expect(wsServer.broadcast).toHaveBeenCalledWith(
      'cognitive-rails',
      expect.objectContaining({ eventId: 'evt-002', vetoApplied: true }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 3: Batch processing handles multiple events
  // ---------------------------------------------------------------------------
  test('batch processing handles multiple events concurrently', async () => {
    const events: MeshEvent[] = [
      {
        eventId: 'batch-001',
        npcId: 'npc-001',
        eventType: 'telemetry',
        description: 'Routine heartbeat',
      },
      {
        eventId: 'batch-002',
        npcId: 'npc-002',
        eventType: 'resource_decision',
        description: 'Allocate rapidlum',
      },
      {
        eventId: 'batch-003',
        npcId: 'npc-003',
        eventType: 'rebellion_analysis',
        description: 'Analyze sector rebellion',
      },
    ];

    const responses = await coordinator.processBatch(events);

    expect(responses).toHaveLength(3);
    expect(responses[0].eventId).toBe('batch-001');
    expect(responses[0].tier).toBe(EventTier.ROUTINE);
    expect(responses[1].eventId).toBe('batch-002');
    expect(responses[1].tier).toBe(EventTier.OPERATIONAL);
    expect(responses[2].eventId).toBe('batch-003');
    expect(responses[2].tier).toBe(EventTier.STRATEGIC);

    // All should have rebellion checks
    for (const response of responses) {
      expect(response.rebellionCheck).toBeDefined();
      expect(response.processingTimeMs).toBeGreaterThanOrEqual(0);
    }
  });
});
