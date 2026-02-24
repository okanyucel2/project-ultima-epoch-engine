// =============================================================================
// ProviderAdapterFactory Tests
// =============================================================================

jest.mock('@anthropic-ai/sdk');
jest.mock('openai');

import { ProviderAdapterFactory } from '../../src/services/providers/adapter-factory';
import { ModelRegistry } from '../../src/services/model-registry';
import { ProviderType } from '../../shared/types/ai-router';

describe('ProviderAdapterFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create adapters when API keys are set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const factory = new ProviderAdapterFactory(new ModelRegistry());

    expect(factory.hasAdapter(ProviderType.ANTHROPIC)).toBe(true);
    expect(factory.hasAdapter(ProviderType.OPENAI)).toBe(true);
    expect(factory.getAdapter(ProviderType.ANTHROPIC)).toBeDefined();
    expect(factory.getAdapter(ProviderType.OPENAI)).toBeDefined();
  });

  it('should return undefined and warn when API keys are missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const factory = new ProviderAdapterFactory(new ModelRegistry());

    expect(factory.hasAdapter(ProviderType.ANTHROPIC)).toBe(false);
    expect(factory.hasAdapter(ProviderType.OPENAI)).toBe(false);
    expect(factory.getAdapter(ProviderType.ANTHROPIC)).toBeUndefined();

    const warnings = factory.getWarnings();
    expect(warnings.size).toBeGreaterThan(0);
    expect(warnings.get(ProviderType.ANTHROPIC)).toContain('ANTHROPIC_API_KEY');

    warnSpy.mockRestore();
  });

  it('should skip Google adapter with warning', () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const factory = new ProviderAdapterFactory(new ModelRegistry());

    expect(factory.hasAdapter(ProviderType.GOOGLE)).toBe(false);
    expect(factory.getWarnings().get(ProviderType.GOOGLE)).toContain('not yet implemented');

    warnSpy.mockRestore();
  });
});
