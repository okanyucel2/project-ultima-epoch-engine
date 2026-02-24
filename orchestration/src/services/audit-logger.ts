// =============================================================================
// AuditLogger — Ring Buffer Audit Log for AI Routing Decisions
// =============================================================================
// Fixed-size ring buffer (default 1000 entries) that overwrites oldest entries.
// All operations are synchronous and non-blocking.
// Provides stats: total decisions, failover count, avg latency, tier breakdown.
// =============================================================================

import { EventTier, AuditLogEntry } from '@epoch/shared/ai-router';

export interface AuditStats {
  totalDecisions: number;
  failoverCount: number;
  avgLatencyMs: number;
  tierBreakdown: Record<EventTier, number>;
}

export class AuditLogger {
  private readonly buffer: (AuditLogEntry | null)[];
  private readonly maxSize: number;
  private writeIndex: number = 0;
  private count: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize).fill(null);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Log an audit entry. Sync, non-blocking.
   * Overwrites oldest entry when buffer is full (ring buffer).
   */
  log(entry: AuditLogEntry): void {
    this.buffer[this.writeIndex] = entry;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }
  }

  /**
   * Get the most recent N entries, ordered newest-first.
   */
  getRecent(count: number): AuditLogEntry[] {
    const limit = Math.min(count, this.count);
    const results: AuditLogEntry[] = [];

    for (let i = 0; i < limit; i++) {
      // Walk backwards from writeIndex
      let idx = (this.writeIndex - 1 - i + this.maxSize) % this.maxSize;
      const entry = this.buffer[idx];
      if (entry) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Get aggregated statistics across all logged entries.
   */
  getStats(): AuditStats {
    const tierBreakdown: Record<EventTier, number> = {
      [EventTier.ROUTINE]: 0,
      [EventTier.OPERATIONAL]: 0,
      [EventTier.STRATEGIC]: 0,
    };

    if (this.count === 0) {
      return {
        totalDecisions: 0,
        failoverCount: 0,
        avgLatencyMs: 0,
        tierBreakdown,
      };
    }

    let failoverCount = 0;
    let totalLatency = 0;

    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[i];
      if (!entry) continue;

      const tier = entry.decision.eventTier;
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;

      if (entry.decision.failoverOccurred) {
        failoverCount++;
      }

      totalLatency += entry.decision.latencyMs;
    }

    return {
      totalDecisions: this.count,
      failoverCount,
      avgLatencyMs: Math.round(totalLatency / this.count),
      tierBreakdown,
    };
  }

  /**
   * Get the current number of entries in the buffer.
   */
  size(): number {
    return this.count;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this.count = 0;
  }
}
