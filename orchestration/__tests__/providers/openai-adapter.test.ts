// =============================================================================
// OpenAIAdapter Tests — Mocked SDK, no real API calls
// =============================================================================

jest.mock('openai');

import OpenAI from 'openai';
import { OpenAIAdapter } from '../../src/services/providers/openai-adapter';
import { EpochError, ErrorCode } from '../../shared/types/common';

describe('OpenAIAdapter', () => {
  let mockCreate: jest.Mock;
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    mockCreate = jest.fn();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
    adapter = new OpenAIAdapter('test-api-key');
  });

  it('should return content and token counts on success', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello from GPT' } }],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
    });

    const result = await adapter.complete('gpt-4o-mini', 'Hello');
    expect(result.content).toBe('Hello from GPT');
    expect(result.inputTokens).toBe(8);
    expect(result.outputTokens).toBe(4);
  });

  it('should map timeout errors to TIMEOUT error code', async () => {
    const timeoutError = new Error('Request timed out');
    Object.setPrototypeOf(timeoutError, OpenAI.APIConnectionTimeoutError.prototype);

    mockCreate.mockRejectedValue(timeoutError);

    try {
      await adapter.complete('gpt-4o-mini', 'test');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EpochError);
      expect((error as EpochError).code).toBe(ErrorCode.TIMEOUT);
    }
  });

  it('should include system message when systemPrompt provided', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });

    await adapter.complete('gpt-4o-mini', 'test prompt', {
      systemPrompt: 'You are a game NPC',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a game NPC' },
          { role: 'user', content: 'test prompt' },
        ],
      }),
    );
  });

  it('should not include system message when systemPrompt omitted', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    await adapter.complete('gpt-4o-mini', 'test prompt');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'test prompt' }],
      }),
    );
  });

  it('should handle empty choices gracefully', async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      usage: { prompt_tokens: 5, completion_tokens: 0 },
    });

    const result = await adapter.complete('gpt-4o-mini', 'test');
    expect(result.content).toBe('');
    expect(result.outputTokens).toBe(0);
  });
});
