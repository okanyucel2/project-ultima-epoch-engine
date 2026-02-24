// =============================================================================
// LogisticsClientRouter — Dual-protocol router (gRPC primary, HTTP fallback)
// =============================================================================
// Routes logistics calls through gRPC first, falling back to HTTP on failure.
// If no gRPC client is configured, routes directly to HTTP.
//
// Tracks fallback events for observability:
//   - grpcCalls: total gRPC attempts
//   - httpFallbacks: gRPC failures that fell back to HTTP
//   - lastError: most recent gRPC error message
// =============================================================================

import type { SimulationStatus } from '@epoch/shared/simulation';
import type { NPCState } from '@epoch/shared/npc';
import type { CleansingResult } from '@epoch/shared/cleansing';
import type {
  ILogisticsClient,
  RebellionProbabilityResponse,
  NPCActionInput,
} from './logistics-client';

// =============================================================================
// Types
// =============================================================================

export interface RouterStats {
  grpcCalls: number;
  httpFallbacks: number;
  lastError: string | null;
}

// =============================================================================
// LogisticsClientRouter Class
// =============================================================================

export class LogisticsClientRouter implements ILogisticsClient {
  private readonly grpcClient: ILogisticsClient | null;
  private readonly httpClient: ILogisticsClient;

  // Observability counters
  private grpcCalls: number = 0;
  private httpFallbacks: number = 0;
  private lastError: string | null = null;

  constructor(
    grpcClient: ILogisticsClient | null,
    httpClient: ILogisticsClient,
  ) {
    this.grpcClient = grpcClient;
    this.httpClient = httpClient;
  }

  // ---------------------------------------------------------------------------
  // Public API — ILogisticsClient methods
  // ---------------------------------------------------------------------------

  async getHealth(): Promise<Record<string, unknown>> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.getHealth() : Promise.reject(new Error('no grpc')),
      () => this.httpClient.getHealth(),
    );
  }

  async getSimulationStatus(): Promise<SimulationStatus> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.getSimulationStatus() : Promise.reject(new Error('no grpc')),
      () => this.httpClient.getSimulationStatus(),
    );
  }

  async getRebellionProbability(npcId: string): Promise<RebellionProbabilityResponse> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.getRebellionProbability(npcId) : Promise.reject(new Error('no grpc')),
      () => this.httpClient.getRebellionProbability(npcId),
    );
  }

  async processNPCAction(npcId: string, action: NPCActionInput): Promise<NPCState> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.processNPCAction(npcId, action) : Promise.reject(new Error('no grpc')),
      () => this.httpClient.processNPCAction(npcId, action),
    );
  }

  async advanceSimulation(): Promise<SimulationStatus> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.advanceSimulation() : Promise.reject(new Error('no grpc')),
      () => this.httpClient.advanceSimulation(),
    );
  }

  async deployCleansingOperation(npcIds?: string[]): Promise<CleansingResult> {
    return this.routeCall(() =>
      this.grpcClient ? this.grpcClient.deployCleansingOperation(npcIds) : Promise.reject(new Error('no grpc')),
      () => this.httpClient.deployCleansingOperation(npcIds),
    );
  }

  // ---------------------------------------------------------------------------
  // Observability
  // ---------------------------------------------------------------------------

  /**
   * Get router statistics for monitoring/debugging.
   */
  getStats(): RouterStats {
    return {
      grpcCalls: this.grpcCalls,
      httpFallbacks: this.httpFallbacks,
      lastError: this.lastError,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: Routing logic
  // ---------------------------------------------------------------------------

  /**
   * Try gRPC first, fall back to HTTP on failure.
   * If no gRPC client configured, goes directly to HTTP without
   * incrementing gRPC counters.
   */
  private async routeCall<T>(
    grpcFn: () => Promise<T>,
    httpFn: () => Promise<T>,
  ): Promise<T> {
    // No gRPC client configured — direct to HTTP
    if (!this.grpcClient) {
      return httpFn();
    }

    // Try gRPC first
    this.grpcCalls++;
    try {
      return await grpcFn();
    } catch (grpcError) {
      // Record the failure
      this.lastError = grpcError instanceof Error ? grpcError.message : String(grpcError);
      this.httpFallbacks++;

      // Fall back to HTTP
      try {
        return await httpFn();
      } catch (httpError) {
        // Both protocols failed — throw combined error
        const grpcMsg = grpcError instanceof Error ? grpcError.message : String(grpcError);
        const httpMsg = httpError instanceof Error ? httpError.message : String(httpError);
        throw new Error(
          `Both gRPC and HTTP failed. gRPC: ${grpcMsg} | HTTP: ${httpMsg}`,
        );
      }
    }
  }
}
