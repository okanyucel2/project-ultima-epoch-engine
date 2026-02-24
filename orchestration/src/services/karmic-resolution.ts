// =============================================================================
// Karmic Resolution — Sheriff Protocol consequences for NPC memory graph
// =============================================================================
// After a cleansing operation, applies karmic consequences to participating NPCs:
//   Success: Hero of the Colony — wisdom bonus, confidence boost
//   Failure: Survivor's Guilt — permanent trauma, Director confidence hit
// =============================================================================

import type { CleansingResult } from '@epoch/shared/cleansing';
import type { MemoryIntegration } from './memory-integration';
import type { EpochWebSocketServer } from './websocket-server';

export interface KarmicConfig {
  heroWisdomBonus: number;       // Wisdom score for heroes (default: 0.4)
  heroConfidenceBoost: number;   // Confidence boost for heroes (default: 0.2)
  failureTraumaScore: number;    // Trauma score on failure (default: 0.8)
  failureConfidenceHit: number;  // Confidence penalty on failure (default: 0.3)
}

const DEFAULT_KARMIC_CONFIG: KarmicConfig = {
  heroWisdomBonus: 0.4,
  heroConfidenceBoost: 0.2,
  failureTraumaScore: 0.8,
  failureConfidenceHit: 0.3,
};

export async function applyKarmicResolution(
  result: CleansingResult,
  memoryIntegration: MemoryIntegration,
  wsServer: EpochWebSocketServer,
  config?: Partial<KarmicConfig>,
): Promise<void> {
  const cfg = { ...DEFAULT_KARMIC_CONFIG, ...config };

  if (result.success) {
    // Success path — Hero of the Colony
    for (const npcId of result.participantIds) {
      if (memoryIntegration.isAvailable()) {
        await memoryIntegration.recordActionOutcome(
          npcId,
          'cleansing_hero',
          true,
          cfg.heroConfidenceBoost,
        );
      }
    }

    wsServer.broadcast('system-status', {
      type: 'cleansing_result',
      success: true,
      successRate: result.successRate,
      participantCount: result.participantCount,
      participantIds: result.participantIds,
    });
  } else {
    // Failure path — Survivor's Guilt
    for (const npcId of result.participantIds) {
      if (memoryIntegration.isAvailable()) {
        // Record permanent trauma memory
        await memoryIntegration.recordActionOutcome(
          npcId,
          'cleansing_failure',
          false,
          cfg.failureTraumaScore,
        );

        // Director confidence hit
        await memoryIntegration.recordActionOutcome(
          npcId,
          'punishment',
          false,
          cfg.failureConfidenceHit,
        );
      }
    }

    wsServer.broadcast('system-status', {
      type: 'cleansing_result',
      success: false,
      successRate: result.successRate,
      participantCount: result.participantCount,
      participantIds: result.participantIds,
    });
  }
}
