import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// =============================================================================
// NEO4J CONNECTION POOL
// Wraps neo4j-driver with session pool management and auto-release patterns.
// =============================================================================

export interface PoolOptions {
  /** Maximum number of concurrent sessions. Default: 10 */
  maxSessions?: number;
  /** Timeout in ms to acquire a session from the pool. Default: 5000 */
  acquireTimeoutMs?: number;
}

const DEFAULT_MAX_SESSIONS = 10;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5000;

export class Neo4jConnectionPool {
  private readonly driver: Driver;
  private readonly maxSessions: number;
  private readonly acquireTimeoutMs: number;
  private activeSessions: Set<Session>;
  private closed: boolean;

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
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

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
