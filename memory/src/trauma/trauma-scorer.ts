import { DecayStrategy } from '@epoch/shared/memory';
import type { DecayConfig, TraumaScore } from '@epoch/shared/memory';
import { createTimestamp } from '@epoch/shared/common';
import { applyDecay } from './decay-functions';
import { QUERY_ALL_MEMORIES } from '../wisdom/wisdom-queries';
import type { Neo4jConnectionPool } from '../graph/connection-pool';

// =============================================================================
// TRAUMA SCORER
// Calculates NPC trauma by querying all memory nodes, applying time-based
// decay to each individual trauma score, and aggregating via weighted average.
//
// This gives recent trauma much higher weight than old trauma, modeling how
// NPCs "heal" over time but never fully forget severe events.
// =============================================================================

export class TraumaScorer {
  private readonly pool: Neo4jConnectionPool;
  private readonly decayConfig: DecayConfig;

  constructor(pool: Neo4jConnectionPool, decayConfig: DecayConfig) {
    this.pool = pool;
    this.decayConfig = decayConfig;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Calculates the current trauma score for an NPC.
   *
   * Process:
   *   1. Query all memory nodes for the NPC
   *   2. Apply time decay to each trauma score individually
   *   3. Aggregate via weighted average of decayed scores
   *   4. Return TraumaScore with current, raw, and elapsed info
   */
  async calculateTrauma(npcId: string): Promise<TraumaScore> {
    const now = Date.now();

    const memories = await this.pool.withSession(async (session) => {
      const result = await session.run(QUERY_ALL_MEMORIES, { npcId });
      return result.records.map((record) => ({
        traumaScore: record.get('traumaScore') as number,
        timestamp: record.get('timestamp') as number,
      }));
    });

    // No memories: zero trauma
    if (memories.length === 0) {
      return {
        npcId,
        currentScore: 0,
        rawScore: 0,
        decayApplied: this.decayConfig.strategy,
        hoursElapsed: 0,
        calculatedAt: createTimestamp(),
      };
    }

    // Calculate decayed scores
    let totalDecayed = 0;
    let totalRaw = 0;
    let totalHoursElapsed = 0;

    for (const memory of memories) {
      const hoursElapsed = (now - memory.timestamp) / (1000 * 60 * 60);
      const decayed = this.getDecayedScore(memory.traumaScore, hoursElapsed);

      totalDecayed += decayed;
      totalRaw += memory.traumaScore;
      totalHoursElapsed += hoursElapsed;
    }

    // Weighted average
    const avgDecayed = totalDecayed / memories.length;
    const avgRaw = totalRaw / memories.length;
    const avgHoursElapsed = totalHoursElapsed / memories.length;

    return {
      npcId,
      currentScore: Math.min(1, Math.max(0, avgDecayed)),
      rawScore: Math.min(1, Math.max(0, avgRaw)),
      decayApplied: this.decayConfig.strategy,
      hoursElapsed: avgHoursElapsed,
      calculatedAt: createTimestamp(),
    };
  }

  /**
   * Applies time decay to a raw trauma score.
   *
   * @param rawScore - The original trauma score (0-1)
   * @param hoursElapsed - Hours since the trauma event
   * @returns The decayed score
   */
  getDecayedScore(rawScore: number, hoursElapsed: number): number {
    return applyDecay(rawScore, this.decayConfig, hoursElapsed);
  }
}
