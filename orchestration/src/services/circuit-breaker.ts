// =============================================================================
// ProviderCircuitBreaker — Ported from Genesis provider_circuit_breaker.py
// =============================================================================
// States: CLOSED (healthy) → OPEN (failing) → HALF_OPEN (testing recovery)
//
// CLOSED: All requests pass. Failures tracked within monitoring window.
//         After failureThreshold failures → OPEN
// OPEN:   All requests blocked. After recoveryTimeoutMs → HALF_OPEN
// HALF_OPEN: Limited requests allowed. successThreshold successes → CLOSED
//            Any failure → OPEN
// =============================================================================

import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerConfigSchema,
} from '@epoch/shared/ai-router';

export class ProviderCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private readonly config: CircuitBreakerConfig;
  private readonly providerId: string;

  // Failure timestamps within monitoring window (CLOSED state)
  private failureTimestamps: number[] = [];

  // Tracking for HALF_OPEN state
  private halfOpenSuccesses: number = 0;
  private halfOpenRequests: number = 0;

  // Timestamp when circuit transitioned to OPEN
  private openedAt: number = 0;

  constructor(providerId: string, config?: Partial<CircuitBreakerConfig>) {
    this.providerId = providerId;
    this.config = CircuitBreakerConfigSchema.parse(config ?? {});
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get the current circuit state, evaluating time-based transitions.
   * OPEN → HALF_OPEN happens automatically after recoveryTimeoutMs.
   */
  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
    return this.state;
  }

  /**
   * Check if a request is allowed through the circuit breaker.
   */
  canRequest(): boolean {
    const currentState = this.getState();

    switch (currentState) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        return false;

      case CircuitState.HALF_OPEN:
        return this.halfOpenRequests < this.config.halfOpenMaxRequests;

      default:
        return false;
    }
  }

  /**
   * Record a successful request. In HALF_OPEN, may transition to CLOSED.
   */
  recordSuccess(): void {
    const currentState = this.getState();

    if (currentState === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
    // In CLOSED state, successes don't change state
  }

  /**
   * Record a failed request. In CLOSED, may transition to OPEN.
   * In HALF_OPEN, immediately transitions to OPEN.
   */
  recordFailure(): void {
    const currentState = this.getState();

    switch (currentState) {
      case CircuitState.CLOSED: {
        const now = Date.now();
        this.failureTimestamps.push(now);
        this.pruneOldFailures(now);

        if (this.failureTimestamps.length >= this.config.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;
      }

      case CircuitState.HALF_OPEN:
        // Any failure in HALF_OPEN trips back to OPEN
        this.transitionTo(CircuitState.OPEN);
        break;

      case CircuitState.OPEN:
        // Already open, nothing to do
        break;
    }
  }

  /**
   * Reset the circuit breaker to CLOSED state, clearing all counters.
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Get the provider ID this circuit breaker protects.
   */
  getProviderId(): string {
    return this.providerId;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Remove failure timestamps outside the monitoring window.
   */
  private pruneOldFailures(now: number): void {
    const windowStart = now - this.config.monitoringWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => ts > windowStart,
    );
  }

  /**
   * Transition to a new state, resetting relevant counters.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    switch (newState) {
      case CircuitState.CLOSED:
        this.failureTimestamps = [];
        this.halfOpenSuccesses = 0;
        this.halfOpenRequests = 0;
        this.openedAt = 0;
        break;

      case CircuitState.OPEN:
        this.openedAt = Date.now();
        this.halfOpenSuccesses = 0;
        this.halfOpenRequests = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.halfOpenSuccesses = 0;
        this.halfOpenRequests = 0;
        break;
    }
  }
}
