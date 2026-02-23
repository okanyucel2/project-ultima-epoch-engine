// =============================================================================
// WISDOM QUERIES — Cypher query constants for NPC wisdom calculations
//
// All queries use parameterized inputs ($npcId) to prevent injection.
// These are consumed by WisdomScorer and TraumaScorer.
// =============================================================================

/**
 * Counts the total number of memories for an NPC.
 * Returns: { count: integer }
 */
export const QUERY_MEMORY_COUNT = `
  MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
  RETURN count(m) AS count
`;

/**
 * Counts distinct event types vs total available event types.
 * Returns: { distinct: integer, total: integer }
 *
 * Note: total is the count of all distinct event types across ALL NPCs
 * in the graph, giving a universe-relative diversity measure.
 */
export const QUERY_EVENT_DIVERSITY = `
  MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
  WITH count(DISTINCT m.playerAction) AS distinctTypes
  OPTIONAL MATCH (:NPC)-[:REMEMBERS]->(allM:Memory)
  WITH distinctTypes, count(DISTINCT allM.playerAction) AS totalTypes
  RETURN distinctTypes AS distinct,
         CASE WHEN totalTypes = 0 THEN 0 ELSE totalTypes END AS total
`;

/**
 * Gets the earliest and latest memory timestamps for temporal span.
 * Returns: { minTs: integer|null, maxTs: integer|null }
 *
 * Timestamps are stored as Unix milliseconds.
 */
export const QUERY_TEMPORAL_SPAN = `
  MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
  RETURN min(m.timestamp) AS minTs,
         max(m.timestamp) AS maxTs
`;

/**
 * Counts positive events (reward, dialogue) vs total events.
 * Returns: { positive: integer, total: integer }
 *
 * Positive actions: 'reward', 'dialogue'
 * This aligns with the ConfidenceManager's positive modifiers.
 */
export const QUERY_POSITIVE_RATIO = `
  MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
  WITH count(m) AS total,
       count(CASE WHEN m.playerAction IN ['reward', 'dialogue'] THEN 1 END) AS positive
  RETURN positive, total
`;

/**
 * Gets all memories with their timestamps for decay calculations.
 * Returns: { traumaScore: float, timestamp: integer }
 *
 * Used by TraumaScorer to apply individual time decay to each memory.
 */
export const QUERY_ALL_MEMORIES = `
  MATCH (npc:NPC {id: $npcId})-[:REMEMBERS]->(m:Memory)
  RETURN m.traumaScore AS traumaScore,
         m.timestamp AS timestamp
  ORDER BY m.timestamp DESC
`;
