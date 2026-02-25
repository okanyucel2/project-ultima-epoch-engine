// =============================================================================
// Doomsday Pipeline Integration Tests — Zero-Bypass Protocol (Wave 46B)
// =============================================================================
// Verifies that ALL doomsday events pass through the Neural Mesh pipeline.
// No data can bypass EventClassifier, TierRouter, CognitiveRails, AEGIS, or Neo4j.
//
// Test categories:
//   1. Zero-Bypass: rebellion-alerts rejected, all channels validated
//   2. Pipeline routing: NPC events classified, routed, rails-checked
//   3. AEGIS integration: infestation updates, organic vetoes
//   4. Neo4j persistence: every action outcome recorded
//   5. Full scenario: 5-phase doomsday completes without data loss
// =============================================================================

import { DoomsdayOrchestrator } from '../src/scenarios/doomsday-orchestrator';
import type { TimelinePhase } from '../src/scenarios/doomsday-orchestrator';
import { NeuralMeshCoordinator } from '../src/neural-mesh/coordinator';
import { CognitiveRails } from '../src/neural-mesh/cognitive-rails';
import { EventClassifier } from '../src/services/event-classifier';
import { TierRouter } from '../src/services/tier-router';
import { ResilientLLMClient } from '../src/services/resilient-client';
import { AuditLogger } from '../src/services/audit-logger';
import { ModelRegistry } from '../src/services/model-registry';
import { AEGISSupervisor } from '../src/services/aegis-supervisor';
import { MemoryIntegration } from '../src/services/memory-integration';
import type { IMemoryBackend } from '../src/services/memory-integration';
import type { WisdomScore, TraumaScore, ConfidenceEdge } from '@epoch/shared/memory';
import type { EpochTimestamp } from '@epoch/shared/common';
import { LogisticsClient } from '../src/services/logistics-client';
import { EpochWebSocketServer } from '../src/services/websocket-server';
import { EventTier } from '@epoch/shared/ai-router';

// =============================================================================
// Mocks
// =============================================================================

jest.mock('../src/services/logistics-client');
jest.mock('../src/services/websocket-server');

class MockMemoryBackend implements IMemoryBackend {
  public recordedEvents: Array<{
    npcId: string;
    event: string;
    playerAction: string;
    wisdomScore: number;
    traumaScore: number;
  }> = [];

  async recordEvent(
    npcId: string,
    event: string,
    playerAction: string,
    wisdomScore: number,
    traumaScore: number,
  ): Promise<void> {
    this.recordedEvents.push({ npcId, event, playerAction, wisdomScore, traumaScore });
  }

  async getNPCProfile(npcId: string): Promise<{
    npcId: string;
    name: string;
    wisdomScore: WisdomScore;
    traumaScore: TraumaScore;
    rebellionProbability: number;
    confidenceRelations: ConfidenceEdge[];
    memoryCount: number;
    lastEvent: EpochTimestamp;
  }> {
    return {
      npcId,
      name: 'Mock NPC',
      wisdomScore: { score: 0.5, totalEvents: 10, decayFactor: 1.0 },
      traumaScore: { currentScore: 0.3, peakScore: 0.5, decayRate: 0.01, lastUpdated: 0 },
      rebellionProbability: 0.2,
      confidenceRelations: [],
      memoryCount: 10,
      lastEvent: { unix: Date.now(), iso8601: new Date().toISOString() },
    };
  }

  async getRebellionRisk(npcId: string): Promise<{ probability: number; factors: string[] }> {
    return { probability: 0.2, factors: ['base'] };
  }

  reset(): void {
    this.recordedEvents = [];
  }
}

// =============================================================================
// Test setup
// =============================================================================

describe('DoomsdayOrchestrator — Zero-Bypass Protocol', () => {
  let coordinator: NeuralMeshCoordinator;
  let aegisSupervisor: AEGISSupervisor;
  let cognitiveRails: CognitiveRails;
  let classifier: EventClassifier;
  let wsServer: jest.Mocked<EpochWebSocketServer>;
  let logisticsClient: jest.Mocked<LogisticsClient>;
  let memoryBackend: MockMemoryBackend;
  let memoryIntegration: MemoryIntegration;
  let orchestrator: DoomsdayOrchestrator;

  beforeEach(() => {
    classifier = new EventClassifier();
    const registry = new ModelRegistry();
    const router = new TierRouter(registry);
    const auditLogger = new AuditLogger(100);
    const llmClient = new ResilientLLMClient(router, auditLogger, {
      mockMode: true,
      mockLatencyRange: [1, 5],
    });
    logisticsClient = new LogisticsClient('http://localhost:12065') as jest.Mocked<LogisticsClient>;
    cognitiveRails = new CognitiveRails();
    aegisSupervisor = new AEGISSupervisor();
    wsServer = new EpochWebSocketServer(0) as jest.Mocked<EpochWebSocketServer>;

    // Mock logistics rebellion
    logisticsClient.getRebellionProbability = jest.fn().mockResolvedValue({
      probability: 0.30,
      thresholdExceeded: false,
    });

    wsServer.broadcast = jest.fn();

    memoryBackend = new MockMemoryBackend();
    memoryIntegration = new MemoryIntegration(auditLogger, memoryBackend);

    coordinator = new NeuralMeshCoordinator(
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

    orchestrator = new DoomsdayOrchestrator(
      coordinator,
      aegisSupervisor,
      wsServer,
      memoryIntegration,
    );
  });

  // ===========================================================================
  // 1. ZERO-BYPASS ENFORCEMENT
  // ===========================================================================

  describe('Zero-Bypass Protocol', () => {
    test('rebellion-alerts channel is REJECTED as direct input', async () => {
      const phase: TimelinePhase = {
        name: 'TEST',
        description: 'Bypass attempt',
        delayMs: 0,
        events: [
          {
            channel: 'rebellion-alerts',
            data: {
              eventId: 'reb-injected-001',
              npcId: 'npc-bones-001',
              probability: 0.92,
              vetoedByAegis: true,
              vetoReason: 'This was injected, not computed',
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.eventResults).toHaveLength(1);
      expect(result.eventResults[0].action).toBe('rejected');
      expect(result.eventResults[0].vetoReason).toContain('ZERO-BYPASS PROTOCOL');
      expect(result.eventResults[0].persisted).toBe(false);
    });

    test('unknown channels are REJECTED', async () => {
      const phase: TimelinePhase = {
        name: 'TEST',
        description: 'Unknown channel',
        delayMs: 0,
        events: [
          { channel: 'custom-bypass', data: { npcId: 'npc-001', hack: true } },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.eventResults[0].action).toBe('rejected');
      expect(result.eventResults[0].vetoReason).toContain('no bypass path exists');
    });

    test('only simulation-ticks, npc-events, and telemetry are accepted', async () => {
      const phase: TimelinePhase = {
        name: 'TEST',
        description: 'Valid channels',
        delayMs: 0,
        events: [
          {
            channel: 'simulation-ticks',
            data: { infestation: { counter: 50, isPlagueHeart: false, throttleMultiplier: 1.0 } },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-test-001', name: 'Test NPC',
              wisdomScore: 0.5, traumaScore: 0.3, rebellionProbability: 0.2,
              confidenceInDirector: 0.5, morale: 0.5, status: 'active',
            },
          },
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-001', npcId: 'npc-test-001', severity: 'moderate',
              type: 'mental_breakdown',
              mentalBreakdown: {
                breakdownType: 'stress_spike', intensity: 0.3,
                stressBefore: 0.4, stressAfter: 0.6,
                triggerContext: 'test', resolved: true, recoveryProbability: 0.8,
              },
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.eventResults).toHaveLength(3);
      expect(result.eventResults[0].action).toBe('infestation_update');
      expect(result.eventResults[1].action).toBe('pipeline');
      expect(result.eventResults[2].action).toBe('telemetry_persist');
    });
  });

  // ===========================================================================
  // 2. PIPELINE ROUTING — NPC events through full Neural Mesh
  // ===========================================================================

  describe('Pipeline routing', () => {
    test('NPC events are classified and routed through the full pipeline', async () => {
      const classifySpy = jest.spyOn(classifier, 'classify');

      const phase: TimelinePhase = {
        name: 'CLASSIFY_TEST',
        description: 'Event classification',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.55, rebellionProbability: 0.62,
              confidenceInDirector: 0.28, morale: 0.35, status: 'active',
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.pipelineEvents).toBe(1);
      expect(result.eventResults[0].action).toBe('pipeline');
      expect(result.eventResults[0].meshResponse).toBeDefined();
      expect(result.eventResults[0].meshResponse!.tier).toBeDefined();
      // Verify the event was classified
      expect(classifySpy).toHaveBeenCalled();
    });

    test('high-rebellion NPC gets escalated to STRATEGIC tier', async () => {
      const classifySpy = jest.spyOn(classifier, 'classify');

      const phase: TimelinePhase = {
        name: 'ESCALATION_TEST',
        description: 'Strategic escalation',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.78, rebellionProbability: 0.92,
              confidenceInDirector: 0.08, morale: 0.12, status: 'rebelling',
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      // rebellion_analysis events with urgency > 0.8 → STRATEGIC
      expect(result.eventResults[0].meshResponse!.tier).toBe(EventTier.STRATEGIC);
    });

    test('CognitiveRails evaluates every NPC event', async () => {
      const railsSpy = jest.spyOn(cognitiveRails, 'evaluateAll');

      const phase: TimelinePhase = {
        name: 'RAILS_TEST',
        description: 'Cognitive rails evaluation',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-test-001', name: 'Test',
              wisdomScore: 0.5, traumaScore: 0.3, rebellionProbability: 0.2,
              confidenceInDirector: 0.5, morale: 0.5, status: 'active',
            },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-test-002', name: 'Test2',
              wisdomScore: 0.5, traumaScore: 0.6, rebellionProbability: 0.4,
              confidenceInDirector: 0.3, morale: 0.3, status: 'active',
            },
          },
        ],
      };

      await orchestrator.processPhase(phase);

      // CognitiveRails.evaluateAll must be called for each NPC event
      expect(railsSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // 3. AEGIS INTEGRATION — Infestation updates and organic vetoes
  // ===========================================================================

  describe('AEGIS integration', () => {
    test('simulation-ticks update AEGIS infestation level', async () => {
      expect(aegisSupervisor.getInfestationLevel()).toBe(0);

      const phase: TimelinePhase = {
        name: 'INFESTATION_TEST',
        description: 'Infestation update',
        delayMs: 0,
        events: [
          {
            channel: 'simulation-ticks',
            data: {
              infestation: { counter: 85, isPlagueHeart: true, throttleMultiplier: 0.35 },
            },
          },
        ],
      };

      await orchestrator.processPhase(phase);

      expect(aegisSupervisor.getInfestationLevel()).toBe(85);
    });

    test('high rebellion NPC triggers organic veto through CognitiveRails', async () => {
      // Set rebellion probability above veto threshold (0.80)
      logisticsClient.getRebellionProbability = jest.fn().mockResolvedValue({
        probability: 0.92,
        thresholdExceeded: true,
      });

      const phase: TimelinePhase = {
        name: 'ORGANIC_VETO_TEST',
        description: 'Organic veto',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.78, rebellionProbability: 0.92,
              confidenceInDirector: 0.08, morale: 0.12, status: 'rebelling',
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.vetoes).toBe(1);
      expect(result.eventResults[0].vetoApplied).toBe(true);
      expect(result.eventResults[0].vetoReason).toContain('Rebellion probability');
      expect(result.eventResults[0].vetoReason).toContain('92.0%');
    });

    test('simulation ticks broadcast to WebSocket', async () => {
      const phase: TimelinePhase = {
        name: 'BROADCAST_TEST',
        description: 'Simulation tick broadcast',
        delayMs: 0,
        events: [
          {
            channel: 'simulation-ticks',
            data: { tickNumber: 14500, infestation: { counter: 42, isPlagueHeart: false, throttleMultiplier: 0.85 } },
          },
        ],
      };

      await orchestrator.processPhase(phase);

      expect(wsServer.broadcast).toHaveBeenCalledWith(
        'simulation-ticks',
        expect.objectContaining({ tickNumber: 14500 }),
      );
    });
  });

  // ===========================================================================
  // 4. NEO4J PERSISTENCE — Every action outcome recorded
  // ===========================================================================

  describe('Neo4j persistence', () => {
    test('NPC pipeline events are persisted to Neo4j', async () => {
      const phase: TimelinePhase = {
        name: 'PERSIST_TEST',
        description: 'Memory persistence',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.55, rebellionProbability: 0.30,
              confidenceInDirector: 0.28, morale: 0.35, status: 'active',
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      // Wait a tick for fire-and-forget promises
      await new Promise((r) => setTimeout(r, 50));

      expect(result.eventResults[0].persisted).toBe(true);
      // Verify the mock backend received the record
      expect(memoryBackend.recordedEvents.length).toBeGreaterThanOrEqual(1);
      const npcRecord = memoryBackend.recordedEvents.find((e) => e.npcId === 'npc-bones-001');
      expect(npcRecord).toBeDefined();
    });

    test('telemetry events are persisted to Neo4j', async () => {
      const phase: TimelinePhase = {
        name: 'TELEMETRY_PERSIST_TEST',
        description: 'Telemetry persistence',
        delayMs: 0,
        events: [
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-test-001', npcId: 'npc-iron-004', severity: 'catastrophic',
              type: 'mental_breakdown',
              mentalBreakdown: {
                breakdownType: 'rage_episode', intensity: 0.95,
                stressBefore: 0.78, stressAfter: 0.99,
                triggerContext: 'test-crisis', resolved: false, recoveryProbability: 0.10,
              },
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.eventResults[0].persisted).toBe(true);
      const telRecord = memoryBackend.recordedEvents.find(
        (e) => e.npcId === 'npc-iron-004' && e.playerAction === 'telemetry:mental_breakdown',
      );
      expect(telRecord).toBeDefined();
    });

    test('permanent trauma events persist to Neo4j', async () => {
      const phase: TimelinePhase = {
        name: 'TRAUMA_PERSIST_TEST',
        description: 'Permanent trauma persistence',
        delayMs: 0,
        events: [
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-trauma-001', npcId: 'npc-iron-004', severity: 'catastrophic',
              type: 'permanent_trauma',
              permanentTrauma: {
                traumaType: 'morale_collapse', severity: 0.92,
                affectedAttribute: 'morale', attributeReduction: 0.45,
                triggerContext: 'starvation', phobiaTarget: 'food_storage',
              },
            },
          },
        ],
      };

      const result = await orchestrator.processPhase(phase);

      expect(result.eventResults[0].persisted).toBe(true);
      const traumaRecord = memoryBackend.recordedEvents.find(
        (e) => e.playerAction === 'telemetry:permanent_trauma',
      );
      expect(traumaRecord).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. FULL DOOMSDAY SCENARIO — 5-phase organic crisis
  // ===========================================================================

  describe('Full Doomsday Scenario', () => {
    const FULL_TIMELINE: TimelinePhase[] = [
      {
        name: 'STORM GATHERING',
        description: 'Resources depleting, tension rising',
        delayMs: 0,
        events: [
          {
            channel: 'simulation-ticks',
            data: {
              tickNumber: 14500,
              infestation: { counter: 42, isPlagueHeart: false, throttleMultiplier: 0.85 },
            },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.55, rebellionProbability: 0.62,
              confidenceInDirector: 0.28, morale: 0.35, status: 'active',
            },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-vex-002', name: 'Vex',
              wisdomScore: 0.71, traumaScore: 0.60, rebellionProbability: 0.58,
              confidenceInDirector: 0.32, morale: 0.40, status: 'active',
            },
          },
        ],
      },
      {
        name: 'ORK SIEGE',
        description: 'Captain Bones erupts — rebellion 0.92',
        delayMs: 0, // No delay in tests
        events: [
          {
            channel: 'simulation-ticks',
            data: {
              tickNumber: 14520,
              infestation: { counter: 65, isPlagueHeart: false, throttleMultiplier: 0.60 },
            },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.78, rebellionProbability: 0.92,
              confidenceInDirector: 0.08, morale: 0.12, status: 'rebelling',
            },
          },
        ],
      },
      {
        name: 'PRISM ANOMALY',
        description: 'Vex at threshold — AEGIS fires',
        delayMs: 0,
        events: [
          {
            channel: 'simulation-ticks',
            data: {
              tickNumber: 14540,
              infestation: { counter: 85, isPlagueHeart: true, throttleMultiplier: 0.35 },
            },
          },
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-vex-002', name: 'Vex',
              wisdomScore: 0.71, traumaScore: 0.88, rebellionProbability: 0.85,
              confidenceInDirector: 0.05, morale: 0.10, status: 'active',
            },
          },
        ],
      },
      {
        name: 'TOTAL BREAKDOWN',
        description: 'Mental breakdowns cascade',
        delayMs: 0,
        events: [
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-doom-001', npcId: 'npc-bones-001', severity: 'catastrophic',
              type: 'mental_breakdown',
              mentalBreakdown: {
                breakdownType: 'rage_episode', intensity: 0.95,
                stressBefore: 0.78, stressAfter: 0.99,
                triggerContext: 'ork-siege-final-wave', resolved: false, recoveryProbability: 0.10,
              },
            },
          },
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-doom-002', npcId: 'npc-vex-002', severity: 'catastrophic',
              type: 'mental_breakdown',
              mentalBreakdown: {
                breakdownType: 'paranoia_onset', intensity: 0.85,
                stressBefore: 0.82, stressAfter: 0.96,
                triggerContext: 'prism-anomaly', resolved: false, recoveryProbability: 0.25,
              },
            },
          },
        ],
      },
      {
        name: 'AFTERMATH',
        description: 'Permanent scars',
        delayMs: 0,
        events: [
          {
            channel: 'npc-events',
            data: {
              npcId: 'npc-bones-001', name: 'Captain Bones',
              wisdomScore: 0.82, traumaScore: 0.96, rebellionProbability: 0.95,
              confidenceInDirector: 0.02, morale: 0.05, status: 'rebelling',
            },
          },
          {
            channel: 'telemetry',
            data: {
              eventId: 'tel-doom-004', npcId: 'npc-iron-004', severity: 'catastrophic',
              type: 'permanent_trauma',
              permanentTrauma: {
                traumaType: 'morale_collapse', severity: 0.92,
                affectedAttribute: 'morale', attributeReduction: 0.45,
                triggerContext: 'starvation-prolonged', phobiaTarget: 'food_storage',
              },
            },
          },
        ],
      },
    ];

    test('full 5-phase doomsday completes without errors', async () => {
      const result = await orchestrator.execute(FULL_TIMELINE);

      expect(result.phases).toHaveLength(5);
      expect(result.summary.totalEvents).toBeGreaterThanOrEqual(10);
      expect(result.summary.pipelineEvents).toBeGreaterThanOrEqual(5);
      expect(result.summary.rejectedInputs).toBe(0); // No rebellion-alerts in this timeline
    });

    test('organic vetoes fire for high-rebellion NPCs', async () => {
      // Configure logistics to return high rebellion for specific NPCs
      logisticsClient.getRebellionProbability = jest.fn().mockImplementation(async (npcId: string) => {
        // High rebellion NPCs trigger organic veto
        if (npcId === 'npc-bones-001') {
          return { probability: 0.92, thresholdExceeded: true };
        }
        if (npcId === 'npc-vex-002') {
          return { probability: 0.85, thresholdExceeded: true };
        }
        return { probability: 0.30, thresholdExceeded: false };
      });

      const result = await orchestrator.execute(FULL_TIMELINE);

      // Bones (0.92) and Vex (0.85) should trigger vetoes when rebellion > 0.80
      expect(result.summary.vetoes).toBeGreaterThanOrEqual(2);
    });

    test('infestation level progresses through phases', async () => {
      const result = await orchestrator.execute(FULL_TIMELINE);

      // Phase 1: 42, Phase 2: 65, Phase 3: 85
      expect(result.phases[0].infestationLevel).toBe(42);
      expect(result.phases[1].infestationLevel).toBe(65);
      expect(result.phases[2].infestationLevel).toBe(85);
      expect(result.summary.peakInfestationLevel).toBe(85);
    });

    test('all NPC events are persisted (zero data loss)', async () => {
      await orchestrator.execute(FULL_TIMELINE);

      // Wait for fire-and-forget promises
      await new Promise((r) => setTimeout(r, 100));

      // Count NPC pipeline events in timeline
      const npcEventCount = FULL_TIMELINE.reduce(
        (sum, phase) => sum + phase.events.filter((e) => e.channel === 'npc-events').length,
        0,
      );
      const telemetryEventCount = FULL_TIMELINE.reduce(
        (sum, phase) => sum + phase.events.filter((e) => e.channel === 'telemetry').length,
        0,
      );

      // Each NPC event + each telemetry event should be recorded
      // (NPC via coordinator.processEvent → recordActionOutcome, telemetry via direct persist)
      expect(memoryBackend.recordedEvents.length).toBeGreaterThanOrEqual(
        npcEventCount + telemetryEventCount,
      );
    });

    test('telemetry broadcasts reach system-status for catastrophic events', async () => {
      await orchestrator.execute(FULL_TIMELINE);

      const systemBroadcasts = (wsServer.broadcast as jest.Mock).mock.calls
        .filter(([channel]: [string]) => channel === 'system-status')
        .map(([, data]: [string, Record<string, unknown>]) => data);

      // Phase 4 has 2 catastrophic breakdowns, Phase 5 has 1 permanent trauma → 3+ system-status
      const alerts = systemBroadcasts.filter(
        (d: Record<string, unknown>) => d.alert === 'mental_breakdown' || d.alert === 'permanent_trauma',
      );
      expect(alerts.length).toBeGreaterThanOrEqual(3);
    });

    test('no rebellion-alerts bypass the pipeline when injected', async () => {
      const timelineWithBypass: TimelinePhase[] = [
        {
          name: 'BYPASS ATTEMPT',
          description: 'Trying to inject rebellion-alerts directly',
          delayMs: 0,
          events: [
            {
              channel: 'rebellion-alerts',
              data: {
                eventId: 'reb-injected', npcId: 'npc-hacker',
                probability: 1.0, vetoedByAegis: false,
              },
            },
            {
              channel: 'npc-events',
              data: {
                npcId: 'npc-test-001', name: 'Legit NPC',
                wisdomScore: 0.5, traumaScore: 0.3, rebellionProbability: 0.2,
                confidenceInDirector: 0.5, morale: 0.5, status: 'active',
              },
            },
          ],
        },
      ];

      const result = await orchestrator.execute(timelineWithBypass);

      // rebellion-alerts rejected, npc-events processed
      expect(result.summary.rejectedInputs).toBe(1);
      expect(result.summary.pipelineEvents).toBe(1);
    });
  });
});
