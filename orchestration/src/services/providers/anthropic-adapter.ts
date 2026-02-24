// =============================================================================
// AnthropicAdapter — Real Anthropic API integration via @anthropic-ai/sdk
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { EpochError, ErrorCode } from '@epoch/shared/common';
import { ProviderType } from '@epoch/shared/ai-router';
import type { CompletionOptions } from '../resilient-client';
import type { ProviderAdapter, ProviderCompletionResult } from './types';

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerType = ProviderType.ANTHROPIC;
  private readonly client: Anthropic;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      maxRetries: 0, // Circuit breaker handles retry logic
    });
  }

  async complete(
    model: string,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<ProviderCompletionResult> {
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      if (error instanceof EpochError) throw error;
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): EpochError {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new EpochError(ErrorCode.TIMEOUT, 'Anthropic request timed out', error.message);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new EpochError(ErrorCode.TIMEOUT, 'Anthropic connection failed', error.message);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new EpochError(ErrorCode.INTERNAL, 'Anthropic rate limit exceeded', error.message);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return new EpochError(ErrorCode.INTERNAL, 'Anthropic authentication failed', error.message);
    }
    if (error instanceof Anthropic.APIError) {
      return new EpochError(ErrorCode.INTERNAL, `Anthropic API error: ${error.message}`, String(error.status));
    }
    return new EpochError(ErrorCode.INTERNAL, 'Unknown Anthropic error', String(error));
  }
}
