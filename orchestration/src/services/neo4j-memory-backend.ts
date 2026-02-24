// =============================================================================
// Neo4jMemoryBackend — Real Neo4j implementation of IMemoryBackend
// =============================================================================
// Connects MemoryIntegration to a live Neo4j instance.
// Creates NPC nodes and Memory relationships directly via Cypher.
//
// If Neo4j is unavailable, create() returns null (graceful degradation).
// =============================================================================

import neo4j, { Driver, Session, Integer, auth } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { createTimestamp } from '../../shared/types/common';
import type { IMemoryBackend } from './memory-integration';
import type { WisdomScore, TraumaScore, ConfidenceEdge } from '../../shared/types/memory';
import type { EpochTimestamp } from '../../shared/types/common';

/** Convert Neo4j Integer to JS number */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (neo4j.isInt(value)) return (value as Integer).toNumber();
  return Number(value);
}

export class Neo4jMemoryBackend implements IMemoryBackend {
  private readonly driver: Driver;

  private constructor(driver: Driver) {
    this.driver = driver;
  }

  /**
   * Create a Neo4jMemoryBackend, or return null if connection fails.
   */
  static async create(
    uri: string,
    user: string,
    password: string,
  ): Promise<Neo4jMemoryBackend | null> {
    try {
      const driver = neo4j.driver(uri, auth.basic(user, password));
      await driver.verifyConnectivity();
      console.log('[Neo4jMemoryBackend] Connected to Neo4j');
      return new Neo4jMemoryBackend(driver);
    } catch (error) {
      console.warn('[Neo4jMemoryBackend] Neo4j unavailable, memory will not persist:', error);
      return null;
    }
  }

  async recordEvent(
    npcId: string,
    event: string,
    playerAction: string,
    wisdomScore: number,
    traumaScore: number,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MERGE (npc:NPC {id: $npcId})
         CREATE (m:Memory {
           memoryId: $memoryId,
           event: $event,
           playerAction: $playerAction,
           wisdomScore: $wisdomScore,
           traumaScore: $traumaScore,
           rawTraumaScore: $traumaScore,
           timestamp: $timestamp
         })
         CREATE (npc)-[:REMEMBERS]->(m)`,
        {
          npcId,
          memoryId: uuidv4(),
          event,
          playerAction,
          wisdomScore,
          traumaScore,
          timestamp: Date.now(),
        },
      );
    } finally {
      await session.close();
    }
  }

  async getNPCProfile(npcId: string): Promise<{
    npcId: string;
    name: string;
    wisdomScore: WisdomScore;
    traumaScore: TraumaScore;
    rebellionProbability: number;
    confidenceRelations: ConfidenceEdge[];
    memoryCount: number;
    lastEvent: EpochTimestamp;
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})
         OPTIONAL MATCH (npc)-[:REMEMBERS]->(m:Memory)
         WITH npc,
              count(m) AS memoryCount,
              avg(m.wisdomScore) AS avgWisdom,
              avg(m.traumaScore) AS avgTrauma,
              max(m.timestamp) AS lastTs
         RETURN npc.id AS npcId, npc.name AS name,
                memoryCount, avgWisdom, avgTrauma, lastTs`,
        { npcId },
      );

      if (result.records.length === 0) {
        const now = createTimestamp();
        return {
          npcId,
          name: npcId,
          wisdomScore: { npcId, score: 0, factors: { memoryCount: 0, eventDiversity: 0, temporalSpan: 0, positiveRatio: 0 }, calculatedAt: now },
          traumaScore: { npcId, currentScore: 0, rawScore: 0, decayApplied: 'hyperbolic' as any, hoursElapsed: 0, calculatedAt: now },
          rebellionProbability: 0.05,
          confidenceRelations: [],
          memoryCount: 0,
          lastEvent: now,
        };
      }

      const rec = result.records[0];
      const now = createTimestamp();
      const avgWisdom = toNumber(rec.get('avgWisdom'));
      const avgTrauma = toNumber(rec.get('avgTrauma'));
      const memoryCount = toNumber(rec.get('memoryCount'));
      const lastTs = toNumber(rec.get('lastTs'));
      const rebellionProbability = Math.min(1, 0.05 + avgTrauma * 0.6);

      return {
        npcId,
        name: (rec.get('name') as string) ?? npcId,
        wisdomScore: { npcId, score: avgWisdom, factors: { memoryCount, eventDiversity: 0, temporalSpan: 0, positiveRatio: 0 }, calculatedAt: now },
        traumaScore: { npcId, currentScore: avgTrauma, rawScore: avgTrauma, decayApplied: 'hyperbolic' as any, hoursElapsed: 0, calculatedAt: now },
        rebellionProbability,
        confidenceRelations: [],
        memoryCount,
        lastEvent: lastTs ? { iso8601: new Date(lastTs).toISOString(), unixMs: lastTs } : now,
      };
    } finally {
      await session.close();
    }
  }

  async getRebellionRisk(npcId: string): Promise<{
    probability: number;
    factors: string[];
  }> {
    const profile = await this.getNPCProfile(npcId);
    return {
      probability: profile.rebellionProbability,
      factors: profile.traumaScore.currentScore > 0.3 ? ['high_trauma'] : [],
    };
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
