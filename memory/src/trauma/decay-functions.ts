import { DecayStrategy } from '../../../shared/types/memory';
import type { DecayConfig } from '../../../shared/types/memory';

// =============================================================================
// DECAY FUNCTIONS — Pure mathematical functions for time-based score decay
//
// Used by TraumaScorer and ConfidenceManager to model how memories and trust
// fade over time. Three strategies are supported:
//   - Hyperbolic: Old trauma persists weakly (default for NPC psychology)
//   - Exponential: Fast forgetting (aggressive decay)
//   - Linear: Constant rate decrease (simplest model)
// =============================================================================

/**
 * Hyperbolic decay: `score * (1 / (1 + alpha * hoursElapsed))`
 *
 * Properties:
 *   - At t=0: returns original score
 *   - Never reaches exactly 0 (asymptotic approach)
 *   - Slow long-tail decay — old trauma persists weakly
 *
 * @param score - The raw score to decay (0-1)
 * @param alpha - Decay rate coefficient (higher = faster decay)
 * @param hoursElapsed - Time elapsed in hours since the event
 */
export function hyperbolicDecay(
  score: number,
  alpha: number,
  hoursElapsed: number,
): number {
  return score * (1 / (1 + alpha * hoursElapsed));
}

/**
 * Exponential decay: `score * e^(-lambda * hoursElapsed)`
 *
 * Properties:
 *   - At t=0: returns original score
 *   - Approaches 0 exponentially (faster than hyperbolic)
 *   - Standard radioactive-decay-like model
 *
 * @param score - The raw score to decay (0-1)
 * @param lambda - Decay constant (higher = faster decay)
 * @param hoursElapsed - Time elapsed in hours since the event
 */
export function exponentialDecay(
  score: number,
  lambda: number,
  hoursElapsed: number,
): number {
  return score * Math.exp(-lambda * hoursElapsed);
}

/**
 * Linear decay: `max(0, score * (1 - rate * hoursElapsed))`
 *
 * Properties:
 *   - At t=0: returns original score
 *   - Reaches exactly 0 at t = 1/rate
 *   - Floored at 0 (never negative)
 *
 * @param score - The raw score to decay (0-1)
 * @param rate - Per-hour decay rate
 * @param hoursElapsed - Time elapsed in hours since the event
 */
export function linearDecay(
  score: number,
  rate: number,
  hoursElapsed: number,
): number {
  return Math.max(0, score * (1 - rate * hoursElapsed));
}

/**
 * Routes to the correct decay function based on the provided config strategy.
 *
 * @param score - The raw score to decay
 * @param config - Decay configuration specifying strategy and parameters
 * @param hoursElapsed - Time elapsed in hours
 */
export function applyDecay(
  score: number,
  config: DecayConfig,
  hoursElapsed: number,
): number {
  switch (config.strategy) {
    case DecayStrategy.HYPERBOLIC:
      return hyperbolicDecay(score, config.alpha, hoursElapsed);
    case DecayStrategy.EXPONENTIAL:
      return exponentialDecay(score, config.lambda, hoursElapsed);
    case DecayStrategy.LINEAR:
      return linearDecay(score, config.linearRate, hoursElapsed);
    default: {
      // Exhaustive check — should never reach here with valid DecayStrategy
      const _exhaustive: never = config.strategy;
      throw new Error(`Unknown decay strategy: ${_exhaustive}`);
    }
  }
}
