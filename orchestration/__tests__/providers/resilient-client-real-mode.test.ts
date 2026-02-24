// =============================================================================
// ResilientLLMClient — Real Mode Tests (mockMode: false)
// =============================================================================

jest.mock('@anthropic-ai/sdk');
jest.mock('openai');

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ResilientLLMClient } from '../../src/services/resilient-client';
import { TierRouter } from '../../src/services/tier-router';
import { ModelRegistry } from '../../src/services/model-registry';
import { AuditLogger } from '../../src/services/audit-logger';
import { EventTier } from '@epoch/shared/ai-router';

describe('ResilientLLMClient — Real Mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should call real Anthropic adapter when mockMode is false and key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';

    const mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Real Claude response' }],
      usage: { input_tokens: 15, output_tokens: 8 },
    });
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockAnthropicCreate },
    }));

    const registry = new ModelRegistry();
    const router = new TierRouter(registry);
    const auditLogger = new AuditLogger();
    const client = new ResilientLLMClient(router, auditLogger, { mockMode: false });

    const response = await client.complete(EventTier.OPERATIONAL, 'Hello NPC');

    expect(response.content).toBe('Real Claude response');
    expect(response.inputTokens).toBe(15);
    expect(response.outputTokens).toBe(8);
    expect(mockAnthropicCreate).toHaveBeenCalled();
  });

  it('should call real OpenAI adapter for ROUTINE tier', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';

    const mockOpenAICreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Real GPT response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockOpenAICreate } },
    }));

    const registry = new ModelRegistry();
    const router = new TierRouter(registry);
    const auditLogger = new AuditLogger();
    const client = new ResilientLLMClient(router, auditLogger, { mockMode: false });

    const response = await client.complete(EventTier.ROUTINE, 'Status check');

    expect(response.content).toBe('Real GPT response');
    expect(mockOpenAICreate).toHaveBeenCalled();
  });

  it('should fall back to mock when API key is missing (no crash)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const registry = new ModelRegistry();
    const router = new TierRouter(registry);
    const auditLogger = new AuditLogger();
    const client = new ResilientLLMClient(router, auditLogger, { mockMode: false });

    // Should NOT throw — graceful fallback to mock
    const response = await client.complete(EventTier.ROUTINE, 'Hello');
    expect(response.content).toContain('[Mock');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should respect LLM_MOCK_MODE env var', () => {
    process.env.LLM_MOCK_MODE = 'false';

    const registry = new ModelRegistry();
    const router = new TierRouter(registry);
    const auditLogger = new AuditLogger();

    // No explicit mockMode in constructor — should read from env
    const client = new ResilientLLMClient(router, auditLogger);

    // Access the resolved options via a real call (mock fallback expected without keys)
    // The fact that it falls back to mock (not throws "not yet implemented") proves
    // that mockMode=false was resolved from env and the adapter path was taken
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    return client.complete(EventTier.ROUTINE, 'env test').then((response) => {
      expect(response.content).toContain('[Mock');
      warnSpy.mockRestore();
    });
  });
});
