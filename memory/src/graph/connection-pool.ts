import neo4j, { Driver, Session, auth } from 'neo4j-driver';
import { RetryQueue, RetryQueueOptions } from './retry-queue';

// =============================================================================
// NEO4J CONNECTION POOL
// Wraps neo4j-driver with session pool management and auto-release patterns.
// Wave 21B: Integrated RetryQueue for Neo4j outage resilience.
// =============================================================================

export interface PoolOptions {
  /** Maximum number of concurrent sessions. Default: 10 */
  maxSessions?: number;
  /** Timeout in ms to acquire a session from the pool. Default: 5000 */
  acquireTimeoutMs?: number;
  /** Retry queue options for Neo4j outage fallback. Default: enabled */
  retryQueue?: RetryQueueOptions | false;
}

const DEFAULT_MAX_SESSIONS = 10;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5000;

export class Neo4jConnectionPool {
  private readonly driver: Driver;
  private readonly maxSessions: number;
  private readonly acquireTimeoutMs: number;
  private activeSessions: Set<Session>;
  private closed: boolean;

  /** Wave 21B: Ring buffer fallback for Neo4j outages */
  public readonly retryQueue: RetryQueue | null;

  constructor(
    uri: string,
    user: string,
    password: string,
    options?: PoolOptions,
  ) {
    this.driver = neo4j.driver(uri, auth.basic(user, password), {
      maxConnectionPoolSize: options?.maxSessions ?? DEFAULT_MAX_SESSIONS,
      connectionAcquisitionTimeout: options?.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
    });
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.acquireTimeoutMs = options?.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
    this.activeSessions = new Set();
    this.closed = false;

    // Initialize retry queue (Wave 21B)
    if (options?.retryQueue !== false) {
      this.retryQueue = new RetryQueue(
        typeof options?.retryQueue === 'object' ? options.retryQueue : undefined,
      );
      this.retryQueue.startAutoFlush(async () => {
        try {
          const session = this.driver.session();
          return session;
        } catch {
          return null;
        }
      });
    } else {
      this.retryQueue = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Acquires a session from the pool.
   * Caller is responsible for releasing via `releaseSession()`.
   */
  async getSession(): Promise<Session> {
    this.ensureOpen();

    if (this.activeSessions.size >= this.maxSessions) {
      await this.waitForAvailableSlot();
    }

    const session = this.driver.session();
    this.activeSessions.add(session);
    return session;
  }

  /**
   * Releases a session back to the pool.
   */
  releaseSession(session: Session): void {
    this.activeSessions.delete(session);
    session.close().catch(() => {
      // Session close errors are non-fatal; pool already removed the reference.
    });
  }

  /**
   * Acquires a session, runs the provided function, and auto-releases.
   * This is the recommended pattern for all Neo4j operations.
   */
  async withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
    const session = await this.getSession();
    try {
      return await fn(session);
    } finally {
      this.releaseSession(session);
    }
  }

  // ---------------------------------------------------------------------------
  // Resilient Operations (Wave 21B)
  // ---------------------------------------------------------------------------

  /**
   * Execute a Cypher query directly, or queue it for later if Neo4j is down.
   * Fire-and-forget semantics — does not return query results.
   * Use for write operations (event recording, memory persistence).
   */
  async runOrQueue(query: string, params: Record<string, unknown>): Promise<boolean> {
    try {
      await this.withSession(async (session) => {
        await session.run(query, params);
      });
      return true; // Executed immediately
    } catch {
      if (this.retryQueue) {
        this.retryQueue.enqueue(query, params);
        return false; // Queued for later
      }
      throw new Error('Neo4j unavailable and retry queue is disabled');
    }
  }

  // ---------------------------------------------------------------------------
  // Health & Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Verifies Neo4j connectivity by running a lightweight query.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.withSession(async (session) => {
        return session.run('RETURN 1 AS health');
      });
      return result.records.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Closes all active sessions and the underlying driver.
   * Wave 25C: Drains RetryQueue before closing to prevent data loss.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Wave 25C: Drain retry queue before closing (zero data loss)
    if (this.retryQueue && this.retryQueue.size > 0) {
      try {
        const session = this.driver.session();
        const flushed = await this.retryQueue.drainAndStop(session);
        if (flushed > 0) {
          console.log(`[Neo4jConnectionPool] Drained ${flushed} ops before shutdown`);
        }
        await session.close();
      } catch {
        console.warn('[Neo4jConnectionPool] Could not drain retry queue — Neo4j unreachable');
        this.retryQueue.stopAutoFlush();
      }
    } else if (this.retryQueue) {
      this.retryQueue.stopAutoFlush();
    }

    // Close all active sessions
    const closePromises = Array.from(this.activeSessions).map((session) =>
      session.close().catch(() => {
        // Swallow close errors during shutdown.
      }),
    );
    await Promise.all(closePromises);
    this.activeSessions.clear();

    await this.driver.close();
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  /** Returns the count of currently active sessions. */
  get activeSessionCount(): number {
    return this.activeSessions.size;
  }

  /** Returns the maximum allowed sessions. */
  get maxSessionCount(): number {
    return this.maxSessions;
  }

  /** Returns the acquire timeout in milliseconds. */
  get acquireTimeout(): number {
    return this.acquireTimeoutMs;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('Neo4jConnectionPool is closed. Cannot acquire session.');
    }
  }

  /**
   * Waits until a session slot becomes available or times out.
   */
  private waitForAvailableSlot(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();

      const check = (): void => {
        if (this.activeSessions.size < this.maxSessions) {
          resolve();
          return;
        }

        if (Date.now() - startTime >= this.acquireTimeoutMs) {
          reject(
            new Error(
              `Failed to acquire session within ${this.acquireTimeoutMs}ms. ` +
              `Active: ${this.activeSessions.size}/${this.maxSessions}`,
            ),
          );
          return;
        }

        setTimeout(check, 50);
      };

      check();
    });
  }
}
