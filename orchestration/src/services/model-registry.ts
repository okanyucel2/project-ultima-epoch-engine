// =============================================================================
// ModelRegistry — Single Source of Truth for AI Models
// =============================================================================
// Ported from Genesis model_registry.py
// Multi-provider support: Anthropic, OpenAI, Google, Custom
// Default tier mapping per AI Judgment Matrix (P0.78):
//   ROUTINE     → GPT-4o-mini (OpenAI)
//   OPERATIONAL → Claude Haiku 4.5 (Anthropic)
//   STRATEGIC   → Claude Opus 4.6 (Anthropic)
// =============================================================================

import {
  EventTier,
  ProviderType,
  ModelConfig,
  ProviderConfig,
} from '@epoch/shared/ai-router';

// =============================================================================
// Default Provider Configurations
// =============================================================================

function createDefaultProviders(): ProviderConfig[] {
  return [
    // -------------------------------------------------------------------------
    // Anthropic — Tier 2 (OPERATIONAL) + Tier 3 (STRATEGIC)
    // -------------------------------------------------------------------------
    {
      type: ProviderType.ANTHROPIC,
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com/v1',
      rateLimitPerMinute: 60,
      priority: 1,
      enabled: true,
      models: [
        {
          id: 'claude-haiku-4-5',
          provider: ProviderType.ANTHROPIC,
          tier: EventTier.OPERATIONAL,
          displayName: 'Claude Haiku 4.5',
          inputCostPerMTok: 0.80,
          outputCostPerMTok: 4.0,
          maxTokens: 8192,
          isDefault: true,
        },
        {
          id: 'claude-opus-4-6',
          provider: ProviderType.ANTHROPIC,
          tier: EventTier.STRATEGIC,
          displayName: 'Claude Opus 4.6',
          inputCostPerMTok: 15.0,
          outputCostPerMTok: 75.0,
          maxTokens: 32768,
          isDefault: true,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // OpenAI — Tier 1 (ROUTINE)
    // -------------------------------------------------------------------------
    {
      type: ProviderType.OPENAI,
      apiKeyEnv: 'OPENAI_API_KEY',
      baseUrl: 'https://api.openai.com/v1',
      rateLimitPerMinute: 500,
      priority: 2,
      enabled: true,
      models: [
        {
          id: 'gpt-4o-mini',
          provider: ProviderType.OPENAI,
          tier: EventTier.ROUTINE,
          displayName: 'GPT-4o Mini',
          inputCostPerMTok: 0.15,
          outputCostPerMTok: 0.60,
          maxTokens: 16384,
          isDefault: true,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // Google — Fallback provider
    // -------------------------------------------------------------------------
    {
      type: ProviderType.GOOGLE,
      apiKeyEnv: 'GOOGLE_API_KEY',
      baseUrl: 'https://generativelanguage.googleapis.com/v1',
      rateLimitPerMinute: 60,
      priority: 3,
      enabled: true,
      models: [
        {
          id: 'gemini-2.0-flash',
          provider: ProviderType.GOOGLE,
          tier: EventTier.ROUTINE,
          displayName: 'Gemini 2.0 Flash',
          inputCostPerMTok: 0.075,
          outputCostPerMTok: 0.30,
          maxTokens: 8192,
          isDefault: false,
        },
        {
          id: 'gemini-2.0-pro',
          provider: ProviderType.GOOGLE,
          tier: EventTier.OPERATIONAL,
          displayName: 'Gemini 2.0 Pro',
          inputCostPerMTok: 1.25,
          outputCostPerMTok: 5.0,
          maxTokens: 8192,
          isDefault: false,
        },
      ],
    },
  ];
}

// =============================================================================
// ModelRegistry Class
// =============================================================================

export class ModelRegistry {
  private providers: Map<ProviderType, ProviderConfig> = new Map();

  constructor(providers?: ProviderConfig[]) {
    const configs = providers ?? createDefaultProviders();
    for (const provider of configs) {
      this.providers.set(provider.type, provider);
    }
  }

  // ---------------------------------------------------------------------------
  // Model Lookup
  // ---------------------------------------------------------------------------

  /**
   * Get a model by its ID (alias), e.g., "gpt-4o-mini" or "claude-opus-4-6".
   * Searches across all providers.
   */
  getModel(alias: string): ModelConfig | undefined {
    for (const provider of this.providers.values()) {
      const model = provider.models.find((m) => m.id === alias);
      if (model) return model;
    }
    return undefined;
  }

  /**
   * Get the default model for a given event tier.
   * Returns the first model marked as `isDefault` for this tier.
   */
  getModelForTier(tier: EventTier): ModelConfig | undefined {
    for (const provider of this.providers.values()) {
      const model = provider.models.find(
        (m) => m.tier === tier && m.isDefault,
      );
      if (model) return model;
    }
    return undefined;
  }

  /**
   * Get all registered models across all providers.
   */
  getAllModels(): ModelConfig[] {
    const models: ModelConfig[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.models);
    }
    return models;
  }

  // ---------------------------------------------------------------------------
  // Provider Lookup
  // ---------------------------------------------------------------------------

  /**
   * Get a provider configuration by type.
   */
  getProviderConfig(type: ProviderType): ProviderConfig | undefined {
    return this.providers.get(type);
  }

  /**
   * Get all provider configurations, sorted by priority (lower = higher priority).
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values()).sort(
      (a, b) => a.priority - b.priority,
    );
  }

  /**
   * Get all enabled providers, sorted by priority.
   */
  getEnabledProviders(): ProviderConfig[] {
    return this.getAllProviders().filter((p) => p.enabled);
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  /**
   * Add or replace a provider configuration.
   */
  addProvider(config: ProviderConfig): void {
    this.providers.set(config.type, config);
  }

  /**
   * Remove a provider. Returns true if the provider existed.
   */
  removeProvider(type: ProviderType): boolean {
    return this.providers.delete(type);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Find any model from a specific provider that can serve the given tier.
   * Prefers default models, falls back to any model of the tier, then any model.
   */
  findModelForProvider(
    providerType: ProviderType,
    tier: EventTier,
  ): ModelConfig | undefined {
    const provider = this.providers.get(providerType);
    if (!provider) return undefined;

    // Prefer default model for the tier
    const defaultModel = provider.models.find(
      (m) => m.tier === tier && m.isDefault,
    );
    if (defaultModel) return defaultModel;

    // Fall back to any model matching the tier
    const tierModel = provider.models.find((m) => m.tier === tier);
    if (tierModel) return tierModel;

    // Fall back to any model from this provider
    return provider.models[0];
  }
}
