import { ConfidenceManager, applyConfidenceDecay } from '../src/graph/confidence-edge';
import { CONFIDENCE_NEUTRAL } from '../../shared/types/memory';
import { ActionType } from '../../shared/types/npc';
import type { Neo4jConnectionPool } from '../src/graph/connection-pool';

// =============================================================================
// Wave 47 — Confidence Decay Tests
//
// Verifies that NPC trust in the Director decays toward NEUTRAL (0.5) over
// time using hyperbolic decay, not toward zero like trauma.
// =============================================================================

function createMockPool(runResult: any = { records: [] }): Neo4jConnectionPool {
  const mockSession = {
    run: jest.fn().mockResolvedValue(runResult),
    close: jest.fn().mockResolvedValue(undefined),
  };

  return {
    withSession: jest.fn(async (fn: any) => fn(mockSession)),
    getSession: jest.fn().mockResolvedValue(mockSession),
    releaseSession: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as Neo4jConnectionPool;
}

function createMockRecord(data: Record<string, any>) {
  return {
    get: (key: string) => data[key],
    toObject: () => data,
  };
}

// =============================================================================
// Pure Function: applyConfidenceDecay
// =============================================================================

describe('applyConfidenceDecay (pure function)', () => {
  it('returns raw confidence at t=0', () => {
    expect(applyConfidenceDecay(0.9, 0.1, 0)).toBeCloseTo(0.9, 5);
    expect(applyConfidenceDecay(0.1, 0.1, 0)).toBeCloseTo(0.1, 5);
    expect(applyConfidenceDecay(0.5, 0.1, 0)).toBeCloseTo(0.5, 5);
  });

  it('high trust (0.9) decays toward neutral (0.5)', () => {
    // At t=10h, alpha=0.1: deviation=0.4, decay=1/(1+1)=0.5
    // result = 0.5 + 0.4*0.5 = 0.7
    const result = applyConfidenceDecay(0.9, 0.1, 10);
    expect(result).toBeCloseTo(0.7, 4);
    expect(result).toBeLessThan(0.9);
    expect(result).toBeGreaterThan(0.5);
  });

  it('low trust (0.1) decays toward neutral (0.5)', () => {
    // At t=10h, alpha=0.1: deviation=-0.4, decay=1/(1+1)=0.5
    // result = 0.5 + (-0.4)*0.5 = 0.3
    const result = applyConfidenceDecay(0.1, 0.1, 10);
    expect(result).toBeCloseTo(0.3, 4);
    expect(result).toBeGreaterThan(0.1);
    expect(result).toBeLessThan(0.5);
  });

  it('neutral (0.5) is unaffected by decay', () => {
    expect(applyConfidenceDecay(0.5, 0.1, 0)).toBeCloseTo(0.5, 5);
    expect(applyConfidenceDecay(0.5, 0.1, 100)).toBeCloseTo(0.5, 5);
    expect(applyConfidenceDecay(0.5, 0.1, 10000)).toBeCloseTo(0.5, 5);
  });

  it('never crosses neutral — high stays above, low stays below', () => {
    // Very large time: high trust should approach 0.5 from above
    const highDecayed = applyConfidenceDecay(0.95, 0.1, 1_000_000);
    expect(highDecayed).toBeGreaterThanOrEqual(0.5);
    expect(highDecayed).toBeLessThan(0.50001);

    // Very large time: low trust should approach 0.5 from below
    const lowDecayed = applyConfidenceDecay(0.05, 0.1, 1_000_000);
    expect(lowDecayed).toBeLessThanOrEqual(0.5);
    expect(lowDecayed).toBeGreaterThan(0.49999);
  });

  it('never exceeds [0, 1] bounds', () => {
    // Edge case: confidence at 0.0
    expect(applyConfidenceDecay(0.0, 0.1, 0)).toBeGreaterThanOrEqual(0);
    expect(applyConfidenceDecay(0.0, 0.1, 100)).toBeGreaterThanOrEqual(0);

    // Edge case: confidence at 1.0
    expect(applyConfidenceDecay(1.0, 0.1, 0)).toBeLessThanOrEqual(1);
    expect(applyConfidenceDecay(1.0, 0.1, 100)).toBeLessThanOrEqual(1);
  });

  it('higher alpha = faster decay toward neutral', () => {
    const slowDecay = applyConfidenceDecay(0.9, 0.05, 10);
    const fastDecay = applyConfidenceDecay(0.9, 0.5, 10);

    // Faster decay should be closer to neutral
    expect(Math.abs(fastDecay - 0.5)).toBeLessThan(Math.abs(slowDecay - 0.5));
  });

  it('handles negative hours gracefully (clamps to 0)', () => {
    // Negative time shouldn't cause issues
    const result = applyConfidenceDecay(0.8, 0.1, -5);
    expect(result).toBeCloseTo(0.8, 4); // Effectively t=0
  });

  it('CONFIDENCE_NEUTRAL constant is 0.5', () => {
    expect(CONFIDENCE_NEUTRAL).toBe(0.5);
  });
});

// =============================================================================
// ConfidenceManager.getDecayedConfidence
// =============================================================================

describe('ConfidenceManager.getDecayedConfidence', () => {
  it('returns null for nonexistent edge', async () => {
    const pool = createMockPool({ records: [] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidence('npc-1', 'director');
    expect(result).toBeNull();
  });

  it('returns decayed confidence for existing edge', async () => {
    // Confidence set 20 hours ago at 0.9, alpha=0.1
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const record = createMockRecord({
      confidence: 0.9,
      decayRate: 0.1,
      lastUpdated: twentyHoursAgo.toISOString(),
    });
    const pool = createMockPool({ records: [record] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidence('npc-1', 'director');

    expect(result).not.toBeNull();
    expect(result!.rawConfidence).toBe(0.9);
    expect(result!.decayedConfidence).toBeLessThan(0.9);
    expect(result!.decayedConfidence).toBeGreaterThan(0.5);
    expect(result!.hoursElapsed).toBeCloseTo(20, 0);
    expect(result!.npcId).toBe('npc-1');
    expect(result!.entityId).toBe('director');
  });

  it('very recent update has minimal decay', async () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const record = createMockRecord({
      confidence: 0.85,
      decayRate: 0.1,
      lastUpdated: oneMinuteAgo.toISOString(),
    });
    const pool = createMockPool({ records: [record] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidence('npc-1', 'director');
    expect(result!.decayedConfidence).toBeCloseTo(0.85, 1);
  });

  it('very old update decays close to neutral', async () => {
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const record = createMockRecord({
      confidence: 0.95,
      decayRate: 0.1,
      lastUpdated: yearAgo.toISOString(),
    });
    const pool = createMockPool({ records: [record] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidence('npc-1', 'director');
    expect(result!.decayedConfidence).toBeCloseTo(0.5, 1);
  });
});

// =============================================================================
// ConfidenceManager.getDecayedConfidenceRelations
// =============================================================================

describe('ConfidenceManager.getDecayedConfidenceRelations', () => {
  it('returns empty array for NPC with no relations', async () => {
    const pool = createMockPool({ records: [] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidenceRelations('npc-lonely');
    expect(result).toEqual([]);
  });

  it('applies decay to all relations', async () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const records = [
      createMockRecord({
        entityId: 'director',
        confidence: 0.9,
        decayRate: 0.1,
        lastUpdated: tenHoursAgo.toISOString(),
      }),
      createMockRecord({
        entityId: 'npc-ally',
        confidence: 0.2,
        decayRate: 0.1,
        lastUpdated: tenHoursAgo.toISOString(),
      }),
    ];
    const pool = createMockPool({ records });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getDecayedConfidenceRelations('npc-1');
    expect(result).toHaveLength(2);

    // High trust decays down
    const director = result.find((r) => r.entityId === 'director')!;
    expect(director.rawConfidence).toBe(0.9);
    expect(director.decayedConfidence).toBeLessThan(0.9);
    expect(director.decayedConfidence).toBeGreaterThan(0.5);

    // Low trust decays up
    const ally = result.find((r) => r.entityId === 'npc-ally')!;
    expect(ally.rawConfidence).toBe(0.2);
    expect(ally.decayedConfidence).toBeGreaterThan(0.2);
    expect(ally.decayedConfidence).toBeLessThan(0.5);
  });
});

// =============================================================================
// Auto-Director confidence update on recordEvent
// =============================================================================

describe('Confidence auto-update from events', () => {
  it('REWARD action type exists in ActionType enum', () => {
    expect(ActionType.REWARD).toBe('reward');
    expect(ActionType.PUNISHMENT).toBe('punishment');
    expect(ActionType.COMMAND).toBe('command');
    expect(ActionType.DIALOGUE).toBe('dialogue');
  });

  it('updateConfidenceFromAction with new relationship defaults to 0.5', async () => {
    // No existing record → defaults to 0.5
    const pool = createMockPool({ records: [] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.updateConfidenceFromAction(
      'npc-new',
      'director',
      ActionType.REWARD,
      0.8,
    );

    // From 0.5 default + 0.8*0.1 = 0.58
    expect(result.confidence).toBeCloseTo(0.58, 5);
  });
});
