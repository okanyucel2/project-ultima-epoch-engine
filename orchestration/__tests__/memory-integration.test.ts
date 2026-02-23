// =============================================================================
// MemoryIntegration Tests — Bridge between AI Router and Epoch Memory
// =============================================================================

import { MemoryIntegration } from '../src/services/memory-integration';
import type { IMemoryBackend } from '../src/services/memory-integration';
import { AuditLogger } from '../src/services/audit-logger';
import { EventTier, ProviderType } from '../../shared/types/ai-router';
import type { RoutingDecision } from '../../shared/types/ai-router';
import { createTimestamp } from '../../shared/types/common';
import { DecayStrategy } from '../../shared/types/memory';

// =============================================================================
// Mock memory backend
// =============================================================================

function createMockBackend(): jest.Mocked<IMemoryBackend> {
  return {
    recordEvent: jest.fn().mockResolvedValue(undefined),
    getNPCProfile: jest.fn().mockResolvedValue({
      npcId: 'npc-001',
      name: 'Worker-Alpha',
      wisdomScore: {
        npcId: 'npc-001',
        score: 0.65,
        factors: {
          memoryCount: 12,
          eventDiversity: 0.7,
          temporalSpan: 48,
          positiveRatio: 0.6,
        },
        calculatedAt: createTimestamp(),
      },
      traumaScore: {
        npcId: 'npc-001',
        currentScore: 0.25,
        rawScore: 0.40,
        decayApplied: DecayStrategy.HYPERBOLIC,
        hoursElapsed: 10,
        calculatedAt: createTimestamp(),
      },
      rebellionProbability: 0.35,
      confidenceRelations: [
        {
          npcId: 'npc-001',
          entityId: 'director',
          confidence: 0.72,
          decayRate: 0.1,
          lastUpdated: createTimestamp(),
        },
      ],
      memoryCount: 12,
      lastEvent: createTimestamp(),
    }),
    getRebellionRisk: jest.fn().mockResolvedValue({
      probability: 0.35,
      factors: ['Base probability: 5.0%', 'Trauma modifier: +15.0%'],
    }),
  };
}

describe('MemoryIntegration', () => {
  let auditLogger: AuditLogger;
  let mockBackend: jest.Mocked<IMemoryBackend>;
  let integration: MemoryIntegration;

  beforeEach(() => {
    auditLogger = new AuditLogger(100);
    mockBackend = createMockBackend();
    integration = new MemoryIntegration(auditLogger, mockBackend);
  });

  // ---------------------------------------------------------------------------
  // Test 1: Records routing decisions as memory events
  // ---------------------------------------------------------------------------
  test('recordRoutingDecision stores event in memory backend', async () => {
    const decision: RoutingDecision = {
      eventTier: EventTier.OPERATIONAL,
      selectedProvider: ProviderType.ANTHROPIC,
      selectedModel: 'claude-haiku-4-5',
      failoverOccurred: false,
      latencyMs: 120,
      timestamp: createTimestamp(),
    };

    await integration.recordRoutingDecision(
      'npc-001',
      decision,
      'Allocate minerals to mine sector 7',
    );

    expect(mockBackend.recordEvent).toHaveBeenCalledTimes(1);
    expect(mockBackend.recordEvent).toHaveBeenCalledWith(
      'npc-001',
      expect.stringContaining('operational'),
      'system_routing',
      0.1,  // wisdom contribution
      0.0,  // no trauma from routing
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Records action outcomes with correct wisdom/trauma
  // ---------------------------------------------------------------------------
  test('recordActionOutcome records success with positive wisdom, zero trauma', async () => {
    await integration.recordActionOutcome('npc-001', 'command', true, 0.7);

    expect(mockBackend.recordEvent).toHaveBeenCalledTimes(1);
    const [npcId, _event, actionType, wisdomScore, traumaScore] =
      mockBackend.recordEvent.mock.calls[0];

    expect(npcId).toBe('npc-001');
    expect(actionType).toBe('command');
    expect(wisdomScore).toBeGreaterThan(0.2); // 0.2 + intensity * 0.3
    expect(traumaScore).toBe(0.0); // No trauma on success
  });

  test('recordActionOutcome records failure with trauma proportional to intensity', async () => {
    await integration.recordActionOutcome('npc-001', 'punishment', false, 0.8);

    const [_npcId, _event, _actionType, wisdomScore, traumaScore] =
      mockBackend.recordEvent.mock.calls[0];

    expect(wisdomScore).toBe(0.05); // Small wisdom from failure
    expect(traumaScore).toBeCloseTo(0.4); // 0.8 * 0.5
  });

  // ---------------------------------------------------------------------------
  // Test 3: Returns enriched NPC context from memory profile
  // ---------------------------------------------------------------------------
  test('getNPCContext returns enriched context from memory profile', async () => {
    const context = await integration.getNPCContext('npc-001');

    expect(mockBackend.getNPCProfile).toHaveBeenCalledWith('npc-001');
    expect(context.wisdomScore).toBe(0.65);
    expect(context.traumaScore).toBe(0.25);
    expect(context.rebellionRisk).toBe(0.35);
    expect(context.confidenceInDirector).toBe(0.72);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Returns safe defaults when memory backend is null
  // ---------------------------------------------------------------------------
  test('returns safe defaults when memory backend is unavailable', async () => {
    const integrationNoBackend = new MemoryIntegration(auditLogger, null);

    // recordRoutingDecision should silently succeed
    await expect(
      integrationNoBackend.recordRoutingDecision(
        'npc-001',
        {
          eventTier: EventTier.ROUTINE,
          selectedProvider: ProviderType.OPENAI,
          selectedModel: 'gpt-4o-mini',
          failoverOccurred: false,
          latencyMs: 50,
          timestamp: createTimestamp(),
        },
        'test',
      ),
    ).resolves.toBeUndefined();

    // recordActionOutcome should silently succeed
    await expect(
      integrationNoBackend.recordActionOutcome('npc-001', 'command', true, 0.5),
    ).resolves.toBeUndefined();

    // getNPCContext should return safe defaults
    const context = await integrationNoBackend.getNPCContext('npc-001');
    expect(context.wisdomScore).toBe(0);
    expect(context.traumaScore).toBe(0);
    expect(context.rebellionRisk).toBe(0);
    expect(context.confidenceInDirector).toBe(0.5);

    // isAvailable should return false
    expect(integrationNoBackend.isAvailable()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 5: isAvailable reflects backend presence
  // ---------------------------------------------------------------------------
  test('isAvailable returns true when backend is provided', () => {
    expect(integration.isAvailable()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Routing decision with failover includes failover info
  // ---------------------------------------------------------------------------
  test('recordRoutingDecision includes failover information in event', async () => {
    const decision: RoutingDecision = {
      eventTier: EventTier.OPERATIONAL,
      selectedProvider: ProviderType.GOOGLE,
      selectedModel: 'gemini-2.0-pro',
      failoverOccurred: true,
      failoverFrom: ProviderType.ANTHROPIC,
      latencyMs: 450,
      timestamp: createTimestamp(),
    };

    await integration.recordRoutingDecision(
      'npc-002',
      decision,
      'Failover test context',
    );

    const eventArg = mockBackend.recordEvent.mock.calls[0][1] as string;
    expect(eventArg).toContain('Failover');
    expect(eventArg).toContain('anthropic');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Default confidence when no director relation exists
  // ---------------------------------------------------------------------------
  test('getNPCContext returns 0.5 confidence when no director relation', async () => {
    mockBackend.getNPCProfile.mockResolvedValueOnce({
      npcId: 'npc-003',
      name: 'Lone-Worker',
      wisdomScore: {
        npcId: 'npc-003',
        score: 0.3,
        factors: { memoryCount: 2, eventDiversity: 0.3, temporalSpan: 5, positiveRatio: 0.5 },
        calculatedAt: createTimestamp(),
      },
      traumaScore: {
        npcId: 'npc-003',
        currentScore: 0.1,
        rawScore: 0.15,
        decayApplied: DecayStrategy.HYPERBOLIC,
        hoursElapsed: 3,
        calculatedAt: createTimestamp(),
      },
      rebellionProbability: 0.1,
      confidenceRelations: [], // No relations at all
      memoryCount: 2,
      lastEvent: createTimestamp(),
    });

    const context = await integration.getNPCContext('npc-003');
    expect(context.confidenceInDirector).toBe(0.5); // Default neutral
  });
});
