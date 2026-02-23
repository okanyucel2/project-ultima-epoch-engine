import { WisdomScorer } from '../src/wisdom/wisdom-scorer';
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

function createMockPool(runResponses: any[]): Neo4jConnectionPool {
  let callIndex = 0;
  const mockSession = {
    run: jest.fn().mockImplementation(() => {
      const response = runResponses[callIndex] ?? { records: [] };
      callIndex++;
      return Promise.resolve(response);
    }),
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

describe('WisdomScorer', () => {
  it('returns score 0 for NPC with no memories', async () => {
    const pool = createMockPool([
      { records: [createMockRecord({ count: 0 })] },                // memoryCount
      { records: [createMockRecord({ distinct: 0, total: 0 })] },   // eventDiversity
      { records: [createMockRecord({ minTs: null, maxTs: null })] }, // temporalSpan
      { records: [createMockRecord({ positive: 0, total: 0 })] },   // positiveRatio
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-empty');
    expect(result.score).toBe(0);
    expect(result.npcId).toBe('npc-empty');
  });

  it('score increases with memory count', async () => {
    // 50 memories = log(50)/log(100) ≈ 0.849
    const pool = createMockPool([
      { records: [createMockRecord({ count: 50 })] },
      { records: [createMockRecord({ distinct: 1, total: 6 })] },
      { records: [createMockRecord({ minTs: null, maxTs: null })] },
      { records: [createMockRecord({ positive: 0, total: 50 })] },
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-1');
    // memoryCount factor = log(50)/log(100) ≈ 0.849, weight 0.25 → ≈ 0.212
    expect(result.factors.memoryCount).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('score increases with event diversity', async () => {
    const pool = createMockPool([
      { records: [createMockRecord({ count: 10 })] },
      { records: [createMockRecord({ distinct: 5, total: 6 })] },  // 5/6 diversity
      { records: [createMockRecord({ minTs: null, maxTs: null })] },
      { records: [createMockRecord({ positive: 5, total: 10 })] },
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-diverse');
    expect(result.factors.eventDiversity).toBeCloseTo(5 / 6, 2);
  });

  it('score considers temporal span', async () => {
    const now = Date.now();
    const twentyDaysAgo = now - (20 * 24 * 60 * 60 * 1000);
    const pool = createMockPool([
      { records: [createMockRecord({ count: 10 })] },
      { records: [createMockRecord({ distinct: 3, total: 6 })] },
      { records: [createMockRecord({ minTs: twentyDaysAgo, maxTs: now })] },
      { records: [createMockRecord({ positive: 5, total: 10 })] },
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-temporal');
    // 20 days = 480 hours, cap at 720 → 480/720 ≈ 0.667
    expect(result.factors.temporalSpan).toBeCloseTo(480 / 720, 1);
  });

  it('score considers positive event ratio', async () => {
    const pool = createMockPool([
      { records: [createMockRecord({ count: 20 })] },
      { records: [createMockRecord({ distinct: 4, total: 6 })] },
      { records: [createMockRecord({ minTs: null, maxTs: null })] },
      { records: [createMockRecord({ positive: 15, total: 20 })] },
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-positive');
    expect(result.factors.positiveRatio).toBeCloseTo(0.75, 2);
  });

  it('score is capped at 1.0', async () => {
    const now = Date.now();
    const monthAgo = now - (31 * 24 * 60 * 60 * 1000);
    const pool = createMockPool([
      { records: [createMockRecord({ count: 200 })] },              // Max
      { records: [createMockRecord({ distinct: 6, total: 6 })] },   // Max diversity
      { records: [createMockRecord({ minTs: monthAgo, maxTs: now })] }, // Max span
      { records: [createMockRecord({ positive: 200, total: 200 })] }, // Max positive
    ]);
    const scorer = new WisdomScorer(pool);

    const result = await scorer.calculateWisdom('npc-max');
    expect(result.score).toBeLessThanOrEqual(1.0);
  });
});
