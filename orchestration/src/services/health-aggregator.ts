// =============================================================================
// HealthAggregator — Deep health check aggregating all Epoch Engine services
// =============================================================================
// Checks:
//   - Self (orchestration Express server)
//   - Logistics (HTTP health endpoint)
//   - WebSocket (connection count as proxy for health)
//
// Status logic:
//   - All services healthy   → 'healthy'
//   - Any service degraded   → 'degraded'
//   - Any service down       → 'unhealthy'
// =============================================================================

import type { ILogisticsClient } from './logistics-client';
import { EpochWebSocketServer } from './websocket-server';

// =============================================================================
// Types
// =============================================================================

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceHealth {
  status: ServiceHealthStatus;
  latencyMs: number;
  details?: string;
}

export interface DeepHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, ServiceHealth>;
  timestamp: string;
}

// =============================================================================
// HealthAggregator Class
// =============================================================================

export class HealthAggregator {
  private readonly logisticsClient: ILogisticsClient;
  private readonly wsServer: EpochWebSocketServer;

  constructor(logisticsClient: ILogisticsClient, wsServer: EpochWebSocketServer) {
    this.logisticsClient = logisticsClient;
    this.wsServer = wsServer;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Perform deep health check across all Epoch Engine services.
   * Returns aggregated status with per-service latency.
   */
  async deepHealth(): Promise<DeepHealthResult> {
    const services: Record<string, ServiceHealth> = {};

    // Check all services concurrently
    const [orchestrationHealth, logisticsHealth, wsHealth] = await Promise.all([
      this.checkOrchestration(),
      this.checkLogistics(),
      this.checkWebSocket(),
    ]);

    services['orchestration'] = orchestrationHealth;
    services['logistics'] = logisticsHealth;
    services['websocket'] = wsHealth;

    // Aggregate overall status
    const statuses = Object.values(services).map((s) => s.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (statuses.some((s) => s === 'down')) {
      overallStatus = 'unhealthy';
    } else if (statuses.some((s) => s === 'degraded')) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      services,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: Per-service health checks
  // ---------------------------------------------------------------------------

  /**
   * Check orchestration (self) health — always healthy if we're running.
   */
  private async checkOrchestration(): Promise<ServiceHealth> {
    const start = Date.now();
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: 'Orchestration server running',
    };
  }

  /**
   * Check logistics Go backend via HTTP health endpoint.
   */
  private async checkLogistics(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const result = await this.logisticsClient.getHealth();
      const latencyMs = Date.now() - start;

      if (result && (result as Record<string, unknown>).status === 'ok') {
        return {
          status: latencyMs > 3000 ? 'degraded' : 'healthy',
          latencyMs,
          details: 'Logistics backend responding',
        };
      }

      return {
        status: 'degraded',
        latencyMs,
        details: 'Logistics backend returned unexpected status',
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        details: `Logistics unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  /**
   * Check WebSocket server health via connection count.
   * The WS server is considered healthy if it's running (connection count >= 0).
   */
  private async checkWebSocket(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const connectionCount = this.wsServer.getConnectionCount();
      const latencyMs = Date.now() - start;

      return {
        status: 'healthy',
        latencyMs,
        details: `WebSocket server active, ${connectionCount} connection(s)`,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        details: `WebSocket error: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
}
