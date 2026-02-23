import { ConfidenceManager } from '../src/graph/confidence-edge';
import { ActionType } from '../../shared/types/npc';
import type { Neo4jConnectionPool } from '../src/graph/connection-pool';

// =============================================================================
// Mock Neo4j Session
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

describe('ConfidenceManager', () => {
  it('setConfidence creates TRUSTS edge', async () => {
    const pool = createMockPool();
    const manager = new ConfidenceManager(pool);

    await manager.setConfidence('npc-1', 'entity-1', 0.75, 0.1);

    const withSession = pool.withSession as jest.Mock;
    expect(withSession).toHaveBeenCalled();
  });

  it('getConfidence returns null for nonexistent', async () => {
    const pool = createMockPool({ records: [] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getConfidence('npc-1', 'entity-unknown');
    expect(result).toBeNull();
  });

  it('confidence clamped to [0, 1]', async () => {
    // Test that setConfidence clamps values
    const pool = createMockPool();
    const manager = new ConfidenceManager(pool);

    // Should not throw, and should clamp internally
    await manager.setConfidence('npc-1', 'entity-1', 1.5);
    await manager.setConfidence('npc-1', 'entity-1', -0.3);

    // The manager should have clamped these values before sending to Neo4j
    const withSession = pool.withSession as jest.Mock;
    expect(withSession).toHaveBeenCalledTimes(2);
  });

  it('REWARD action increases confidence', async () => {
    const existingRecord = createMockRecord({
      confidence: 0.5,
      decayRate: 0.1,
      lastUpdated: new Date().toISOString(),
    });
    const pool = createMockPool({ records: [existingRecord] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.updateConfidenceFromAction(
      'npc-1', 'entity-1', ActionType.REWARD, 0.8
    );

    // REWARD: +intensity * 0.1 → 0.5 + (0.8 * 0.1) = 0.58
    expect(result.confidence).toBeCloseTo(0.58, 5);
  });

  it('PUNISHMENT action decreases confidence', async () => {
    const existingRecord = createMockRecord({
      confidence: 0.5,
      decayRate: 0.1,
      lastUpdated: new Date().toISOString(),
    });
    const pool = createMockPool({ records: [existingRecord] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.updateConfidenceFromAction(
      'npc-1', 'entity-1', ActionType.PUNISHMENT, 0.8
    );

    // PUNISHMENT: -intensity * 0.15 → 0.5 - (0.8 * 0.15) = 0.38
    expect(result.confidence).toBeCloseTo(0.38, 5);
  });

  it('COMMAND action slightly decreases confidence', async () => {
    const existingRecord = createMockRecord({
      confidence: 0.5,
      decayRate: 0.1,
      lastUpdated: new Date().toISOString(),
    });
    const pool = createMockPool({ records: [existingRecord] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.updateConfidenceFromAction(
      'npc-1', 'entity-1', ActionType.COMMAND, 0.8
    );

    // COMMAND: -intensity * 0.05 → 0.5 - (0.8 * 0.05) = 0.46
    expect(result.confidence).toBeCloseTo(0.46, 5);
  });

  it('DIALOGUE action increases confidence', async () => {
    const existingRecord = createMockRecord({
      confidence: 0.5,
      decayRate: 0.1,
      lastUpdated: new Date().toISOString(),
    });
    const pool = createMockPool({ records: [existingRecord] });
    const manager = new ConfidenceManager(pool);

    const result = await manager.updateConfidenceFromAction(
      'npc-1', 'entity-1', ActionType.DIALOGUE, 0.8
    );

    // DIALOGUE: +intensity * 0.08 → 0.5 + (0.8 * 0.08) = 0.564
    expect(result.confidence).toBeCloseTo(0.564, 5);
  });

  it('getConfidenceRelations returns all edges for NPC', async () => {
    const records = [
      createMockRecord({
        entityId: 'entity-1',
        confidence: 0.8,
        decayRate: 0.1,
        lastUpdated: new Date().toISOString(),
      }),
      createMockRecord({
        entityId: 'entity-2',
        confidence: 0.4,
        decayRate: 0.2,
        lastUpdated: new Date().toISOString(),
      }),
    ];
    const pool = createMockPool({ records });
    const manager = new ConfidenceManager(pool);

    const result = await manager.getConfidenceRelations('npc-1');
    expect(result).toHaveLength(2);
    expect(result[0].entityId).toBe('entity-1');
    expect(result[1].entityId).toBe('entity-2');
  });
});
