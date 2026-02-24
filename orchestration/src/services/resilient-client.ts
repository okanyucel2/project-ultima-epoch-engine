// =============================================================================
// ResilientLLMClient — Fault-tolerant LLM completion with circuit breakers
// =============================================================================
// Wraps AI provider API calls with:
// - Tier-based routing (via TierRouter)
// - Circuit breaker integration (records success/failure)
// - Audit logging (every decision logged)
// - Latency measurement
//
// Mock mode (default) for testing; real providers via ProviderAdapterFactory.
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import {
  EventTier,
  ProviderType,
  AuditLogEntry,
  RoutingDecision,
  CircuitState,
} from '@epoch/shared/ai-router';
import { createTimestamp, EpochError, ErrorCode } from '@epoch/shared/common';
import { TierRouter } from './tier-router';
import { AuditLogger } from './audit-logger';
import { ProviderAdapterFactory } from './providers/adapter-factory';

// =============================================================================
// Types
// =============================================================================

export interface LLMResponse {
  content: string;
  provider: ProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ResilientClientOptions {
  /** Enable mock mode (no real API calls). Default: true for now. */
  mockMode?: boolean;
  /** If true, mock will simulate failures. */
  mockShouldFail?: boolean;
  /** Simulated latency range in ms [min, max]. */
  mockLatencyRange?: [number, number];
}

// =============================================================================
// Mock Response Generator
// =============================================================================

function generateMockResponse(
  provider: ProviderType,
  model: string,
  prompt: string,
  shouldFail: boolean,
): { content: string; inputTokens: number; outputTokens: number } {
  if (shouldFail) {
    throw new EpochError(
      ErrorCode.INTERNAL,
      `Mock failure for provider ${provider} model ${model}`,
      'Simulated API error for testing circuit breaker behavior',
    );
  }

  // Estimate tokens from prompt (rough: ~4 chars per token)
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const outputTokens = Math.max(1, Math.ceil(inputTokens * 0.5));

  return {
    content: `[Mock ${provider}/${model}] Response to: "${prompt.substring(0, 50)}..."`,
    inputTokens,
    outputTokens,
  };
}

// =============================================================================
// ResilientLLMClient Class
// =============================================================================

export class ResilientLLMClient {
  private readonly router: TierRouter;
  private readonly auditLogger: AuditLogger;
  private readonly options: Required<ResilientClientOptions>;
  private _adapterFactory?: ProviderAdapterFactory;

  constructor(
    router: TierRouter,
    auditLogger: AuditLogger,
    options?: ResilientClientOptions,
  ) {
    this.router = router;
    this.auditLogger = auditLogger;

    // Priority: constructor option > LLM_MOCK_MODE env var > default (true)
    const envMockMode = process.env.LLM_MOCK_MODE;
    const resolvedMockMode = options?.mockMode ??
      (envMockMode !== undefined ? envMockMode !== 'false' : true);

    this.options = {
      mockMode: resolvedMockMode,
      mockShouldFail: options?.mockShouldFail ?? false,
      mockLatencyRange: options?.mockLatencyRange ?? [5, 50],
    };
  }

  private getAdapterFactory(): ProviderAdapterFactory {
    if (!this._adapterFactory) {
      this._adapterFactory = new ProviderAdapterFactory(this.router.getRegistry());
    }
    return this._adapterFactory;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Complete a prompt using the appropriate AI provider for the given tier.
   *
   * Flow:
   * 1. Route tier → provider/model (with failover)
   * 2. Execute completion (mock or real)
   * 3. Record success/failure to circuit breaker
   * 4. Log routing decision to audit logger
   * 5. Return response with latency
   */
  async complete(
    tier: EventTier,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    let routeResult: { provider: ProviderType; model: string };
    let failoverOccurred = false;
    let failoverFrom: ProviderType | undefined;

    // Route to provider
    try {
      routeResult = this.router.route(tier);
    } catch (error) {
      // All circuits open — log and rethrow
      if (error instanceof EpochError && error.code === ErrorCode.CIRCUIT_OPEN) {
        this.logDecision(
          tier,
          ProviderType.CUSTOM, // placeholder
          'none',
          false,
          undefined,
          0,
          0,
          Date.now() - startTime,
          CircuitState.OPEN,
          prompt,
        );
        throw error;
      }
      throw error;
    }

    // Execute completion
    try {
      const response = await this.executeCompletion(
        routeResult.provider,
        routeResult.model,
        prompt,
        options,
      );

      const latencyMs = Date.now() - startTime;

      // Record success
      const breaker = this.router.getCircuitBreaker(routeResult.provider);
      breaker.recordSuccess();

      // Log the decision
      this.logDecision(
        tier,
        routeResult.provider,
        routeResult.model,
        failoverOccurred,
        failoverFrom,
        response.inputTokens,
        response.outputTokens,
        latencyMs,
        breaker.getState(),
        prompt,
      );

      return {
        content: response.content,
        provider: routeResult.provider,
        model: routeResult.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Record failure to circuit breaker
      try {
        const breaker = this.router.getCircuitBreaker(routeResult.provider);
        breaker.recordFailure();

        this.logDecision(
          tier,
          routeResult.provider,
          routeResult.model,
          false,
          undefined,
          0,
          0,
          latencyMs,
          breaker.getState(),
          prompt,
        );
      } catch {
        // Circuit breaker not found — still log
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Execute the actual completion call (mock or real API).
   */
  private async executeCompletion(
    provider: ProviderType,
    model: string,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    if (this.options.mockMode) {
      // Simulate network latency
      const [minLatency, maxLatency] = this.options.mockLatencyRange;
      const delay = minLatency + Math.random() * (maxLatency - minLatency);
      await new Promise((resolve) => setTimeout(resolve, delay));

      return generateMockResponse(
        provider,
        model,
        prompt,
        this.options.mockShouldFail,
      );
    }

    // Real API call via provider adapter
    const factory = this.getAdapterFactory();
    const adapter = factory.getAdapter(provider);

    if (!adapter) {
      // No adapter available (missing API key) — fall back to mock with warning
      console.warn(
        `[ResilientLLMClient] No adapter for provider ${provider}, falling back to mock`,
      );
      return generateMockResponse(provider, model, prompt, false);
    }

    return adapter.complete(model, prompt, options);
  }

  /**
   * Log a routing decision to the audit logger.
   */
  private logDecision(
    tier: EventTier,
    provider: ProviderType,
    model: string,
    failoverOccurred: boolean,
    failoverFrom: ProviderType | undefined,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    circuitState: CircuitState,
    eventDescription: string,
  ): void {
    const timestamp = createTimestamp();

    const decision: RoutingDecision = {
      eventTier: tier,
      selectedProvider: provider,
      selectedModel: model,
      failoverOccurred,
      ...(failoverFrom ? { failoverFrom } : {}),
      latencyMs,
      timestamp,
    };

    const entry: AuditLogEntry = {
      id: uuidv4(),
      decision,
      inputTokens,
      outputTokens,
      estimatedCost: this.estimateCost(provider, model, inputTokens, outputTokens),
      circuitState,
      eventDescription: eventDescription.substring(0, 200),
      timestamp,
    };

    this.auditLogger.log(entry);
  }

  /**
   * Rough cost estimation based on token counts.
   * Uses known pricing; returns 0 for unknown models.
   */
  private estimateCost(
    _provider: ProviderType,
    _model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    // Simplified cost estimation (per-million-token rates)
    const rates: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'claude-haiku-4-5': { input: 0.80, output: 4.0 },
      'claude-opus-4-6': { input: 15.0, output: 75.0 },
      'gemini-2.0-flash': { input: 0.075, output: 0.30 },
      'gemini-2.0-pro': { input: 1.25, output: 5.0 },
    };

    const rate = rates[_model];
    if (!rate) return 0;

    return (
      (inputTokens / 1_000_000) * rate.input +
      (outputTokens / 1_000_000) * rate.output
    );
  }
}
