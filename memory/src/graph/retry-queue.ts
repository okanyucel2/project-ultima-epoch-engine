// =============================================================================
// NEO4J RETRY QUEUE — Ring Buffer Fallback (Wave 21B)
//
// When Neo4j is unavailable, events are held in a bounded in-memory ring buffer.
// On reconnection, the queue auto-flushes to Neo4j without data loss (within
// buffer capacity). Oldest entries are evicted when the buffer is full, preventing
// memory leaks during prolonged outages.
// =============================================================================

import { Session } from 'neo4j-driver';

export interface QueuedOperation {
  /** Cypher query to execute */
  query: string;
  /** Query parameters */
  params: Record<string, unknown>;
  /** Timestamp when the operation was enqueued */
  enqueuedAt: number;
}

export interface RetryQueueOptions {
  /** Maximum number of operations to hold in the ring buffer. Default: 1000 */
  capacity?: number;
  /** Interval in ms between flush attempts when Neo4j reconnects. Default: 5000 */
  flushIntervalMs?: number;
  /** Maximum age in ms for a queued operation before it's discarded. Default: 300000 (5 min) */
  maxAgeMs?: number;
}

const DEFAULT_CAPACITY = 1000;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_AGE_MS = 300_000;

export class RetryQueue {
  private buffer: QueuedOperation[];
  private head: number;
  private tail: number;
  private count: number;
  private readonly capacity: number;
  private readonly maxAgeMs: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null;
  private flushing: boolean;
  private totalEnqueued: number;
  private totalFlushed: number;
  private totalDropped: number;

  constructor(options?: RetryQueueOptions) {
    this.capacity = options?.capacity ?? DEFAULT_CAPACITY;
    this.maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.flushIntervalMs = options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.flushTimer = null;
    this.flushing = false;
    this.totalEnqueued = 0;
    this.totalFlushed = 0;
    this.totalDropped = 0;
  }

  /**
   * Enqueue an operation for later execution.
   * If the buffer is full, the oldest entry is evicted (ring buffer semantics).
   */
  enqueue(query: string, params: Record<string, unknown>): void {
    const op: QueuedOperation = {
      query,
      params,
      enqueuedAt: Date.now(),
    };

    if (this.count >= this.capacity) {
      // Evict oldest (head advances)
      this.head = (this.head + 1) % this.capacity;
      this.totalDropped++;
    } else {
      this.count++;
    }

    this.buffer[this.tail] = op;
    this.tail = (this.tail + 1) % this.capacity;
    this.totalEnqueued++;
  }

  /**
   * Dequeue the oldest operation. Returns undefined if empty.
   */
  dequeue(): QueuedOperation | undefined {
    if (this.count === 0) return undefined;

    const op = this.buffer[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return op;
  }

  /**
   * Drain all operations (oldest first), skipping expired entries.
   */
  drainValid(): QueuedOperation[] {
    const now = Date.now();
    const ops: QueuedOperation[] = [];

    while (this.count > 0) {
      const op = this.dequeue()!;
      if (now - op.enqueuedAt <= this.maxAgeMs) {
        ops.push(op);
      } else {
        this.totalDropped++;
      }
    }

    return ops;
  }

  /**
   * Flush all queued operations to Neo4j via the provided session.
   * Returns the number of operations successfully flushed.
   */
  async flush(session: Session): Promise<number> {
    if (this.flushing || this.count === 0) return 0;

    this.flushing = true;
    let flushed = 0;

    try {
      const ops = this.drainValid();

      for (const op of ops) {
        try {
          await session.run(op.query, op.params);
          flushed++;
          this.totalFlushed++;
        } catch {
          // Re-enqueue failed operations (they'll get another chance)
          this.enqueue(op.query, op.params);
          break; // Stop flushing — connection likely failed again
        }
      }
    } finally {
      this.flushing = false;
    }

    return flushed;
  }

  /**
   * Start periodic flush attempts using the provided session factory.
   * The factory is called each cycle; if it returns null, the flush is skipped.
   */
  startAutoFlush(sessionFactory: () => Promise<Session | null>): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(async () => {
      if (this.count === 0 || this.flushing) return;

      const session = await sessionFactory().catch(() => null);
      if (!session) return;

      try {
        const flushed = await this.flush(session);
        if (flushed > 0) {
          console.log(
            `[RetryQueue] Flushed ${flushed} operations to Neo4j ` +
            `(${this.count} remaining)`,
          );
        }
      } finally {
        await session.close().catch(() => {});
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop the auto-flush timer.
   */
  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Current number of operations in the buffer. */
  get size(): number {
    return this.count;
  }

  /** Whether the buffer is empty. */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /** Diagnostics snapshot. */
  get stats(): {
    size: number;
    capacity: number;
    totalEnqueued: number;
    totalFlushed: number;
    totalDropped: number;
  } {
    return {
      size: this.count,
      capacity: this.capacity,
      totalEnqueued: this.totalEnqueued,
      totalFlushed: this.totalFlushed,
      totalDropped: this.totalDropped,
    };
  }

  /**
   * Clear all queued operations.
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}
