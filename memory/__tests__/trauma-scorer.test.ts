import { TraumaScorer } from '../src/trauma/trauma-scorer';
import { DecayStrategy } from '../../shared/types/memory';
import type { DecayConfig } from '../../shared/types/memory';
import type { Neo4jConnectionPool } from '../src/graph/connection-pool';

// =============================================================================
// Mock Neo4j Session
// =============================================================================

function createMockRecord(data: Record<string, any>) {
  return {
    get: (key: string) => data[key],
    toObject: () => data,
  };
}

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

const defaultDecayConfig: DecayConfig = {
  strategy: DecayStrategy.HYPERBOLIC,
  alpha: 0.1,
  lambda: 0.05,
  linearRate: 0.01,
};

describe('TraumaScorer', () => {
  it('returns 0 for NPC with no trauma', async () => {
    const pool = createMockPool({ records: [] });
    const scorer = new TraumaScorer(pool, defaultDecayConfig);

    const result = await scorer.calculateTrauma('npc-happy');
    expect(result.currentScore).toBe(0);
    expect(result.rawScore).toBe(0);
    expect(result.npcId).toBe('npc-happy');
  });

  it('applies hyperbolic decay correctly', async () => {
    const now = Date.now();
    const tenHoursAgo = now - (10 * 60 * 60 * 1000);

    const pool = createMockPool({
      records: [
        createMockRecord({
          traumaScore: 0.8,
          timestamp: tenHoursAgo,
        }),
      ],
    });
    const scorer = new TraumaScorer(pool, defaultDecayConfig);

    const result = await scorer.calculateTrauma('npc-traumatized');
    // hyperbolic: 0.8 * 1/(1 + 0.1 * 10) = 0.8 * 0.5 = 0.4
    expect(result.currentScore).toBeCloseTo(0.4, 1);
    expect(result.decayApplied).toBe(DecayStrategy.HYPERBOLIC);
  });

  it('recent trauma scores higher than old trauma', async () => {
    const now = Date.now();
    const oneHourAgo = now - (1 * 60 * 60 * 1000);
    const hundredHoursAgo = now - (100 * 60 * 60 * 1000);

    const recentPool = createMockPool({
      records: [
        createMockRecord({ traumaScore: 0.8, timestamp: oneHourAgo }),
      ],
    });
    const oldPool = createMockPool({
      records: [
        createMockRecord({ traumaScore: 0.8, timestamp: hundredHoursAgo }),
      ],
    });

    const recentScorer = new TraumaScorer(recentPool, defaultDecayConfig);
    const oldScorer = new TraumaScorer(oldPool, defaultDecayConfig);

    const recentResult = await recentScorer.calculateTrauma('npc-1');
    const oldResult = await oldScorer.calculateTrauma('npc-1');

    expect(recentResult.currentScore).toBeGreaterThan(oldResult.currentScore);
  });

  it('raw score is preserved separately', async () => {
    const now = Date.now();
    const tenHoursAgo = now - (10 * 60 * 60 * 1000);

    const pool = createMockPool({
      records: [
        createMockRecord({ traumaScore: 0.9, timestamp: tenHoursAgo }),
      ],
    });
    const scorer = new TraumaScorer(pool, defaultDecayConfig);

    const result = await scorer.calculateTrauma('npc-1');
    expect(result.rawScore).toBeCloseTo(0.9, 5);
    expect(result.currentScore).toBeLessThan(result.rawScore);
  });

  it('aggregate uses weighted average', async () => {
    const now = Date.now();
    const fiveHoursAgo = now - (5 * 60 * 60 * 1000);
    const twentyHoursAgo = now - (20 * 60 * 60 * 1000);

    const pool = createMockPool({
      records: [
        createMockRecord({ traumaScore: 0.8, timestamp: fiveHoursAgo }),
        createMockRecord({ traumaScore: 0.6, timestamp: twentyHoursAgo }),
      ],
    });
    const scorer = new TraumaScorer(pool, defaultDecayConfig);

    const result = await scorer.calculateTrauma('npc-multi');
    // Both should be decayed and averaged
    // 0.8 * 1/(1+0.1*5) = 0.8 * 1/1.5 ≈ 0.533
    // 0.6 * 1/(1+0.1*20) = 0.6 * 1/3 ≈ 0.200
    // Weighted avg = (0.533 + 0.200) / 2 ≈ 0.367
    expect(result.currentScore).toBeGreaterThan(0);
    expect(result.currentScore).toBeLessThan(0.8);
  });

  it('config alpha affects decay rate', async () => {
    const now = Date.now();
    const tenHoursAgo = now - (10 * 60 * 60 * 1000);

    const slowDecayConfig: DecayConfig = {
      strategy: DecayStrategy.HYPERBOLIC,
      alpha: 0.01,  // Slow decay
      lambda: 0.05,
      linearRate: 0.01,
    };
    const fastDecayConfig: DecayConfig = {
      strategy: DecayStrategy.HYPERBOLIC,
      alpha: 1.0,   // Fast decay
      lambda: 0.05,
      linearRate: 0.01,
    };

    const slowPool = createMockPool({
      records: [createMockRecord({ traumaScore: 0.8, timestamp: tenHoursAgo })],
    });
    const fastPool = createMockPool({
      records: [createMockRecord({ traumaScore: 0.8, timestamp: tenHoursAgo })],
    });

    const slowScorer = new TraumaScorer(slowPool, slowDecayConfig);
    const fastScorer = new TraumaScorer(fastPool, fastDecayConfig);

    const slowResult = await slowScorer.calculateTrauma('npc-1');
    const fastResult = await fastScorer.calculateTrauma('npc-1');

    // Slow decay preserves more trauma
    expect(slowResult.currentScore).toBeGreaterThan(fastResult.currentScore);
  });
});
