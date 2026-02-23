import { v4 as uuidv4 } from 'uuid';
import { getTestPool, closeTestPool, cleanupTestData } from './neo4j-test-helper';
import { Neo4jConnectionPool } from '../../src/graph/connection-pool';
import { NPCMemoryGraph } from '../../src/graph/npc-memory';
import type { MemoryNode } from '../../../shared/types/memory';

// =============================================================================
// TRAUMA DECAY — Integration Tests
//
// Tests that trauma scoring with time-based hyperbolic decay works correctly
// against a real Neo4j instance. Validates:
//   - Fresh memories retain full trauma score
//   - Older memories show decayed trauma
//   - Rebellion probability incorporates decayed trauma
//
// Uses unique test prefix 'test-trauma-' for data isolation.
//
// Skips gracefully when Neo4j is not available.
// =============================================================================

let pool: Neo4jConnectionPool | null = null;
let memoryGraph: NPCMemoryGraph | null = null;
const TEST_PREFIX = 'test-trauma-';

/** Helper to create a MemoryNode with sensible defaults. */
function createTestMemory(
  npcId: string,
  overrides: Partial<MemoryNode> = {},
): MemoryNode {
  const now = Date.now();
  return {
    memoryId: `${TEST_PREFIX}${uuidv4()}`,
    npcId,
    event: 'traumatic-event',
    playerAction: 'punishment',
    wisdomScore: 0.3,
    traumaScore: 0.8,
    rawTraumaScore: 0.8,
    timestamp: {
      iso8601: new Date(now).toISOString(),
      unixMs: now,
    },
    ...overrides,
  };
}

beforeAll(async () => {
  pool = await getTestPool();
  if (!pool) {
    console.warn('[SKIP] Neo4j not available — skipping trauma decay integration tests');
    return;
  }
  memoryGraph = new NPCMemoryGraph(pool);
});

afterAll(async () => {
  if (pool) {
    await cleanupTestData(pool, TEST_PREFIX);
  }
  await closeTestPool();
});

describe('Trauma Decay (Integration)', () => {
  it('should return full trauma score for a fresh memory (no decay)', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-fresh-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Record a single memory with high trauma, timestamped right now
    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        traumaScore: 0.9,
        rawTraumaScore: 0.9,
        timestamp: { iso8601: new Date(now).toISOString(), unixMs: now },
      }),
    );

    // getRebellionProbability uses TraumaScorer internally
    // For a fresh memory (0 hours elapsed), hyperbolic decay = score * 1/(1+0.1*0) = score
    // rebellion = 0.05 + (currentTrauma * 0.6)
    // With near-zero elapsed time, currentTrauma ~ rawTrauma = 0.9
    const rebellionProb = await memoryGraph.getRebellionProbability(npcId);

    // Expected: 0.05 + (0.9 * 0.6) = 0.05 + 0.54 = 0.59
    // Allow small tolerance for millisecond-level decay
    expect(rebellionProb).toBeGreaterThan(0.5);
    expect(rebellionProb).toBeLessThanOrEqual(1.0);

    // Also check via getNPCState which includes trauma
    const state = await memoryGraph.getNPCState(npcId);
    expect(state).not.toBeNull();
    expect(state!.traumaScore).toBeCloseTo(0.9, 1);
  });

  it('should show decayed trauma for an older memory (hyperbolic)', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-old-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Record a memory from 48 hours ago with high trauma
    const hoursAgo = 48;
    const oldTimestamp = now - hoursAgo * 60 * 60 * 1000;

    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        traumaScore: 0.8,
        rawTraumaScore: 0.8,
        timestamp: { iso8601: new Date(oldTimestamp).toISOString(), unixMs: oldTimestamp },
      }),
    );

    // Hyperbolic decay: score * 1/(1 + alpha * hours)
    // With default alpha=0.1, hoursElapsed=48:
    //   decayed = 0.8 * 1/(1 + 0.1 * 48) = 0.8 * 1/5.8 ~ 0.138
    //
    // Rebellion = 0.05 + (0.138 * 0.6) ~ 0.133
    const rebellionProb = await memoryGraph.getRebellionProbability(npcId);

    // The rebellion probability should be significantly lower than for a fresh memory
    // Fresh 0.8 trauma would give ~0.53; after 48h decay it should be much less
    expect(rebellionProb).toBeLessThan(0.3);
    expect(rebellionProb).toBeGreaterThanOrEqual(0.05); // At minimum the base rate
  });

  it('should incorporate decayed trauma correctly into rebellion probability', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-mixed-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Record two memories: one fresh (high trauma), one old (high trauma but decayed)
    // Fresh memory: 0.7 trauma, just now
    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        traumaScore: 0.7,
        rawTraumaScore: 0.7,
        timestamp: { iso8601: new Date(now).toISOString(), unixMs: now },
      }),
    );

    // Old memory: 0.7 trauma, 100 hours ago
    const oldTimestamp = now - 100 * 60 * 60 * 1000;
    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        traumaScore: 0.7,
        rawTraumaScore: 0.7,
        timestamp: { iso8601: new Date(oldTimestamp).toISOString(), unixMs: oldTimestamp },
      }),
    );

    const rebellionProb = await memoryGraph.getRebellionProbability(npcId);

    // TraumaScorer averages decayed scores:
    //   Fresh: 0.7 * 1/(1+0.1*~0) ~ 0.7
    //   Old: 0.7 * 1/(1+0.1*100) = 0.7 * 1/11 ~ 0.064
    //   Average: (0.7 + 0.064) / 2 ~ 0.382
    //   Rebellion: 0.05 + (0.382 * 0.6) ~ 0.279

    // The rebellion probability should be between:
    //   - Pure fresh (0.05 + 0.7*0.6 = 0.47) — if both memories were fresh
    //   - Pure old (0.05 + 0.064*0.6 = 0.088) — if both were 100h old
    expect(rebellionProb).toBeGreaterThan(0.1);
    expect(rebellionProb).toBeLessThan(0.47);

    // The result should be bounded in [0, 1]
    expect(rebellionProb).toBeGreaterThanOrEqual(0);
    expect(rebellionProb).toBeLessThanOrEqual(1);
  });
});
