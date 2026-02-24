import neo4j from 'neo4j-driver';
import { getTestPool, closeTestPool } from './neo4j-test-helper';
import { Neo4jConnectionPool } from '../../src/graph/connection-pool';

// =============================================================================
// NEO4J CONNECTION POOL — Integration Tests
//
// Validates that the Neo4j driver connects, sessions are managed properly,
// and health checks report accurate status.
//
// Skips gracefully when Neo4j is not available.
// =============================================================================

let pool: Neo4jConnectionPool | null = null;

beforeAll(async () => {
  pool = await getTestPool();
  if (!pool) {
    console.warn('[SKIP] Neo4j not available — skipping connection integration tests');
  }
});

afterAll(async () => {
  await closeTestPool();
});

describe('Neo4j Connection Pool (Integration)', () => {
  it('should connect to Neo4j and pass health check', async () => {
    if (!pool) return;

    const healthy = await pool.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should acquire and release sessions correctly', async () => {
    if (!pool) return;

    // Acquire a session via withSession — should auto-release
    const result = await pool.withSession(async (session) => {
      const res = await session.run('RETURN 42 AS answer');
      const value = res.records[0].get('answer');
      return neo4j.isInt(value) ? value.toNumber() : value;
    });

    expect(result).toBe(42);

    // After withSession completes, the session count should return to 0
    expect(pool.activeSessionCount).toBe(0);
  });

  it('should return false for health check with bad connection', async () => {
    if (!pool) return;

    // Create a pool pointing to a wrong port — should fail health check
    const badPool = new Neo4jConnectionPool(
      'bolt://localhost:19999',
      'neo4j',
      'wrong-password',
      { maxSessions: 1, acquireTimeoutMs: 2000 },
    );

    try {
      const healthy = await badPool.healthCheck();
      expect(healthy).toBe(false);
    } finally {
      await badPool.close();
    }
  });
});
