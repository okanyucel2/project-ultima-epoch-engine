import { v4 as uuidv4 } from 'uuid';
import { getTestPool, closeTestPool, cleanupTestData } from './neo4j-test-helper';
import { Neo4jConnectionPool } from '../../src/graph/connection-pool';
import { NPCMemoryGraph } from '../../src/graph/npc-memory';
import type { MemoryNode } from '../../../shared/types/memory';

// =============================================================================
// NPC MEMORY CRUD — Integration Tests
//
// Tests recordMemory, getMemories, getNPCState against a real Neo4j instance.
// Uses unique test prefix 'test-crud-' for data isolation.
//
// Skips gracefully when Neo4j is not available.
// =============================================================================

let pool: Neo4jConnectionPool | null = null;
let memoryGraph: NPCMemoryGraph | null = null;
const TEST_PREFIX = 'test-crud-';

/** Helper to create a MemoryNode with sensible defaults. */
function createTestMemory(
  npcId: string,
  overrides: Partial<MemoryNode> = {},
): MemoryNode {
  const now = Date.now();
  return {
    memoryId: `${TEST_PREFIX}${uuidv4()}`,
    npcId,
    event: 'test-event',
    playerAction: 'reward',
    wisdomScore: 0.5,
    traumaScore: 0.3,
    rawTraumaScore: 0.3,
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
    console.warn('[SKIP] Neo4j not available — skipping NPC memory CRUD integration tests');
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

describe('NPC Memory CRUD (Integration)', () => {
  it('should record a memory and retrieve it by npcId', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-record-${uuidv4().slice(0, 8)}`;
    const memory = createTestMemory(npcId, {
      event: 'player gave food',
      playerAction: 'reward',
      wisdomScore: 0.6,
      traumaScore: 0.1,
      rawTraumaScore: 0.1,
    });

    await memoryGraph.recordMemory(memory);
    const memories = await memoryGraph.getMemories(npcId);

    expect(memories).toHaveLength(1);
    expect(memories[0].memoryId).toBe(memory.memoryId);
    expect(memories[0].event).toBe('player gave food');
    expect(memories[0].playerAction).toBe('reward');
    expect(memories[0].wisdomScore).toBeCloseTo(0.6, 5);
    expect(memories[0].traumaScore).toBeCloseTo(0.1, 5);
  });

  it('should return multiple memories in reverse chronological order', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-chrono-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Create three memories at different times
    const memories = [
      createTestMemory(npcId, {
        event: 'event-oldest',
        timestamp: { iso8601: new Date(now - 3000).toISOString(), unixMs: now - 3000 },
      }),
      createTestMemory(npcId, {
        event: 'event-middle',
        timestamp: { iso8601: new Date(now - 1000).toISOString(), unixMs: now - 1000 },
      }),
      createTestMemory(npcId, {
        event: 'event-newest',
        timestamp: { iso8601: new Date(now).toISOString(), unixMs: now },
      }),
    ];

    for (const m of memories) {
      await memoryGraph.recordMemory(m);
    }

    const retrieved = await memoryGraph.getMemories(npcId);

    expect(retrieved).toHaveLength(3);
    // Most recent first (DESC order)
    expect(retrieved[0].event).toBe('event-newest');
    expect(retrieved[1].event).toBe('event-middle');
    expect(retrieved[2].event).toBe('event-oldest');
  });

  it('should return aggregated NPC state with getNPCState', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-state-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Record two memories with known scores
    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        wisdomScore: 0.4,
        traumaScore: 0.2,
        rawTraumaScore: 0.2,
        timestamp: { iso8601: new Date(now - 1000).toISOString(), unixMs: now - 1000 },
      }),
    );
    await memoryGraph.recordMemory(
      createTestMemory(npcId, {
        wisdomScore: 0.8,
        traumaScore: 0.6,
        rawTraumaScore: 0.6,
        timestamp: { iso8601: new Date(now).toISOString(), unixMs: now },
      }),
    );

    const state = await memoryGraph.getNPCState(npcId);

    expect(state).not.toBeNull();
    expect(state!.npcId).toBe(npcId);
    expect(state!.memoryCount).toBe(2);

    // avgWisdom = (0.4 + 0.8) / 2 = 0.6
    expect(state!.wisdomScore).toBeCloseTo(0.6, 1);
    // avgTrauma = (0.2 + 0.6) / 2 = 0.4
    expect(state!.traumaScore).toBeCloseTo(0.4, 1);

    // rebellionProbability should be a number in [0, 1]
    expect(state!.rebellionProbability).toBeGreaterThanOrEqual(0);
    expect(state!.rebellionProbability).toBeLessThanOrEqual(1);

    // workEfficiency and morale should be derived values in [0, 1]
    expect(state!.workEfficiency).toBeGreaterThanOrEqual(0);
    expect(state!.workEfficiency).toBeLessThanOrEqual(1);
    expect(state!.morale).toBeGreaterThanOrEqual(0);
    expect(state!.morale).toBeLessThanOrEqual(1);
  });

  it('should respect getMemories limit parameter', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-limit-${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Record 5 memories
    for (let i = 0; i < 5; i++) {
      await memoryGraph.recordMemory(
        createTestMemory(npcId, {
          event: `event-${i}`,
          timestamp: { iso8601: new Date(now + i * 1000).toISOString(), unixMs: now + i * 1000 },
        }),
      );
    }

    // Retrieve with limit=2
    const limited = await memoryGraph.getMemories(npcId, 2);
    expect(limited).toHaveLength(2);

    // Should be the two most recent
    expect(limited[0].event).toBe('event-4');
    expect(limited[1].event).toBe('event-3');
  });

  it('should return null for non-existent NPC state', async () => {
    if (!pool || !memoryGraph) return;

    const npcId = `${TEST_PREFIX}npc-nonexistent-${uuidv4().slice(0, 8)}`;
    const state = await memoryGraph.getNPCState(npcId);

    expect(state).toBeNull();
  });
});
