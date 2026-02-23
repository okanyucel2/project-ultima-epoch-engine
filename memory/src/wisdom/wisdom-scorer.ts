import type { WisdomScore } from '../../../shared/types/memory';
import { createTimestamp } from '../../../shared/types/common';
import {
  QUERY_MEMORY_COUNT,
  QUERY_EVENT_DIVERSITY,
  QUERY_TEMPORAL_SPAN,
  QUERY_POSITIVE_RATIO,
} from './wisdom-queries';
import type { Neo4jConnectionPool } from '../graph/connection-pool';

// =============================================================================
// WISDOM SCORER
// Calculates NPC wisdom from memory patterns using four equally-weighted factors:
//   1. memoryCount — log-scale normalized (cap at 100 memories = 1.0)
//   2. eventDiversity — unique event types / total event types (0-1)
//   3. temporalSpan — hours of memory span normalized (cap at 720h = 30 days)
//   4. positiveRatio — ratio of reward/dialogue events to total events
//
// Each factor contributes 0.25 to the final score (total max = 1.0).
// =============================================================================

/** Weight for each wisdom factor */
const FACTOR_WEIGHT = 0.25;

/** Memory count at which the factor reaches 1.0 (log scale) */
const MEMORY_COUNT_CAP = 100;

/** Temporal span in hours at which the factor reaches 1.0 (30 days) */
const TEMPORAL_SPAN_CAP_HOURS = 720;

/**
 * Normalizes memory count to 0-1 using log scale.
 * log(count) / log(cap) — capped at 1.0
 */
function normalizeMemoryCount(count: number): number {
  if (count <= 0) return 0;
  if (count >= MEMORY_COUNT_CAP) return 1;
  return Math.log(count) / Math.log(MEMORY_COUNT_CAP);
}

/**
 * Normalizes temporal span to 0-1.
 * hours / cap — capped at 1.0
 */
function normalizeTemporalSpan(hours: number): number {
  if (hours <= 0) return 0;
  return Math.min(1, hours / TEMPORAL_SPAN_CAP_HOURS);
}

export class WisdomScorer {
  private readonly pool: Neo4jConnectionPool;

  constructor(pool: Neo4jConnectionPool) {
    this.pool = pool;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Calculates the wisdom score for an NPC based on their memory patterns.
   *
   * Runs four independent Cypher queries and combines results with equal weights.
   */
  async calculateWisdom(npcId: string): Promise<WisdomScore> {
    return this.pool.withSession(async (session) => {
      // Run all four queries sequentially within the same session
      const countResult = await session.run(QUERY_MEMORY_COUNT, { npcId });
      const diversityResult = await session.run(QUERY_EVENT_DIVERSITY, { npcId });
      const spanResult = await session.run(QUERY_TEMPORAL_SPAN, { npcId });
      const positiveResult = await session.run(QUERY_POSITIVE_RATIO, { npcId });

      // Extract raw values
      const memoryCount = this.extractNumber(countResult.records[0], 'count');
      const distinctEvents = this.extractNumber(diversityResult.records[0], 'distinct');
      const totalEventTypes = this.extractNumber(diversityResult.records[0], 'total');
      const minTs = this.extractNullableNumber(spanResult.records[0], 'minTs');
      const maxTs = this.extractNullableNumber(spanResult.records[0], 'maxTs');
      const positiveEvents = this.extractNumber(positiveResult.records[0], 'positive');
      const totalEvents = this.extractNumber(positiveResult.records[0], 'total');

      // Compute factors
      const memoryCountFactor = normalizeMemoryCount(memoryCount);
      const eventDiversityFactor = totalEventTypes > 0
        ? distinctEvents / totalEventTypes
        : 0;
      const temporalSpanFactor = (minTs !== null && maxTs !== null)
        ? normalizeTemporalSpan((maxTs - minTs) / (1000 * 60 * 60))
        : 0;
      const positiveRatioFactor = totalEvents > 0
        ? positiveEvents / totalEvents
        : 0;

      // Weighted sum (each factor * 0.25)
      const score = Math.min(1, (
        memoryCountFactor * FACTOR_WEIGHT +
        eventDiversityFactor * FACTOR_WEIGHT +
        temporalSpanFactor * FACTOR_WEIGHT +
        positiveRatioFactor * FACTOR_WEIGHT
      ));

      return {
        npcId,
        score,
        factors: {
          memoryCount: memoryCountFactor,
          eventDiversity: eventDiversityFactor,
          temporalSpan: temporalSpanFactor,
          positiveRatio: positiveRatioFactor,
        },
        calculatedAt: createTimestamp(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private extractNumber(record: any, key: string): number {
    if (!record) return 0;
    const value = record.get(key);
    return typeof value === 'number' ? value : 0;
  }

  private extractNullableNumber(record: any, key: string): number | null {
    if (!record) return null;
    const value = record.get(key);
    return typeof value === 'number' ? value : null;
  }
}
