// =============================================================================
// LogisticsClient — HTTP client to Golang logistics backend
// =============================================================================
// Connects to the logistics Go service (default :12065) for:
//   - Simulation status
//   - Rebellion probability per NPC
//   - NPC action processing
//   - Simulation tick advancement
//
// Features:
//   - 5s default timeout per request
//   - 1 retry on 5xx errors
//   - Typed responses matching shared types
// =============================================================================

import type { SimulationStatus } from '@epoch/shared/simulation';
import type { NPCState } from '@epoch/shared/npc';
import type { RebellionFactors } from '@epoch/shared/npc';
import type { CleansingResult } from '@epoch/shared/cleansing';

// =============================================================================
// Types
// =============================================================================

export interface RebellionProbabilityResponse {
  npcId: string;
  probability: number;
  factors: RebellionFactors;
  thresholdExceeded: boolean;
}

export interface NPCActionInput {
  actionType: string;
  intensity: number;
  description: string;
}

// =============================================================================
// ILogisticsClient — Protocol-agnostic interface for logistics backend
// =============================================================================

export interface ILogisticsClient {
  getHealth(): Promise<Record<string, unknown>>;
  getSimulationStatus(): Promise<SimulationStatus>;
  getRebellionProbability(npcId: string): Promise<RebellionProbabilityResponse>;
  processNPCAction(npcId: string, action: NPCActionInput): Promise<NPCState>;
  advanceSimulation(): Promise<SimulationStatus>;
  deployCleansingOperation(npcIds?: string[]): Promise<CleansingResult>;
}

// =============================================================================
// LogisticsClient Class
// =============================================================================

export class LogisticsClient implements ILogisticsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    baseUrl: string = 'http://localhost:12065',
    timeoutMs: number = 5000,
    maxRetries: number = 1,
  ) {
    // Strip trailing slash for consistent URL building
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Health check for the logistics backend.
   */
  async getHealth(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', '/health');
  }

  /**
   * Get current simulation status (resources, NPCs, tick count).
   */
  async getSimulationStatus(): Promise<SimulationStatus> {
    return this.request<SimulationStatus>('GET', '/api/simulation/status');
  }

  /**
   * Get rebellion probability for a specific NPC.
   */
  async getRebellionProbability(npcId: string): Promise<RebellionProbabilityResponse> {
    return this.request<RebellionProbabilityResponse>(
      'GET',
      `/api/rebellion/probability/${encodeURIComponent(npcId)}`,
    );
  }

  /**
   * Process an NPC action via the logistics backend.
   * Returns the updated NPC state.
   */
  async processNPCAction(npcId: string, action: NPCActionInput): Promise<NPCState> {
    return this.request<NPCState>(
      'POST',
      `/api/npc/${encodeURIComponent(npcId)}/action`,
      action,
    );
  }

  /**
   * Advance the simulation by one tick.
   * Returns the updated simulation status.
   */
  async advanceSimulation(): Promise<SimulationStatus> {
    return this.request<SimulationStatus>('POST', '/api/simulation/tick');
  }

  /**
   * Deploy a Sheriff Protocol cleansing operation against an active Plague Heart.
   */
  async deployCleansingOperation(npcIds?: string[]): Promise<CleansingResult> {
    return this.request<CleansingResult>('POST', '/api/cleansing/deploy', {
      npc_ids: npcIds ?? [],
    });
  }

  // ---------------------------------------------------------------------------
  // Internal HTTP machinery
  // ---------------------------------------------------------------------------

  /**
   * Execute an HTTP request with timeout and retry logic.
   * Retries once on 5xx errors. Throws on all other failures.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.executeRequest<T>(method, path, body);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on 5xx or network errors, not on 4xx
        if (this.is5xxError(lastError) || this.isNetworkError(lastError)) {
          if (attempt < this.maxRetries) {
            continue; // Retry
          }
        }

        throw lastError;
      }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Single HTTP request execution with timeout via AbortController.
   */
  private async executeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      };

      if (body !== undefined && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorMsg = `Logistics HTTP ${response.status}: ${response.statusText} for ${method} ${path}`;
        const error = new Error(errorMsg);
        (error as Error & { statusCode: number }).statusCode = response.status;
        throw error;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if an error represents a 5xx server error.
   */
  private is5xxError(error: Error): boolean {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600;
  }

  /**
   * Check if an error is a network-level failure (timeout, DNS, etc).
   */
  private isNetworkError(error: Error): boolean {
    return (
      error.name === 'AbortError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('timeout') ||
      error.message.includes('Network')
    );
  }
}
