import { ActionType } from '@epoch/shared/npc';
import { createTimestamp } from '@epoch/shared/common';
import { CONFIDENCE_NEUTRAL } from '@epoch/shared/memory';
import type { ConfidenceEdge, DecayedConfidence } from '@epoch/shared/memory';
import type { Neo4jConnectionPool } from './connection-pool';

// =============================================================================
// CONFIDENCE MANAGER
// Manages NPC trust relationships stored as Neo4j edges:
//   (NPC)-[:TRUSTS {confidence, lastUpdated, decayRate}]->(Entity)
//
// Confidence scores are always clamped to [0.0, 1.0].
// =============================================================================

/** Confidence adjustment multipliers per action type */
const CONFIDENCE_MODIFIERS: Record<string, number> = {
  [ActionType.REWARD]: 0.1,
  [ActionType.PUNISHMENT]: -0.15,
  [ActionType.COMMAND]: -0.05,
  [ActionType.DIALOGUE]: 0.08,
};

/** Default decay rate for new TRUSTS edges */
const DEFAULT_DECAY_RATE = 0.1;

/**
 * Clamps a value to the [0, 1] range.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class ConfidenceManager {
  private readonly pool: Neo4jConnectionPool;

  constructor(pool: Neo4jConnectionPool) {
    this.pool = pool;
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /**
   * Creates or updates a TRUSTS edge between an NPC and an entity.
   * Confidence is clamped to [0, 1] before persisting.
   */
  async setConfidence(
    npcId: string,
    entityId: string,
    confidence: number,
    decayRate: number = DEFAULT_DECAY_RATE,
  ): Promise<void> {
    const clampedConfidence = clamp01(confidence);
    const now = new Date().toISOString();

    await this.pool.withSession(async (session) => {
      await session.run(
        `MERGE (npc:NPC {id: $npcId})
         MERGE (entity:Entity {id: $entityId})
         MERGE (npc)-[t:TRUSTS]->(entity)
         SET t.confidence = $confidence,
             t.decayRate = $decayRate,
             t.lastUpdated = datetime($lastUpdated)`,
        {
          npcId,
          entityId,
          confidence: clampedConfidence,
          decayRate,
          lastUpdated: now,
        },
      );
    });
  }

  /**
   * Updates confidence based on a player/director action.
   *
   * Adjustment rules:
   *   REWARD:     +intensity * 0.1   (capped at 1.0)
   *   PUNISHMENT: -intensity * 0.15  (floored at 0.0)
   *   COMMAND:    -intensity * 0.05  (slight decrease from being ordered)
   *   DIALOGUE:   +intensity * 0.08
   */
  async updateConfidenceFromAction(
    npcId: string,
    entityId: string,
    actionType: ActionType,
    intensity: number,
  ): Promise<ConfidenceEdge> {
    // Get current confidence (or default to 0.5 for new relationships)
    const existing = await this.getConfidence(npcId, entityId);
    const currentConfidence = existing?.confidence ?? 0.5;
    const currentDecayRate = existing?.decayRate ?? DEFAULT_DECAY_RATE;

    // Calculate adjustment
    const modifier = CONFIDENCE_MODIFIERS[actionType] ?? 0;
    const adjustment = intensity * modifier;
    const newConfidence = clamp01(currentConfidence + adjustment);

    // Persist the updated confidence
    await this.setConfidence(npcId, entityId, newConfidence, currentDecayRate);

    return {
      npcId,
      entityId,
      confidence: newConfidence,
      decayRate: currentDecayRate,
      lastUpdated: createTimestamp(),
    };
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieves the confidence edge between an NPC and a specific entity.
   * Returns null if no TRUSTS relationship exists.
   */
  async getConfidence(
    npcId: string,
    entityId: string,
  ): Promise<ConfidenceEdge | null> {
    return this.pool.withSession(async (session) => {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})-[t:TRUSTS]->(entity:Entity {id: $entityId})
         RETURN t.confidence AS confidence,
                t.decayRate AS decayRate,
                t.lastUpdated AS lastUpdated`,
        { npcId, entityId },
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        npcId,
        entityId,
        confidence: record.get('confidence') as number,
        decayRate: record.get('decayRate') as number,
        lastUpdated: createTimestamp(
          new Date(record.get('lastUpdated') as string),
        ),
      };
    });
  }

  /**
   * Retrieves all TRUSTS edges for a given NPC.
   */
  async getConfidenceRelations(npcId: string): Promise<ConfidenceEdge[]> {
    return this.pool.withSession(async (session) => {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})-[t:TRUSTS]->(entity:Entity)
         RETURN entity.id AS entityId,
                t.confidence AS confidence,
                t.decayRate AS decayRate,
                t.lastUpdated AS lastUpdated`,
        { npcId },
      );

      return result.records.map((record) => ({
        npcId,
        entityId: record.get('entityId') as string,
        confidence: record.get('confidence') as number,
        decayRate: record.get('decayRate') as number,
        lastUpdated: createTimestamp(
          new Date(record.get('lastUpdated') as string),
        ),
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Wave 47: Hyperbolic Confidence Decay
  // ---------------------------------------------------------------------------

  /**
   * Retrieves confidence with hyperbolic time decay applied.
   *
   * Unlike trauma which decays toward 0, confidence decays toward NEUTRAL (0.5).
   * This models how trust and distrust both fade over time without interaction:
   *   - High trust (0.9) decays toward 0.5 (forgotten loyalty)
   *   - Low trust (0.1) decays toward 0.5 (forgotten grudge)
   *   - Neutral (0.5) is unaffected by decay
   *
   * Formula: neutral + (raw - neutral) * (1 / (1 + alpha * hours))
   */
  async getDecayedConfidence(
    npcId: string,
    entityId: string,
  ): Promise<DecayedConfidence | null> {
    const edge = await this.getConfidence(npcId, entityId);
    if (!edge) return null;

    const hoursElapsed =
      (Date.now() - edge.lastUpdated.unixMs) / (1000 * 60 * 60);

    const decayedConfidence = applyConfidenceDecay(
      edge.confidence,
      edge.decayRate,
      hoursElapsed,
    );

    return {
      npcId,
      entityId,
      rawConfidence: edge.confidence,
      decayedConfidence,
      decayRate: edge.decayRate,
      hoursElapsed,
      lastUpdated: edge.lastUpdated,
    };
  }

  /**
   * Retrieves all TRUSTS edges for an NPC with hyperbolic decay applied.
   */
  async getDecayedConfidenceRelations(
    npcId: string,
  ): Promise<DecayedConfidence[]> {
    const edges = await this.getConfidenceRelations(npcId);
    const now = Date.now();

    return edges.map((edge) => {
      const hoursElapsed =
        (now - edge.lastUpdated.unixMs) / (1000 * 60 * 60);

      return {
        npcId,
        entityId: edge.entityId,
        rawConfidence: edge.confidence,
        decayedConfidence: applyConfidenceDecay(
          edge.confidence,
          edge.decayRate,
          hoursElapsed,
        ),
        decayRate: edge.decayRate,
        hoursElapsed,
        lastUpdated: edge.lastUpdated,
      };
    });
  }
}

// =============================================================================
// Pure function: Hyperbolic confidence decay toward neutral
// Exported for direct use in tests and CognitiveRails
// =============================================================================

/**
 * Applies hyperbolic decay to a confidence score, decaying toward NEUTRAL (0.5).
 *
 * @param rawConfidence - The stored confidence value (0-1)
 * @param alpha - Decay rate coefficient (higher = faster decay toward neutral)
 * @param hoursElapsed - Hours since the confidence was last updated
 * @returns Decayed confidence value (0-1)
 */
export function applyConfidenceDecay(
  rawConfidence: number,
  alpha: number,
  hoursElapsed: number,
): number {
  const deviation = rawConfidence - CONFIDENCE_NEUTRAL;
  const decayedDeviation =
    deviation * (1 / (1 + alpha * Math.max(0, hoursElapsed)));
  return clamp01(CONFIDENCE_NEUTRAL + decayedDeviation);
}
