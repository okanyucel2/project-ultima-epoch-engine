import { v4 as uuidv4 } from 'uuid';
import { DecayStrategy } from '../../shared/types/memory';
import type { DecayConfig, NPCProfile } from '../../shared/types/memory';
import { createTimestamp } from '../../shared/types/common';
import { REBELLION_THRESHOLDS } from '../../shared/types/npc';
import { Neo4jConnectionPool } from './graph/connection-pool';
import { NPCMemoryGraph } from './graph/npc-memory';
import { ConfidenceManager } from './graph/confidence-edge';
import { TraumaScorer } from './trauma/trauma-scorer';
import { WisdomScorer } from './wisdom/wisdom-scorer';

// =============================================================================
// EPOCH MEMORY SERVICE — Main Facade
//
// Orchestrates all memory subsystems (graph, confidence, trauma, wisdom) into
// a single cohesive API for the rest of the Epoch Engine.
//
// Usage:
//   const service = await EpochMemoryService.create(
//     'bolt://localhost:7687', 'neo4j', 'password'
//   );
//   await service.recordEvent('npc-1', 'attack', 'punishment', 0.3, 0.7);
//   const profile = await service.getNPCProfile('npc-1');
//   await service.close();
// =============================================================================

/** Default decay configuration for the entire memory system */
const DEFAULT_DECAY_CONFIG: DecayConfig = {
  strategy: DecayStrategy.HYPERBOLIC,
  alpha: 0.1,
  lambda: 0.05,
  linearRate: 0.01,
};

export class EpochMemoryService {
  private readonly pool: Neo4jConnectionPool;
  private readonly memoryGraph: NPCMemoryGraph;
  private readonly confidenceManager: ConfidenceManager;
  private readonly traumaScorer: TraumaScorer;
  private readonly wisdomScorer: WisdomScorer;

  private constructor(
    pool: Neo4jConnectionPool,
    memoryGraph: NPCMemoryGraph,
    confidenceManager: ConfidenceManager,
    traumaScorer: TraumaScorer,
    wisdomScorer: WisdomScorer,
  ) {
    this.pool = pool;
    this.memoryGraph = memoryGraph;
    this.confidenceManager = confidenceManager;
    this.traumaScorer = traumaScorer;
    this.wisdomScorer = wisdomScorer;
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  /**
   * Creates and initializes an EpochMemoryService with all subsystems.
   *
   * @param neo4jUri - Neo4j Bolt URI (e.g., 'bolt://localhost:7687')
   * @param user - Neo4j username
   * @param password - Neo4j password
   * @param decayConfig - Optional custom decay configuration
   */
  static async create(
    neo4jUri: string,
    user: string,
    password: string,
    decayConfig?: DecayConfig,
  ): Promise<EpochMemoryService> {
    const config = decayConfig ?? DEFAULT_DECAY_CONFIG;
    const pool = new Neo4jConnectionPool(neo4jUri, user, password);

    const memoryGraph = new NPCMemoryGraph(pool, config);
    const confidenceManager = new ConfidenceManager(pool);
    const traumaScorer = new TraumaScorer(pool, config);
    const wisdomScorer = new WisdomScorer(pool);

    return new EpochMemoryService(
      pool,
      memoryGraph,
      confidenceManager,
      traumaScorer,
      wisdomScorer,
    );
  }

  // ---------------------------------------------------------------------------
  // Event Recording
  // ---------------------------------------------------------------------------

  /**
   * Records a new event into an NPC's memory graph.
   *
   * @param npcId - The NPC this memory belongs to
   * @param event - Description of what happened
   * @param playerAction - The action type (reward, punishment, command, dialogue, etc.)
   * @param wisdomScore - Wisdom contribution of this event (0-1)
   * @param traumaScore - Trauma score for this event (0-1)
   */
  async recordEvent(
    npcId: string,
    event: string,
    playerAction: string,
    wisdomScore: number,
    traumaScore: number,
  ): Promise<void> {
    const now = createTimestamp();

    await this.memoryGraph.recordMemory({
      memoryId: uuidv4(),
      npcId,
      event,
      playerAction,
      wisdomScore: Math.min(1, Math.max(0, wisdomScore)),
      traumaScore: Math.min(1, Math.max(0, traumaScore)),
      rawTraumaScore: Math.min(1, Math.max(0, traumaScore)),
      timestamp: now,
    });
  }

  // ---------------------------------------------------------------------------
  // Profile Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Builds a complete NPC profile by aggregating data from all subsystems.
   *
   * Returns wisdom score, trauma score (with decay), rebellion probability,
   * confidence relations, memory count, and last event timestamp.
   */
  async getNPCProfile(npcId: string): Promise<NPCProfile> {
    // Run all independent calculations
    const [wisdom, trauma, rebellionRisk, confidenceRelations, memories] =
      await Promise.all([
        this.wisdomScorer.calculateWisdom(npcId),
        this.traumaScorer.calculateTrauma(npcId),
        this.getRebellionRisk(npcId),
        this.confidenceManager.getConfidenceRelations(npcId),
        this.memoryGraph.getMemories(npcId, 1), // Just need the latest for timestamp
      ]);

    const lastMemory = memories[0];

    return {
      npcId,
      name: npcId, // Name comes from NPC node; using npcId as fallback
      wisdomScore: wisdom,
      traumaScore: trauma,
      rebellionProbability: rebellionRisk.probability,
      confidenceRelations,
      memoryCount: wisdom.factors.memoryCount > 0 ? Math.round(
        Math.pow(10, wisdom.factors.memoryCount * Math.log10(100))
      ) : 0,
      lastEvent: lastMemory
        ? lastMemory.timestamp
        : createTimestamp(),
    };
  }

  // ---------------------------------------------------------------------------
  // Rebellion Risk Assessment
  // ---------------------------------------------------------------------------

  /**
   * Calculates rebellion risk with contributing factors for diagnostics.
   *
   * Returns probability and a list of human-readable risk factors.
   */
  async getRebellionRisk(
    npcId: string,
  ): Promise<{ probability: number; factors: string[] }> {
    const trauma = await this.traumaScorer.calculateTrauma(npcId);
    const factors: string[] = [];

    // Base probability
    const base = 0.05;
    factors.push(`Base probability: ${(base * 100).toFixed(1)}%`);

    // Trauma modifier
    const traumaModifier = trauma.currentScore * 0.6;
    if (traumaModifier > 0) {
      factors.push(
        `Trauma modifier: +${(traumaModifier * 100).toFixed(1)}% ` +
        `(current trauma: ${(trauma.currentScore * 100).toFixed(1)}%, ` +
        `decay: ${trauma.decayApplied})`,
      );
    }

    // Calculate raw probability
    const probability = Math.min(1, Math.max(0, base + traumaModifier));

    // Add threshold warnings
    if (probability >= REBELLION_THRESHOLDS.VETO) {
      factors.push('VETO THRESHOLD EXCEEDED — Cognitive Rails active');
    } else if (probability >= REBELLION_THRESHOLDS.CRITICAL) {
      factors.push('CRITICAL — AEGIS monitoring closely');
    } else if (probability >= REBELLION_THRESHOLDS.WARNING) {
      factors.push('WARNING — Process halt consideration');
    } else if (probability >= REBELLION_THRESHOLDS.CONSIDERATION) {
      factors.push('NPC considering rebellion');
    }

    return { probability, factors };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Closes all connections and resources.
   */
  async close(): Promise<void> {
    await this.pool.close();
  }
}
