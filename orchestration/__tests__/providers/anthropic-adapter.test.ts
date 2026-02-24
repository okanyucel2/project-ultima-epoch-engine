// =============================================================================
// AnthropicAdapter Tests — Mocked SDK, no real API calls
// =============================================================================

jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAdapter } from '../../src/services/providers/anthropic-adapter';
import { EpochError, ErrorCode } from '../../shared/types/common';

describe('AnthropicAdapter', () => {
  let mockCreate: jest.Mock;
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    adapter = new AnthropicAdapter('test-api-key');
  });

  it('should return content and token counts on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from Claude' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await adapter.complete('claude-haiku-4-5', 'Hello');
    expect(result.content).toBe('Hello from Claude');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });

  it('should map rate limit errors to EpochError', async () => {
    const rateLimitError = new Error('Rate limited');
    Object.setPrototypeOf(rateLimitError, Anthropic.RateLimitError.prototype);

    mockCreate.mockRejectedValue(rateLimitError);

    try {
      await adapter.complete('claude-haiku-4-5', 'test');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EpochError);
      expect((error as EpochError).code).toBe(ErrorCode.INTERNAL);
    }
  });

  it('should pass systemPrompt, temperature, and maxTokens to API', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    await adapter.complete('claude-haiku-4-5', 'test prompt', {
      systemPrompt: 'You are an NPC advisor',
      temperature: 0.7,
      maxTokens: 500,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        system: 'You are an NPC advisor',
        temperature: 0.7,
        max_tokens: 500,
        messages: [{ role: 'user', content: 'test prompt' }],
      }),
    );
  });

  it('should concatenate multiple text blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Part one. ' },
        { type: 'text', text: 'Part two.' },
      ],
      usage: { input_tokens: 8, output_tokens: 6 },
    });

    const result = await adapter.complete('claude-opus-4-6', 'multi-block test');
    expect(result.content).toBe('Part one. Part two.');
  });

  it('should map connection timeout to TIMEOUT error code', async () => {
    const timeoutError = new Error('Connection timed out');
    Object.setPrototypeOf(timeoutError, Anthropic.APIConnectionTimeoutError.prototype);

    mockCreate.mockRejectedValue(timeoutError);

    try {
      await adapter.complete('claude-haiku-4-5', 'test');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EpochError);
      expect((error as EpochError).code).toBe(ErrorCode.TIMEOUT);
    }
  });
});
