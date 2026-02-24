// =============================================================================
// OpenAIAdapter — Real OpenAI API integration via openai SDK
// =============================================================================

import OpenAI from 'openai';
import { EpochError, ErrorCode } from '@epoch/shared/common';
import { ProviderType } from '@epoch/shared/ai-router';
import type { CompletionOptions } from '../resilient-client';
import type { ProviderAdapter, ProviderCompletionResult } from './types';

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerType = ProviderType.OPENAI;
  private readonly client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
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
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await this.client.chat.completions.create({
        model,
        messages,
        ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

      return {
        content: response.choices[0]?.message?.content ?? '',
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof EpochError) throw error;
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): EpochError {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new EpochError(ErrorCode.TIMEOUT, 'OpenAI request timed out', error.message);
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return new EpochError(ErrorCode.TIMEOUT, 'OpenAI connection failed', error.message);
    }
    if (error instanceof OpenAI.RateLimitError) {
      return new EpochError(ErrorCode.INTERNAL, 'OpenAI rate limit exceeded', error.message);
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return new EpochError(ErrorCode.INTERNAL, 'OpenAI authentication failed', error.message);
    }
    if (error instanceof OpenAI.APIError) {
      return new EpochError(ErrorCode.INTERNAL, `OpenAI API error: ${error.message}`, String(error.status));
    }
    return new EpochError(ErrorCode.INTERNAL, 'Unknown OpenAI error', String(error));
  }
}
