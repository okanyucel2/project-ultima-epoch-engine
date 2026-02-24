// =============================================================================
// Provider Adapter Types — Contract for real LLM provider integrations
// =============================================================================

import type { ProviderType } from '@epoch/shared/ai-router';
import type { CompletionOptions } from '../resilient-client';

export interface ProviderCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderAdapter {
  readonly providerType: ProviderType;

  /**
   * Execute a completion call against the real provider API.
   * Must throw EpochError on failure for circuit breaker compatibility.
   */
  complete(
    model: string,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<ProviderCompletionResult>;
}
