// =============================================================================
// AEGISSupervisor — Cognitive Intervention based on Infestation Level
// =============================================================================
// Evaluates director actions against the current infestation level:
//   - Level < 50:  ALLOW — no intervention
//   - Level 50-99: WHISPER — advisory warning, doesn't block
//   - Level 100 + aggressive action: VETO — blocks the action
//
// "Aggressive" = command or punishment with intensity > 0.5
// =============================================================================

export type AEGISDecision = 'allow' | 'whisper' | 'veto';

export interface AEGISEvaluationResult {
  decision: AEGISDecision;
  infestationLevel: number;
  message?: string;
  vetoedByAegis: boolean;
}

const AGGRESSIVE_ACTION_TYPES = new Set(['command', 'punishment']);
const AGGRESSIVE_INTENSITY_THRESHOLD = 0.5;

export class AEGISSupervisor {
  private infestationLevel: number = 0;

  /**
   * Update the current infestation level from telemetry/gRPC sync.
   */
  updateInfestationLevel(level: number): void {
    this.infestationLevel = Math.max(0, Math.min(100, level));
  }

  /**
   * Get the current infestation level.
   */
  getInfestationLevel(): number {
    return this.infestationLevel;
  }

  /**
   * Evaluate a director action against the current infestation state.
   *
   * Decision matrix:
   * - Level < 50: ALLOW (no intervention)
   * - Level 50-99: WHISPER (advisory, doesn't block)
   * - Level >= 100 + aggressive action: VETO (blocks)
   * - Level >= 100 + non-aggressive or low-intensity: WHISPER (warn but allow)
   */
  evaluateAction(
    eventType: string,
    intensity: number,
    npcId?: string,
  ): AEGISEvaluationResult {
    const level = this.infestationLevel;

    // Below warning threshold — allow everything
    if (level < 50) {
      return {
        decision: 'allow',
        infestationLevel: level,
        vetoedByAegis: false,
      };
    }

    // At Plague Heart (>= 100) with aggressive action → VETO
    if (level >= 100 && this.isAggressiveAction(eventType, intensity)) {
      return {
        decision: 'veto',
        infestationLevel: level,
        message: `AEGIS VETO: Plague Heart active (${level}/100). Aggressive action "${eventType}" (intensity=${intensity.toFixed(2)}) blocked${npcId ? ` for NPC ${npcId}` : ''}.`,
        vetoedByAegis: true,
      };
    }

    // Level 50-99 or level >= 100 with non-aggressive → WHISPER
    const severity = level >= 100 ? 'CRITICAL' : level >= 75 ? 'HIGH' : 'ELEVATED';
    return {
      decision: 'whisper',
      infestationLevel: level,
      message: `AEGIS Advisory [${severity}]: Infestation at ${level}/100. ${level >= 100 ? 'Plague Heart active — production throttled 50%.' : 'System stress accumulating.'}${npcId ? ` NPC: ${npcId}` : ''}`,
      vetoedByAegis: false,
    };
  }

  /**
   * Determine if an action is "aggressive" — command/punishment with high intensity.
   */
  isAggressiveAction(eventType: string, intensity: number): boolean {
    return AGGRESSIVE_ACTION_TYPES.has(eventType) && intensity > AGGRESSIVE_INTENSITY_THRESHOLD;
  }
}
