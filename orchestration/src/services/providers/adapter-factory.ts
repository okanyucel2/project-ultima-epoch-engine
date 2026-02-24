// =============================================================================
// ProviderAdapterFactory — Creates and caches provider adapters
// =============================================================================
// Reads API keys from environment variables (as configured in ModelRegistry).
// Missing keys → warning + provider uses mock fallback (no crash).
// =============================================================================

import { ProviderType } from '../../../shared/types/ai-router';
import type { ProviderConfig } from '../../../shared/types/ai-router';
import { ModelRegistry } from '../model-registry';
import type { ProviderAdapter } from './types';
import { AnthropicAdapter } from './anthropic-adapter';
import { OpenAIAdapter } from './openai-adapter';

export class ProviderAdapterFactory {
  private readonly adapters: Map<ProviderType, ProviderAdapter> = new Map();
  private readonly warnings: Map<ProviderType, string> = new Map();

  constructor(registry: ModelRegistry) {
    this.initializeAdapters(registry);
  }

  getAdapter(provider: ProviderType): ProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  hasAdapter(provider: ProviderType): boolean {
    return this.adapters.has(provider);
  }

  getWarnings(): Map<ProviderType, string> {
    return new Map(this.warnings);
  }

  private initializeAdapters(registry: ModelRegistry): void {
    for (const provider of registry.getEnabledProviders()) {
      this.tryCreateAdapter(provider);
    }
  }

  private tryCreateAdapter(config: ProviderConfig): void {
    const apiKey = process.env[config.apiKeyEnv];

    if (!apiKey) {
      const msg = `${config.apiKeyEnv} not set — provider ${config.type} will use mock fallback`;
      this.warnings.set(config.type, msg);
      console.warn(`[ProviderAdapterFactory] ${msg}`);
      return;
    }

    try {
      switch (config.type) {
        case ProviderType.ANTHROPIC:
          this.adapters.set(config.type, new AnthropicAdapter(apiKey, config.baseUrl));
          break;
        case ProviderType.OPENAI:
          this.adapters.set(config.type, new OpenAIAdapter(apiKey, config.baseUrl));
          break;
        case ProviderType.GOOGLE:
          this.warnings.set(config.type, 'Google adapter not yet implemented');
          break;
        case ProviderType.CUSTOM:
          // Custom adapters must be registered via addAdapter()
          break;
      }
    } catch (error) {
      const msg = `Failed to create ${config.type} adapter: ${error}`;
      this.warnings.set(config.type, msg);
      console.warn(`[ProviderAdapterFactory] ${msg}`);
    }
  }
}
