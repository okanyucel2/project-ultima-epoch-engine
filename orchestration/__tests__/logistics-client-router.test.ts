// =============================================================================
// LogisticsClientRouter Tests — Dual-protocol routing (gRPC + HTTP fallback)
// =============================================================================

import { LogisticsClientRouter } from '../src/services/logistics-client-router';
import type { ILogisticsClient } from '../src/services/logistics-client';

// =============================================================================
// Mock client factory
// =============================================================================

function createMockClient(overrides: Partial<ILogisticsClient> = {}): ILogisticsClient {
  return {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok' }),
    getSimulationStatus: jest.fn().mockResolvedValue({
      refineries: 3, mines: 5, resources: [],
      overallRebellionProbability: 0.25, activeNpcs: 12, tickCount: 42,
    }),
    getRebellionProbability: jest.fn().mockResolvedValue({
      npcId: 'npc-001', probability: 0.65,
      factors: { base: 0.05, traumaModifier: 0.25, efficiencyModifier: 0.20, moraleModifier: 0.15 },
      thresholdExceeded: true,
    }),
    processNPCAction: jest.fn().mockResolvedValue({
      npcId: 'npc-001', name: 'Worker-Alpha',
      wisdomScore: 0.5, traumaScore: 0.3,
      rebellionProbability: 0.2, workEfficiency: 0.8,
      morale: 0.7, memoryCount: 15,
    }),
    advanceSimulation: jest.fn().mockResolvedValue({
      refineries: 3, mines: 5, resources: [],
      overallRebellionProbability: 0.30, activeNpcs: 12, tickCount: 43,
    }),
    deployCleansingOperation: jest.fn().mockResolvedValue({
      success: true, successRate: 0.72, participantCount: 2,
      participantIds: ['w1', 'w2'], rolledValue: 0.45,
      factors: { base: 0.5, avgMorale: 0.7, moraleContribution: 0.175, avgTrauma: 0.3, traumaPenalty: 0.09, avgConfidence: 0.6, confidenceContribution: 0.09 },
    }),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('LogisticsClientRouter', () => {

  // ---------------------------------------------------------------------------
  // Test 1: gRPC success → no HTTP call
  // ---------------------------------------------------------------------------
  test('uses gRPC when available and successful, does not call HTTP', async () => {
    const grpcClient = createMockClient();
    const httpClient = createMockClient();
    const router = new LogisticsClientRouter(grpcClient, httpClient);

    const result = await router.getRebellionProbability('npc-001');

    expect(result.npcId).toBe('npc-001');
    expect(result.probability).toBe(0.65);
    expect(grpcClient.getRebellionProbability).toHaveBeenCalledWith('npc-001');
    expect(httpClient.getRebellionProbability).not.toHaveBeenCalled();

    const stats = router.getStats();
    expect(stats.grpcCalls).toBe(1);
    expect(stats.httpFallbacks).toBe(0);
    expect(stats.lastError).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 2: gRPC fails → HTTP fallback called
  // ---------------------------------------------------------------------------
  test('falls back to HTTP when gRPC fails', async () => {
    const grpcClient = createMockClient({
      getSimulationStatus: jest.fn().mockRejectedValue(new Error('gRPC UNAVAILABLE')),
    });
    const httpClient = createMockClient();
    const router = new LogisticsClientRouter(grpcClient, httpClient);

    const result = await router.getSimulationStatus();

    expect(result.refineries).toBe(3);
    expect(grpcClient.getSimulationStatus).toHaveBeenCalled();
    expect(httpClient.getSimulationStatus).toHaveBeenCalled();

    const stats = router.getStats();
    expect(stats.grpcCalls).toBe(1);
    expect(stats.httpFallbacks).toBe(1);
    expect(stats.lastError).toBe('gRPC UNAVAILABLE');
  });

  // ---------------------------------------------------------------------------
  // Test 3: HTTP-only mode (no gRPC client)
  // ---------------------------------------------------------------------------
  test('routes directly to HTTP when no gRPC client configured', async () => {
    const httpClient = createMockClient();
    const router = new LogisticsClientRouter(null, httpClient);

    const result = await router.advanceSimulation();

    expect(result.tickCount).toBe(43);
    expect(httpClient.advanceSimulation).toHaveBeenCalled();

    // No gRPC stats recorded in HTTP-only mode
    const stats = router.getStats();
    expect(stats.grpcCalls).toBe(0);
    expect(stats.httpFallbacks).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Both fail → throws combined error
  // ---------------------------------------------------------------------------
  test('throws combined error when both gRPC and HTTP fail', async () => {
    const grpcClient = createMockClient({
      processNPCAction: jest.fn().mockRejectedValue(new Error('gRPC DEADLINE_EXCEEDED')),
    });
    const httpClient = createMockClient({
      processNPCAction: jest.fn().mockRejectedValue(new Error('HTTP 503 Service Unavailable')),
    });
    const router = new LogisticsClientRouter(grpcClient, httpClient);

    await expect(
      router.processNPCAction('npc-001', {
        actionType: 'command',
        intensity: 0.7,
        description: 'Mine sector 7',
      }),
    ).rejects.toThrow(/Both gRPC and HTTP failed/);

    await expect(
      router.processNPCAction('npc-001', {
        actionType: 'command',
        intensity: 0.7,
        description: 'Mine sector 7',
      }),
    ).rejects.toThrow(/gRPC: gRPC DEADLINE_EXCEEDED.*HTTP: HTTP 503/);
  });

  // ---------------------------------------------------------------------------
  // Test 5: getStats tracks correctly across multiple calls
  // ---------------------------------------------------------------------------
  test('getStats accumulates correctly across multiple operations', async () => {
    const grpcClient = createMockClient({
      // Health succeeds
      getHealth: jest.fn().mockResolvedValue({ status: 'ok', protocol: 'grpc' }),
      // SimStatus fails (will trigger HTTP fallback)
      getSimulationStatus: jest.fn().mockRejectedValue(new Error('connection reset')),
      // Rebellion succeeds
      getRebellionProbability: jest.fn().mockResolvedValue({
        npcId: 'npc-001', probability: 0.5,
        factors: { base: 0.05, traumaModifier: 0.2, efficiencyModifier: 0.15, moraleModifier: 0.1 },
        thresholdExceeded: false,
      }),
    });
    const httpClient = createMockClient();
    const router = new LogisticsClientRouter(grpcClient, httpClient);

    // Call 1: gRPC success
    await router.getHealth();

    let stats = router.getStats();
    expect(stats.grpcCalls).toBe(1);
    expect(stats.httpFallbacks).toBe(0);
    expect(stats.lastError).toBeNull();

    // Call 2: gRPC fails → HTTP fallback
    await router.getSimulationStatus();

    stats = router.getStats();
    expect(stats.grpcCalls).toBe(2);
    expect(stats.httpFallbacks).toBe(1);
    expect(stats.lastError).toBe('connection reset');

    // Call 3: gRPC succeeds again
    await router.getRebellionProbability('npc-001');

    stats = router.getStats();
    expect(stats.grpcCalls).toBe(3);
    expect(stats.httpFallbacks).toBe(1); // still 1, no new fallback
    expect(stats.lastError).toBe('connection reset'); // last error preserved
  });
});
