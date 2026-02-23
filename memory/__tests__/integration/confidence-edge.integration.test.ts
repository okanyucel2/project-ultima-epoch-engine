import { v4 as uuidv4 } from 'uuid';
import { getTestPool, closeTestPool, cleanupTestData } from './neo4j-test-helper';
import { Neo4jConnectionPool } from '../../src/graph/connection-pool';
import { ConfidenceManager } from '../../src/graph/confidence-edge';
import { ActionType } from '../../../shared/types/npc';

// =============================================================================
// CONFIDENCE EDGE — Integration Tests
//
// Tests setConfidence, updateConfidenceFromAction, getConfidence, and
// getConfidenceRelations against a real Neo4j instance.
//
// Uses unique test prefix 'test-conf-' for data isolation.
//
// Skips gracefully when Neo4j is not available.
// =============================================================================

let pool: Neo4jConnectionPool | null = null;
let confidenceManager: ConfidenceManager | null = null;
const TEST_PREFIX = 'test-conf-';

beforeAll(async () => {
  pool = await getTestPool();
  if (!pool) {
    console.warn('[SKIP] Neo4j not available — skipping confidence edge integration tests');
    return;
  }
  confidenceManager = new ConfidenceManager(pool);
});

afterAll(async () => {
  if (pool) {
    await cleanupTestData(pool, TEST_PREFIX);
  }
  await closeTestPool();
});

describe('Confidence Edge (Integration)', () => {
  it('should set confidence and read it back', async () => {
    if (!pool || !confidenceManager) return;

    const npcId = `${TEST_PREFIX}npc-set-${uuidv4().slice(0, 8)}`;
    const entityId = `${TEST_PREFIX}entity-set-${uuidv4().slice(0, 8)}`;

    // Set confidence to 0.75
    await confidenceManager.setConfidence(npcId, entityId, 0.75);

    // Read it back
    const edge = await confidenceManager.getConfidence(npcId, entityId);

    expect(edge).not.toBeNull();
    expect(edge!.npcId).toBe(npcId);
    expect(edge!.entityId).toBe(entityId);
    expect(edge!.confidence).toBeCloseTo(0.75, 5);
    expect(edge!.decayRate).toBeCloseTo(0.1, 5); // default decay rate
  });

  it('should increase confidence from REWARD action', async () => {
    if (!pool || !confidenceManager) return;

    const npcId = `${TEST_PREFIX}npc-reward-${uuidv4().slice(0, 8)}`;
    const entityId = `${TEST_PREFIX}entity-reward-${uuidv4().slice(0, 8)}`;

    // Set initial confidence to 0.5
    await confidenceManager.setConfidence(npcId, entityId, 0.5);

    // Apply REWARD with intensity 0.8
    // Expected: 0.5 + (0.8 * 0.1) = 0.58
    const result = await confidenceManager.updateConfidenceFromAction(
      npcId,
      entityId,
      ActionType.REWARD,
      0.8,
    );

    expect(result.confidence).toBeCloseTo(0.58, 5);

    // Verify persisted in Neo4j
    const persisted = await confidenceManager.getConfidence(npcId, entityId);
    expect(persisted).not.toBeNull();
    expect(persisted!.confidence).toBeCloseTo(0.58, 5);
  });

  it('should decrease confidence from PUNISHMENT action', async () => {
    if (!pool || !confidenceManager) return;

    const npcId = `${TEST_PREFIX}npc-punish-${uuidv4().slice(0, 8)}`;
    const entityId = `${TEST_PREFIX}entity-punish-${uuidv4().slice(0, 8)}`;

    // Set initial confidence to 0.5
    await confidenceManager.setConfidence(npcId, entityId, 0.5);

    // Apply PUNISHMENT with intensity 0.8
    // Expected: 0.5 - (0.8 * 0.15) = 0.38
    const result = await confidenceManager.updateConfidenceFromAction(
      npcId,
      entityId,
      ActionType.PUNISHMENT,
      0.8,
    );

    expect(result.confidence).toBeCloseTo(0.38, 5);

    // Verify persisted in Neo4j
    const persisted = await confidenceManager.getConfidence(npcId, entityId);
    expect(persisted).not.toBeNull();
    expect(persisted!.confidence).toBeCloseTo(0.38, 5);
  });

  it('should return all confidence relations for an NPC', async () => {
    if (!pool || !confidenceManager) return;

    const npcId = `${TEST_PREFIX}npc-rels-${uuidv4().slice(0, 8)}`;
    const entity1 = `${TEST_PREFIX}entity-rels-1-${uuidv4().slice(0, 8)}`;
    const entity2 = `${TEST_PREFIX}entity-rels-2-${uuidv4().slice(0, 8)}`;
    const entity3 = `${TEST_PREFIX}entity-rels-3-${uuidv4().slice(0, 8)}`;

    // Set confidence to three different entities
    await confidenceManager.setConfidence(npcId, entity1, 0.9);
    await confidenceManager.setConfidence(npcId, entity2, 0.5);
    await confidenceManager.setConfidence(npcId, entity3, 0.2);

    // Retrieve all relations
    const relations = await confidenceManager.getConfidenceRelations(npcId);

    expect(relations).toHaveLength(3);

    // Check that all entities are present (order not guaranteed)
    const entityIds = relations.map((r) => r.entityId).sort();
    expect(entityIds).toEqual([entity1, entity2, entity3].sort());

    // Verify confidence values match
    const byEntity = new Map(relations.map((r) => [r.entityId, r.confidence]));
    expect(byEntity.get(entity1)).toBeCloseTo(0.9, 5);
    expect(byEntity.get(entity2)).toBeCloseTo(0.5, 5);
    expect(byEntity.get(entity3)).toBeCloseTo(0.2, 5);
  });
});
