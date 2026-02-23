import {
  hyperbolicDecay,
  exponentialDecay,
  linearDecay,
  applyDecay,
} from '../src/trauma/decay-functions';
import { DecayStrategy } from '../../shared/types/memory';
import type { DecayConfig } from '../../shared/types/memory';

describe('decay-functions', () => {
  // =========================================================================
  // Hyperbolic Decay: score * (1 / (1 + alpha * hoursElapsed))
  // =========================================================================

  describe('hyperbolicDecay', () => {
    it('returns original score at t=0', () => {
      const result = hyperbolicDecay(0.8, 0.1, 0);
      expect(result).toBeCloseTo(0.8, 5);
    });

    it('returns ~0.5 of score at t=10, alpha=0.1', () => {
      // score * 1/(1 + 0.1*10) = score * 1/2 = score * 0.5
      const result = hyperbolicDecay(1.0, 0.1, 10);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('returns ~0.09 at t=100, alpha=0.1', () => {
      // score * 1/(1 + 0.1*100) = 1 * 1/11 ≈ 0.0909
      const result = hyperbolicDecay(1.0, 0.1, 100);
      expect(result).toBeCloseTo(1.0 / 11, 4);
    });

    it('never returns exactly 0', () => {
      const result = hyperbolicDecay(1.0, 0.1, 1_000_000);
      expect(result).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Exponential Decay: score * e^(-lambda * hoursElapsed)
  // =========================================================================

  describe('exponentialDecay', () => {
    it('returns original score at t=0', () => {
      const result = exponentialDecay(0.7, 0.05, 0);
      expect(result).toBeCloseTo(0.7, 5);
    });

    it('decreases over time', () => {
      const early = exponentialDecay(1.0, 0.05, 10);
      const late = exponentialDecay(1.0, 0.05, 100);
      expect(early).toBeGreaterThan(late);
      expect(late).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Linear Decay: max(0, score * (1 - rate * hoursElapsed))
  // =========================================================================

  describe('linearDecay', () => {
    it('floors at 0', () => {
      const result = linearDecay(0.5, 0.01, 200);
      // 0.5 * (1 - 0.01 * 200) = 0.5 * (1 - 2) = 0.5 * (-1) → clamped to 0
      expect(result).toBe(0);
    });
  });

  // =========================================================================
  // applyDecay — routing based on config.strategy
  // =========================================================================

  describe('applyDecay', () => {
    it('routes to hyperbolic by default', () => {
      const config: DecayConfig = {
        strategy: DecayStrategy.HYPERBOLIC,
        alpha: 0.1,
        lambda: 0.05,
        linearRate: 0.01,
      };
      const result = applyDecay(1.0, config, 10);
      const expected = hyperbolicDecay(1.0, 0.1, 10);
      expect(result).toBeCloseTo(expected, 5);
    });

    it('routes to exponential when configured', () => {
      const config: DecayConfig = {
        strategy: DecayStrategy.EXPONENTIAL,
        alpha: 0.1,
        lambda: 0.05,
        linearRate: 0.01,
      };
      const result = applyDecay(1.0, config, 10);
      const expected = exponentialDecay(1.0, 0.05, 10);
      expect(result).toBeCloseTo(expected, 5);
    });

    it('routes to linear when configured', () => {
      const config: DecayConfig = {
        strategy: DecayStrategy.LINEAR,
        alpha: 0.1,
        lambda: 0.05,
        linearRate: 0.01,
      };
      const result = applyDecay(1.0, config, 50);
      const expected = linearDecay(1.0, 0.01, 50);
      expect(result).toBeCloseTo(expected, 5);
    });
  });
});
