import { Neo4jConnectionPool } from '../../src/graph/connection-pool';

// =============================================================================
// NEO4J INTEGRATION TEST HELPER
//
// Manages a shared test pool with lazy initialization and graceful skip when
// Neo4j is not available (e.g., Docker not running, CI without services).
//
// Usage:
//   const pool = await getTestPool();
//   if (!pool) return; // skip test
// =============================================================================

let _pool: Neo4jConnectionPool | null = null;
let _available: boolean | null = null;

/**
 * Returns a shared Neo4jConnectionPool for integration tests.
 * Returns null if Neo4j is not reachable (tests should skip).
 *
 * The pool is lazily created on first call and reused across all test files
 * within the same Jest run. Connection availability is cached after the
 * first probe to avoid repeated timeout delays.
 */
export async function getTestPool(): Promise<Neo4jConnectionPool | null> {
  if (_available === false) return null;
  if (_pool) return _pool;

  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'epochengine';

  try {
    const pool = new Neo4jConnectionPool(uri, user, password, {
      maxSessions: 5,
      acquireTimeoutMs: 3000,
    });
    const healthy = await pool.healthCheck();
    if (healthy) {
      _pool = pool;
      _available = true;
      return pool;
    }
    // Health check returned false — Neo4j responded but is unhealthy
    await pool.close();
  } catch {
    // Neo4j not available — connection refused, timeout, etc.
  }

  _available = false;
  return null;
}

/**
 * Closes the shared test pool and resets cached state.
 * Call in the final afterAll() of the last test file, or in each file's
 * afterAll() (idempotent — subsequent calls are no-ops).
 */
export async function closeTestPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
    _available = null;
  }
}

/**
 * Removes all test data matching a given npc_id prefix.
 *
 * Each test file uses a unique prefix (e.g., 'test-crud-', 'test-conf-')
 * to isolate its data. This deletes NPC nodes, Memory nodes, Entity nodes,
 * and all relationships where the NPC id starts with the given prefix.
 *
 * @param pool - Active connection pool
 * @param testPrefix - The npc_id prefix to match for deletion
 */
export async function cleanupTestData(
  pool: Neo4jConnectionPool,
  testPrefix: string,
): Promise<void> {
  await pool.withSession(async (session) => {
    // Delete NPC nodes and their REMEMBERS relationships
    await session.run(
      'MATCH (npc:NPC) WHERE npc.id STARTS WITH $prefix DETACH DELETE npc',
      { prefix: testPrefix },
    );
    // Delete Entity nodes created for confidence tests
    await session.run(
      'MATCH (e:Entity) WHERE e.id STARTS WITH $prefix DETACH DELETE e',
      { prefix: testPrefix },
    );
    // Delete orphaned Memory nodes from test data
    await session.run(
      'MATCH (m:Memory) WHERE m.memoryId STARTS WITH $prefix DETACH DELETE m',
      { prefix: testPrefix },
    );
  });
}
