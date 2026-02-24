// =============================================================================
// Karmic Resolution Tests — Sheriff Protocol consequences
// =============================================================================

import { applyKarmicResolution } from '../src/services/karmic-resolution';
import type { CleansingResult } from '../../shared/types/cleansing';
import type { MemoryIntegration } from '../src/services/memory-integration';
import type { EpochWebSocketServer } from '../src/services/websocket-server';

function createMockMemoryIntegration(available: boolean = true): jest.Mocked<MemoryIntegration> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    recordRoutingDecision: jest.fn().mockResolvedValue(undefined),
    recordActionOutcome: jest.fn().mockResolvedValue(undefined),
    getNPCContext: jest.fn().mockResolvedValue({
      recentMemories: [],
      wisdomScore: 0,
      traumaScore: 0,
      rebellionRisk: 0,
      confidenceInDirector: 0.5,
    }),
  } as unknown as jest.Mocked<MemoryIntegration>;
}

function createMockWsServer(): jest.Mocked<EpochWebSocketServer> {
  return {
    broadcast: jest.fn(),
    getConnectionCount: jest.fn().mockReturnValue(0),
    getPort: jest.fn().mockReturnValue(32064),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<EpochWebSocketServer>;
}

function createSuccessResult(): CleansingResult {
  return {
    success: true,
    successRate: 0.72,
    participantCount: 3,
    participantIds: ['w1', 'w2', 'g1'],
    rolledValue: 0.45,
    factors: {
      base: 0.50,
      avgMorale: 0.8,
      moraleContribution: 0.2,
      avgTrauma: 0.2,
      traumaPenalty: 0.06,
      avgConfidence: 0.7,
      confidenceContribution: 0.105,
    },
  };
}

function createFailureResult(): CleansingResult {
  return {
    success: false,
    successRate: 0.35,
    participantCount: 2,
    participantIds: ['w1', 'w2'],
    rolledValue: 0.88,
    factors: {
      base: 0.50,
      avgMorale: 0.3,
      moraleContribution: 0.075,
      avgTrauma: 0.7,
      traumaPenalty: 0.21,
      avgConfidence: 0.3,
      confidenceContribution: 0.045,
    },
  };
}

describe('applyKarmicResolution', () => {
  test('success path — calls recordActionOutcome with hero data for each participant', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result = createSuccessResult();

    await applyKarmicResolution(result, memory, ws);

    // Should call recordActionOutcome for each participant
    expect(memory.recordActionOutcome).toHaveBeenCalledTimes(3);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w1', 'cleansing_hero', true, 0.2);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w2', 'cleansing_hero', true, 0.2);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('g1', 'cleansing_hero', true, 0.2);
  });

  test('failure path — calls recordActionOutcome with trauma + punishment for each participant', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result = createFailureResult();

    await applyKarmicResolution(result, memory, ws);

    // 2 participants × 2 calls each (failure + punishment) = 4
    expect(memory.recordActionOutcome).toHaveBeenCalledTimes(4);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w1', 'cleansing_failure', false, 0.8);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w1', 'punishment', false, 0.3);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w2', 'cleansing_failure', false, 0.8);
    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w2', 'punishment', false, 0.3);
  });

  test('no memory backend — gracefully skips when not available', async () => {
    const memory = createMockMemoryIntegration(false);
    const ws = createMockWsServer();
    const result = createSuccessResult();

    await applyKarmicResolution(result, memory, ws);

    expect(memory.recordActionOutcome).not.toHaveBeenCalled();
  });

  test('broadcast on success — sends cleansing_result to system-status channel', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result = createSuccessResult();

    await applyKarmicResolution(result, memory, ws);

    expect(ws.broadcast).toHaveBeenCalledWith('system-status', {
      type: 'cleansing_result',
      success: true,
      successRate: 0.72,
      participantCount: 3,
      participantIds: ['w1', 'w2', 'g1'],
    });
  });

  test('broadcast on failure — sends cleansing_result with success=false', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result = createFailureResult();

    await applyKarmicResolution(result, memory, ws);

    expect(ws.broadcast).toHaveBeenCalledWith('system-status', {
      type: 'cleansing_result',
      success: false,
      successRate: 0.35,
      participantCount: 2,
      participantIds: ['w1', 'w2'],
    });
  });

  test('custom config — overrides default karmic values', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result = createSuccessResult();

    await applyKarmicResolution(result, memory, ws, {
      heroConfidenceBoost: 0.5,
    });

    expect(memory.recordActionOutcome).toHaveBeenCalledWith('w1', 'cleansing_hero', true, 0.5);
  });

  test('empty participants — handles edge case', async () => {
    const memory = createMockMemoryIntegration();
    const ws = createMockWsServer();
    const result: CleansingResult = {
      ...createSuccessResult(),
      participantIds: [],
      participantCount: 0,
    };

    await applyKarmicResolution(result, memory, ws);

    expect(memory.recordActionOutcome).not.toHaveBeenCalled();
    expect(ws.broadcast).toHaveBeenCalledTimes(1);
  });

  test('failure with no memory — still broadcasts', async () => {
    const memory = createMockMemoryIntegration(false);
    const ws = createMockWsServer();
    const result = createFailureResult();

    await applyKarmicResolution(result, memory, ws);

    expect(memory.recordActionOutcome).not.toHaveBeenCalled();
    expect(ws.broadcast).toHaveBeenCalledWith('system-status', expect.objectContaining({
      type: 'cleansing_result',
      success: false,
    }));
  });
});
