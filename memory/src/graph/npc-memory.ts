import neo4j, { Driver, Session } from 'neo4j-driver';

export interface NPCMemoryNode {
  npcId: string;
  event: string;
  playerAction: string;
  wisdomScore: number;
  traumaScore: number;
  timestamp: Date;
}

export class NPCMemoryGraph {
  private driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async recordMemory(memory: NPCMemoryNode): Promise<void> {
    const session: Session = this.driver.session();
    try {
      await session.run(
        `MERGE (npc:NPC {id: $npcId})
         CREATE (m:Memory {
           event: $event,
           playerAction: $playerAction,
           wisdomScore: $wisdomScore,
           traumaScore: $traumaScore,
           timestamp: datetime($timestamp)
         })
         CREATE (npc)-[:REMEMBERS]->(m)`,
        {
          npcId: memory.npcId,
          event: memory.event,
          playerAction: memory.playerAction,
          wisdomScore: memory.wisdomScore,
          traumaScore: memory.traumaScore,
          timestamp: memory.timestamp.toISOString(),
        }
      );
    } finally {
      await session.close();
    }
  }

  async getRebellionProbability(npcId: string): Promise<number> {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
         RETURN avg(m.traumaScore) as avgTrauma, count(m) as memoryCount`,
        { npcId }
      );
      const record = result.records[0];
      if (!record) return 0;
      const avgTrauma = record.get('avgTrauma') as number || 0;
      return Math.min(avgTrauma / 100, 1.0);
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
