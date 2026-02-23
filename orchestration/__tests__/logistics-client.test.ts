// =============================================================================
// LogisticsClient Tests — HTTP client to Golang logistics backend
// =============================================================================

import { LogisticsClient } from '../src/services/logistics-client';

// =============================================================================
// Mock fetch globally
// =============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('LogisticsClient', () => {
  let client: LogisticsClient;

  beforeEach(() => {
    client = new LogisticsClient('http://localhost:12065');
    mockFetch.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Returns health status
  // ---------------------------------------------------------------------------
  test('returns health status from logistics backend', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', service: 'logistics', uptime: 1234 }),
    });

    const health = await client.getHealth();

    expect(health).toEqual({ status: 'ok', service: 'logistics', uptime: 1234 });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:12065/health',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Returns simulation status
  // ---------------------------------------------------------------------------
  test('returns simulation status', async () => {
    const simStatus = {
      refineries: 3,
      mines: 5,
      resources: [
        { type: 'sim', quantity: 1000, productionRate: 10, consumptionRate: 8 },
      ],
      overallRebellionProbability: 0.25,
      activeNpcs: 12,
      tickCount: 42,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => simStatus,
    });

    const result = await client.getSimulationStatus();

    expect(result).toEqual(simStatus);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:12065/api/simulation/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 3: Returns rebellion probability for NPC
  // ---------------------------------------------------------------------------
  test('returns rebellion probability for a specific NPC', async () => {
    const rebellionData = {
      npcId: 'npc-001',
      probability: 0.65,
      factors: {
        base: 0.05,
        traumaModifier: 0.25,
        efficiencyModifier: 0.20,
        moraleModifier: 0.15,
      },
      thresholdExceeded: true,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => rebellionData,
    });

    const result = await client.getRebellionProbability('npc-001');

    expect(result.npcId).toBe('npc-001');
    expect(result.probability).toBe(0.65);
    expect(result.thresholdExceeded).toBe(true);
    expect(result.factors.base).toBe(0.05);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:12065/api/rebellion/probability/npc-001',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 4: Handles timeout/error gracefully
  // ---------------------------------------------------------------------------
  test('handles timeout and server errors gracefully', async () => {
    // Simulate network error
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    // Retry also fails
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(client.getHealth()).rejects.toThrow('Network timeout');
  });

  test('retries on 5xx and succeeds on second attempt', async () => {
    // First call returns 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'server crash' }),
    });

    // Retry succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });

    const result = await client.getHealth();
    expect(result).toEqual({ status: 'ok' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('processNPCAction sends correct POST body', async () => {
    const npcState = {
      npcId: 'npc-001',
      name: 'Worker-Alpha',
      wisdomScore: 0.5,
      traumaScore: 0.3,
      rebellionProbability: 0.2,
      workEfficiency: 0.8,
      morale: 0.7,
      memoryCount: 15,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => npcState,
    });

    const result = await client.processNPCAction('npc-001', {
      actionType: 'command',
      intensity: 0.7,
      description: 'Mine sector 7',
    });

    expect(result.npcId).toBe('npc-001');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:12065/api/npc/npc-001/action',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ actionType: 'command', intensity: 0.7, description: 'Mine sector 7' }),
      }),
    );
  });
});
