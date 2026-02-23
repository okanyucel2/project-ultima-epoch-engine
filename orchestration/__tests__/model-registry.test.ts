import { ModelRegistry } from '../src/services/model-registry';
import {
  EventTier,
  ProviderType,
  ProviderConfig,
  DEFAULT_TIER_MODELS,
} from '../../shared/types/ai-router';

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  test('returns correct model for each tier', () => {
    const routineModel = registry.getModelForTier(EventTier.ROUTINE);
    expect(routineModel).toBeDefined();
    expect(routineModel!.tier).toBe(EventTier.ROUTINE);
    expect(routineModel!.isDefault).toBe(true);

    const operationalModel = registry.getModelForTier(EventTier.OPERATIONAL);
    expect(operationalModel).toBeDefined();
    expect(operationalModel!.tier).toBe(EventTier.OPERATIONAL);
    expect(operationalModel!.isDefault).toBe(true);

    const strategicModel = registry.getModelForTier(EventTier.STRATEGIC);
    expect(strategicModel).toBeDefined();
    expect(strategicModel!.tier).toBe(EventTier.STRATEGIC);
    expect(strategicModel!.isDefault).toBe(true);
  });

  test('returns all models', () => {
    const models = registry.getAllModels();
    expect(models.length).toBeGreaterThanOrEqual(3);
    // Should have at least one model per tier
    const tiers = new Set(models.map((m) => m.tier));
    expect(tiers.has(EventTier.ROUTINE)).toBe(true);
    expect(tiers.has(EventTier.OPERATIONAL)).toBe(true);
    expect(tiers.has(EventTier.STRATEGIC)).toBe(true);
  });

  test('returns provider config by type', () => {
    const anthropicConfig = registry.getProviderConfig(ProviderType.ANTHROPIC);
    expect(anthropicConfig).toBeDefined();
    expect(anthropicConfig!.type).toBe(ProviderType.ANTHROPIC);
    expect(anthropicConfig!.enabled).toBe(true);

    const openaiConfig = registry.getProviderConfig(ProviderType.OPENAI);
    expect(openaiConfig).toBeDefined();
    expect(openaiConfig!.type).toBe(ProviderType.OPENAI);
  });

  test('default tier mapping matches specification', () => {
    // ROUTINE → GPT-4o-mini (OpenAI)
    const routineModel = registry.getModelForTier(EventTier.ROUTINE);
    expect(routineModel!.id).toBe(DEFAULT_TIER_MODELS[EventTier.ROUTINE].modelId);
    expect(routineModel!.provider).toBe(DEFAULT_TIER_MODELS[EventTier.ROUTINE].provider);

    // OPERATIONAL → Haiku 4.5 (Anthropic)
    const opModel = registry.getModelForTier(EventTier.OPERATIONAL);
    expect(opModel!.id).toBe(DEFAULT_TIER_MODELS[EventTier.OPERATIONAL].modelId);
    expect(opModel!.provider).toBe(DEFAULT_TIER_MODELS[EventTier.OPERATIONAL].provider);

    // STRATEGIC → Opus 4.6 (Anthropic)
    const stratModel = registry.getModelForTier(EventTier.STRATEGIC);
    expect(stratModel!.id).toBe(DEFAULT_TIER_MODELS[EventTier.STRATEGIC].modelId);
    expect(stratModel!.provider).toBe(DEFAULT_TIER_MODELS[EventTier.STRATEGIC].provider);
  });

  test('handles unknown alias gracefully', () => {
    const result = registry.getModel('nonexistent-model-xyz');
    expect(result).toBeUndefined();
  });

  test('provider configs have correct API key env vars', () => {
    const anthropicConfig = registry.getProviderConfig(ProviderType.ANTHROPIC);
    expect(anthropicConfig!.apiKeyEnv).toBe('ANTHROPIC_API_KEY');

    const openaiConfig = registry.getProviderConfig(ProviderType.OPENAI);
    expect(openaiConfig!.apiKeyEnv).toBe('OPENAI_API_KEY');

    const googleConfig = registry.getProviderConfig(ProviderType.GOOGLE);
    expect(googleConfig!.apiKeyEnv).toBe('GOOGLE_API_KEY');
  });

  test('cost tracking values are set', () => {
    const models = registry.getAllModels();
    for (const model of models) {
      expect(model.inputCostPerMTok).toBeGreaterThanOrEqual(0);
      expect(model.outputCostPerMTok).toBeGreaterThanOrEqual(0);
      expect(model.maxTokens).toBeGreaterThan(0);
    }
  });

  test('can add custom provider', () => {
    const customProvider: ProviderConfig = {
      type: ProviderType.CUSTOM,
      apiKeyEnv: 'CUSTOM_API_KEY',
      baseUrl: 'http://localhost:8080/v1',
      models: [
        {
          id: 'local-llama',
          provider: ProviderType.CUSTOM,
          tier: EventTier.ROUTINE,
          displayName: 'Local LLaMA',
          inputCostPerMTok: 0,
          outputCostPerMTok: 0,
          maxTokens: 4096,
          isDefault: false,
        },
      ],
      rateLimitPerMinute: 100,
      priority: 10,
      enabled: true,
    };

    registry.addProvider(customProvider);
    const config = registry.getProviderConfig(ProviderType.CUSTOM);
    expect(config).toBeDefined();
    expect(config!.models.length).toBe(1);
    expect(config!.models[0].id).toBe('local-llama');
  });

  test('removeProvider removes and returns true for existing provider', () => {
    expect(registry.getProviderConfig(ProviderType.GOOGLE)).toBeDefined();
    const removed = registry.removeProvider(ProviderType.GOOGLE);
    expect(removed).toBe(true);
    expect(registry.getProviderConfig(ProviderType.GOOGLE)).toBeUndefined();
  });

  test('removeProvider returns false for non-existent provider', () => {
    const removed = registry.removeProvider(ProviderType.CUSTOM);
    expect(removed).toBe(false);
  });

  test('getEnabledProviders filters disabled providers', () => {
    // Add a disabled provider
    registry.addProvider({
      type: ProviderType.CUSTOM,
      apiKeyEnv: 'CUSTOM_KEY',
      baseUrl: 'http://localhost',
      models: [],
      rateLimitPerMinute: 10,
      priority: 99,
      enabled: false,
    });

    const enabled = registry.getEnabledProviders();
    expect(enabled.every((p) => p.enabled)).toBe(true);
    expect(enabled.find((p) => p.type === ProviderType.CUSTOM)).toBeUndefined();
  });

  test('getAllProviders returns sorted by priority', () => {
    const providers = registry.getAllProviders();
    for (let i = 1; i < providers.length; i++) {
      expect(providers[i].priority).toBeGreaterThanOrEqual(providers[i - 1].priority);
    }
  });

  test('findModelForProvider returns default model for tier', () => {
    const model = registry.findModelForProvider(ProviderType.ANTHROPIC, EventTier.OPERATIONAL);
    expect(model).toBeDefined();
    expect(model!.id).toBe('claude-haiku-4-5');
    expect(model!.isDefault).toBe(true);
  });

  test('findModelForProvider falls back to any tier model', () => {
    // Google has non-default ROUTINE model
    const model = registry.findModelForProvider(ProviderType.GOOGLE, EventTier.ROUTINE);
    expect(model).toBeDefined();
    expect(model!.provider).toBe(ProviderType.GOOGLE);
  });

  test('findModelForProvider falls back to any model when tier not available', () => {
    // Google has no STRATEGIC model, should fall back to any available
    const model = registry.findModelForProvider(ProviderType.GOOGLE, EventTier.STRATEGIC);
    expect(model).toBeDefined();
    expect(model!.provider).toBe(ProviderType.GOOGLE);
  });

  test('findModelForProvider returns undefined for unknown provider', () => {
    const model = registry.findModelForProvider(ProviderType.CUSTOM, EventTier.ROUTINE);
    expect(model).toBeUndefined();
  });

  test('getModel finds model by ID across providers', () => {
    const model = registry.getModel('gpt-4o-mini');
    expect(model).toBeDefined();
    expect(model!.provider).toBe(ProviderType.OPENAI);

    const haiku = registry.getModel('claude-haiku-4-5');
    expect(haiku).toBeDefined();
    expect(haiku!.provider).toBe(ProviderType.ANTHROPIC);
  });
});
