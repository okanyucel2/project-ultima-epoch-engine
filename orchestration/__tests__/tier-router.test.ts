import { TierRouter } from '../src/services/tier-router';
import { ModelRegistry } from '../src/services/model-registry';
import { ProviderCircuitBreaker } from '../src/services/circuit-breaker';
import {
  EventTier,
  ProviderType,
  CircuitBreakerConfig,
} from '@epoch/shared/ai-router';
import { ErrorCode, EpochError } from '@epoch/shared/common';

describe('TierRouter', () => {
  let router: TierRouter;
  let registry: ModelRegistry;
  const cbConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    recoveryTimeoutMs: 5000,
    halfOpenMaxRequests: 2,
    monitoringWindowMs: 60000,
  };

  beforeEach(() => {
    registry = new ModelRegistry();
    router = new TierRouter(registry, cbConfig);
  });

  test('routes ROUTINE to OpenAI/GPT-4o-mini', () => {
    const result = router.route(EventTier.ROUTINE);
    expect(result.provider).toBe(ProviderType.OPENAI);
    expect(result.model).toBe('gpt-4o-mini');
  });

  test('routes OPERATIONAL to Anthropic/Haiku', () => {
    const result = router.route(EventTier.OPERATIONAL);
    expect(result.provider).toBe(ProviderType.ANTHROPIC);
    expect(result.model).toBe('claude-haiku-4-5');
  });

  test('routes STRATEGIC to Anthropic/Opus', () => {
    const result = router.route(EventTier.STRATEGIC);
    expect(result.provider).toBe(ProviderType.ANTHROPIC);
    expect(result.model).toBe('claude-opus-4-6');
  });

  test('falls back when primary circuit is OPEN', () => {
    // Trip the OpenAI circuit breaker (used for ROUTINE)
    const openaiBreaker = router.getCircuitBreaker(ProviderType.OPENAI);
    for (let i = 0; i < cbConfig.failureThreshold; i++) {
      openaiBreaker.recordFailure();
    }

    // ROUTINE normally goes to OpenAI, should failover to next available
    const result = router.route(EventTier.ROUTINE);
    expect(result.provider).not.toBe(ProviderType.OPENAI);
    // Should get a valid model from the fallback provider
    expect(result.model).toBeDefined();
  });

  test('throws CIRCUIT_OPEN when all providers are down', () => {
    // Trip ALL circuit breakers
    const providers = [ProviderType.ANTHROPIC, ProviderType.OPENAI, ProviderType.GOOGLE];
    for (const provider of providers) {
      const breaker = router.getCircuitBreaker(provider);
      for (let i = 0; i < cbConfig.failureThreshold; i++) {
        breaker.recordFailure();
      }
    }

    expect(() => router.route(EventTier.ROUTINE)).toThrow(EpochError);
    try {
      router.route(EventTier.ROUTINE);
    } catch (e) {
      expect(e).toBeInstanceOf(EpochError);
      expect((e as EpochError).code).toBe(ErrorCode.CIRCUIT_OPEN);
    }
  });

  test('uses provider priority for failover order', () => {
    // Trip OpenAI (primary for ROUTINE)
    const openaiBreaker = router.getCircuitBreaker(ProviderType.OPENAI);
    for (let i = 0; i < cbConfig.failureThreshold; i++) {
      openaiBreaker.recordFailure();
    }

    // Failover should go to next priority provider (Anthropic, priority 1)
    const result = router.route(EventTier.ROUTINE);
    expect(result.provider).toBe(ProviderType.ANTHROPIC);
  });

  test('respects circuit breaker state', () => {
    const anthropicBreaker = router.getCircuitBreaker(ProviderType.ANTHROPIC);
    expect(anthropicBreaker.canRequest()).toBe(true);

    // Trip it
    for (let i = 0; i < cbConfig.failureThreshold; i++) {
      anthropicBreaker.recordFailure();
    }
    expect(anthropicBreaker.canRequest()).toBe(false);

    // OPERATIONAL normally routes to Anthropic, should failover
    const result = router.route(EventTier.OPERATIONAL);
    expect(result.provider).not.toBe(ProviderType.ANTHROPIC);
  });

  test('routes consistently for same tier', () => {
    const result1 = router.route(EventTier.STRATEGIC);
    const result2 = router.route(EventTier.STRATEGIC);
    const result3 = router.route(EventTier.STRATEGIC);

    expect(result1.provider).toBe(result2.provider);
    expect(result1.model).toBe(result2.model);
    expect(result2.provider).toBe(result3.provider);
    expect(result2.model).toBe(result3.model);
  });

  test('getAllCircuitBreakers returns a map of all breakers', () => {
    const breakers = router.getAllCircuitBreakers();
    expect(breakers.size).toBeGreaterThanOrEqual(3);
    expect(breakers.has(ProviderType.ANTHROPIC)).toBe(true);
    expect(breakers.has(ProviderType.OPENAI)).toBe(true);
    expect(breakers.has(ProviderType.GOOGLE)).toBe(true);
  });

  test('getCircuitBreaker throws for unknown provider', () => {
    expect(() => router.getCircuitBreaker(ProviderType.CUSTOM)).toThrow(EpochError);
  });
});
