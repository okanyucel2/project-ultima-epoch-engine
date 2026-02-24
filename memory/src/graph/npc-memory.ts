import neo4j from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { createTimestamp } from '../../../shared/types/common';
import { DecayStrategy } from '../../../shared/types/memory';
import type { MemoryNode, DecayConfig } from '../../../shared/types/memory';
import type { NPCState } from '../../../shared/types/npc';
import { TraumaScorer } from '../trauma/trauma-scorer';
import type { Neo4jConnectionPool } from './connection-pool';

// =============================================================================
// NPC MEMORY GRAPH
// Primary interface for NPC persistent memory stored in Neo4j.
//
// Upgraded from raw driver.session() to use Neo4jConnectionPool for proper
// session lifecycle management and pooling.
//
// Graph model:
//   (NPC {id, name})-[:REMEMBERS]->(Memory {memoryId, event, playerAction,
//     wisdomScore, traumaScore, rawTraumaScore, timestamp})
// =============================================================================

/** Convert Neo4j Integer to JS number (handles both plain numbers and {high, low} objects) */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (neo4j.isInt(value)) return (value as neo4j.Integer).toNumber();
  return Number(value);
}

/** Default decay configuration for trauma calculation */
const DEFAULT_DECAY_CONFIG: DecayConfig = {
  strategy: DecayStrategy.HYPERBOLIC,
  alpha: 0.1,
  lambda: 0.05,
  linearRate: 0.01,
};

export class NPCMemoryGraph {
  private readonly pool: Neo4jConnectionPool;
  private readonly traumaScorer: TraumaScorer;

  constructor(pool: Neo4jConnectionPool, decayConfig?: DecayConfig) {
    this.pool = pool;
    this.traumaScorer = new TraumaScorer(
      pool,
      decayConfig ?? DEFAULT_DECAY_CONFIG,
    );
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /**
   * Records a new memory node in the NPC's memory graph.
   *
   * Creates/merges the NPC node and creates a new Memory node with a
   * REMEMBERS relationship. Uses parameterized Cypher queries throughout.
   */
  async recordMemory(memory: MemoryNode): Promise<void> {
    await this.pool.withSession(async (session) => {
      await session.run(
        `MERGE (npc:NPC {id: $npcId})
         CREATE (m:Memory {
           memoryId: $memoryId,
           event: $event,
           playerAction: $playerAction,
           wisdomScore: $wisdomScore,
           traumaScore: $traumaScore,
           rawTraumaScore: $rawTraumaScore,
           timestamp: $timestamp
         })
         CREATE (npc)-[:REMEMBERS]->(m)`,
        {
          npcId: memory.npcId,
          memoryId: memory.memoryId,
          event: memory.event,
          playerAction: memory.playerAction,
          wisdomScore: memory.wisdomScore,
          traumaScore: memory.traumaScore,
          rawTraumaScore: memory.rawTraumaScore,
          timestamp: memory.timestamp.unixMs,
        },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieves memories for an NPC, ordered by most recent first.
   *
   * @param npcId - The NPC identifier
   * @param limit - Maximum number of memories to return (default: 50)
   */
  async getMemories(npcId: string, limit: number = 50): Promise<MemoryNode[]> {
    return this.pool.withSession(async (session) => {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
         RETURN m.memoryId AS memoryId,
                m.event AS event,
                m.playerAction AS playerAction,
                m.wisdomScore AS wisdomScore,
                m.traumaScore AS traumaScore,
                m.rawTraumaScore AS rawTraumaScore,
                m.timestamp AS timestamp
         ORDER BY m.timestamp DESC
         LIMIT $limit`,
        { npcId, limit: neo4j.int(limit) },
      );

      return result.records.map((record) => {
        const unixMs = toNumber(record.get('timestamp'));
        return {
          memoryId: record.get('memoryId') as string,
          npcId,
          event: record.get('event') as string,
          playerAction: record.get('playerAction') as string,
          wisdomScore: toNumber(record.get('wisdomScore')),
          traumaScore: toNumber(record.get('traumaScore')),
          rawTraumaScore: toNumber(record.get('rawTraumaScore')),
          timestamp: {
            iso8601: new Date(unixMs).toISOString(),
            unixMs,
          },
        };
      });
    });
  }

  /**
   * Calculates rebellion probability for an NPC using TraumaScorer with
   * time decay. This is an upgrade from the basic `avg(traumaScore)/100`
   * approach in the original implementation.
   *
   * Rebellion probability formula:
   *   base (0.05) + trauma_modifier (current_trauma * 0.3)
   *                + efficiency_penalty ((1 - efficiency) * 0.3)
   *
   * Since we don't have efficiency from Neo4j alone, we use:
   *   probability = base + (decayed_trauma * 0.6)
   *
   * Clamped to [0, 1].
   */
  async getRebellionProbability(npcId: string): Promise<number> {
    const trauma = await this.traumaScorer.calculateTrauma(npcId);

    const base = 0.05;
    const traumaModifier = trauma.currentScore * 0.6;
    const probability = base + traumaModifier;

    return Math.min(1, Math.max(0, probability));
  }

  /**
   * Retrieves the current state of an NPC from the graph.
   * Returns null if the NPC does not exist.
   */
  async getNPCState(npcId: string): Promise<NPCState | null> {
    return this.pool.withSession(async (session) => {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})
         OPTIONAL MATCH (npc)-[:REMEMBERS]->(m:Memory)
         WITH npc,
              count(m) AS memoryCount,
              avg(m.wisdomScore) AS avgWisdom,
              avg(m.traumaScore) AS avgTrauma,
              max(m.timestamp) AS lastEventTs
         RETURN npc.id AS npcId,
                npc.name AS name,
                memoryCount,
                avgWisdom,
                avgTrauma,
                lastEventTs`,
        { npcId },
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const name = (record.get('name') as string) ?? npcId;
      const memoryCount = toNumber(record.get('memoryCount'));
      const avgWisdom = toNumber(record.get('avgWisdom'));
      const avgTrauma = toNumber(record.get('avgTrauma'));
      const rawLastEventTs = record.get('lastEventTs');
      const lastEventTs = rawLastEventTs != null ? toNumber(rawLastEventTs) : null;

      // Calculate rebellion probability with trauma decay
      const rebellionProbability = await this.getRebellionProbability(npcId);

      return {
        npcId,
        name,
        wisdomScore: Math.min(1, Math.max(0, avgWisdom)),
        traumaScore: Math.min(1, Math.max(0, avgTrauma)),
        rebellionProbability,
        workEfficiency: Math.max(0, 1 - avgTrauma * 0.3),
        morale: Math.max(0, 1 - rebellionProbability),
        memoryCount,
        lastEvent: lastEventTs
          ? { iso8601: new Date(lastEventTs).toISOString(), unixMs: lastEventTs }
          : undefined,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Closes the underlying connection pool.
   */
  async close(): Promise<void> {
    await this.pool.close();
  }
}
