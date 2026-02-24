// =============================================================================
// TierRouter — Route Event Tiers to AI Providers with Circuit Breaker
// =============================================================================
// Decision flow:
// 1. Get default provider for the tier (from DEFAULT_TIER_MODELS)
// 2. Check circuit breaker for that provider
// 3. If circuit is open → try failover providers (sorted by priority)
// 4. If ALL providers down → throw EpochError(CIRCUIT_OPEN)
// =============================================================================

import {
  EventTier,
  ProviderType,
  CircuitBreakerConfig,
  DEFAULT_TIER_MODELS,
} from '@epoch/shared/ai-router';
import { ErrorCode, EpochError } from '@epoch/shared/common';
import { ProviderCircuitBreaker } from './circuit-breaker';
import { ModelRegistry } from './model-registry';

export interface RouteResult {
  provider: ProviderType;
  model: string;
}

export class TierRouter {
  private readonly registry: ModelRegistry;
  private readonly circuitBreakers: Map<ProviderType, ProviderCircuitBreaker> = new Map();

  constructor(registry: ModelRegistry, cbConfig?: Partial<CircuitBreakerConfig>) {
    this.registry = registry;

    // Create a circuit breaker for each enabled provider
    for (const provider of registry.getEnabledProviders()) {
      this.circuitBreakers.set(
        provider.type,
        new ProviderCircuitBreaker(provider.type, cbConfig),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Route an event tier to an available provider and model.
   *
   * @param tier - The event tier to route
   * @returns The selected provider and model
   * @throws EpochError with CIRCUIT_OPEN if all providers are unavailable
   */
  route(tier: EventTier): RouteResult {
    // 1. Try the default provider for this tier
    const defaultMapping = DEFAULT_TIER_MODELS[tier];
    const primaryBreaker = this.circuitBreakers.get(defaultMapping.provider);

    if (primaryBreaker && primaryBreaker.canRequest()) {
      return {
        provider: defaultMapping.provider,
        model: defaultMapping.modelId,
      };
    }

    // 2. Primary is down — try failover providers sorted by priority
    const fallbackProviders = this.registry
      .getEnabledProviders()
      .filter((p) => p.type !== defaultMapping.provider);

    for (const fallbackProvider of fallbackProviders) {
      const breaker = this.circuitBreakers.get(fallbackProvider.type);
      if (breaker && breaker.canRequest()) {
        // Find a suitable model from the fallback provider
        const model = this.registry.findModelForProvider(
          fallbackProvider.type,
          tier,
        );

        if (model) {
          return {
            provider: fallbackProvider.type,
            model: model.id,
          };
        }
      }
    }

    // 3. All providers are down
    throw new EpochError(
      ErrorCode.CIRCUIT_OPEN,
      `All providers unavailable for tier ${tier}`,
      `Primary provider ${defaultMapping.provider} and all fallback providers have open circuits`,
    );
  }

  /**
   * Get the circuit breaker for a specific provider.
   * Useful for recording success/failure from external callers.
   */
  getCircuitBreaker(provider: ProviderType): ProviderCircuitBreaker {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) {
      throw new EpochError(
        ErrorCode.NOT_FOUND,
        `No circuit breaker for provider: ${provider}`,
      );
    }
    return breaker;
  }

  /**
   * Get the model registry (used by ResilientLLMClient for provider config).
   */
  getRegistry(): ModelRegistry {
    return this.registry;
  }

  /**
   * Get all circuit breakers keyed by provider type.
   */
  getAllCircuitBreakers(): Map<ProviderType, ProviderCircuitBreaker> {
    return new Map(this.circuitBreakers);
  }
}
