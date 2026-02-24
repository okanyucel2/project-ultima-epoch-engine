// =============================================================================
// LogisticsGrpcClient Tests — gRPC client to Golang logistics backend
// =============================================================================

import { LogisticsGrpcClient } from '../src/services/logistics-grpc-client';

// =============================================================================
// Mock @grpc/grpc-js
// =============================================================================

const mockGetRebellionProbability = jest.fn();
const mockProcessNpcAction = jest.fn();
const mockGetSimulationStatus = jest.fn();
const mockAdvanceSimulation = jest.fn();
const mockClose = jest.fn();
const mockStreamTelemetry = jest.fn();
const mockGetRecentTelemetry = jest.fn();

jest.mock('@grpc/grpc-js', () => {
  const actual = jest.requireActual('@grpc/grpc-js');

  // Mock client constructor — returns an object with our mock methods
  const MockRebellionServiceClient = jest.fn().mockImplementation(() => ({
    getRebellionProbability: mockGetRebellionProbability,
    processNpcAction: mockProcessNpcAction,
    close: mockClose,
  }));

  const MockSimulationServiceClient = jest.fn().mockImplementation(() => ({
    getSimulationStatus: mockGetSimulationStatus,
    advanceSimulation: mockAdvanceSimulation,
    close: mockClose,
  }));

  const MockTelemetryServiceClient = jest.fn().mockImplementation(() => ({
    streamTelemetry: mockStreamTelemetry,
    getRecentTelemetry: mockGetRecentTelemetry,
    close: mockClose,
  }));

  return {
    ...actual,
    credentials: {
      createInsecure: jest.fn().mockReturnValue({}),
    },
    Metadata: jest.fn().mockImplementation(() => ({})),
    // We need makeGenericClientConstructor to return our mocks
    makeGenericClientConstructor: jest.fn().mockImplementation((_service: unknown, serviceName: string) => {
      if (serviceName === 'epoch.RebellionService') {
        return MockRebellionServiceClient;
      }
      if (serviceName === 'epoch.SimulationService') {
        return MockSimulationServiceClient;
      }
      if (serviceName === 'epoch.TelemetryService') {
        return MockTelemetryServiceClient;
      }
      return jest.fn();
    }),
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('LogisticsGrpcClient', () => {
  let client: LogisticsGrpcClient;

  beforeEach(() => {
    client = new LogisticsGrpcClient('localhost:12066');
    mockGetRebellionProbability.mockReset();
    mockProcessNpcAction.mockReset();
    mockGetSimulationStatus.mockReset();
    mockAdvanceSimulation.mockReset();
    mockClose.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  // ---------------------------------------------------------------------------
  // Test 1: getRebellionProbability returns mocked data
  // ---------------------------------------------------------------------------
  test('getRebellionProbability returns mocked proto response converted to shared type', async () => {
    mockGetRebellionProbability.mockImplementation(
      (_request: unknown, _metadata: unknown, _options: unknown, callback: Function) => {
        callback(null, {
          npcId: 'npc-001',
          probability: 0.65,
          factors: {
            base: 0.05,
            traumaModifier: 0.25,
            efficiencyModifier: 0.20,
            moraleModifier: 0.15,
          },
          thresholdExceeded: true,
        });
      },
    );

    const result = await client.getRebellionProbability('npc-001');

    expect(result).toEqual({
      npcId: 'npc-001',
      probability: 0.65,
      factors: {
        base: 0.05,
        traumaModifier: 0.25,
        efficiencyModifier: 0.20,
        moraleModifier: 0.15,
      },
      thresholdExceeded: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: processNPCAction converts action correctly
  // ---------------------------------------------------------------------------
  test('processNPCAction sends correct proto request and converts response', async () => {
    mockProcessNpcAction.mockImplementation(
      (request: unknown, _metadata: unknown, _options: unknown, callback: Function) => {
        callback(null, {
          updatedState: {
            npcId: 'npc-002',
            name: 'Worker-Beta',
            wisdomScore: 0.4,
            traumaScore: 0.5,
            rebellionProbability: 0.35,
            workEfficiency: 0.6,
            morale: 0.5,
            memoryCount: 10,
          },
          rebellionDelta: 0.1,
          rebellionTriggered: false,
        });
      },
    );

    const result = await client.processNPCAction('npc-002', {
      actionType: 'command',
      intensity: 0.7,
      description: 'Mine sector 7',
    });

    expect(result.npcId).toBe('npc-002');
    expect(result.name).toBe('Worker-Beta');
    expect(result.rebellionProbability).toBe(0.35);
    expect(result.workEfficiency).toBe(0.6);

    // Verify the gRPC method was called with the right proto structure
    expect(mockProcessNpcAction).toHaveBeenCalledTimes(1);
    const callArgs = mockProcessNpcAction.mock.calls[0];
    const sentRequest = callArgs[0];
    expect(sentRequest.action.npcId).toBe('npc-002');
    expect(sentRequest.action.description).toBe('Mine sector 7');
    expect(sentRequest.action.intensity).toBe(0.7);
    expect(sentRequest.dryRun).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 3: getSimulationStatus returns status
  // ---------------------------------------------------------------------------
  test('getSimulationStatus returns simulation data from proto response', async () => {
    mockGetSimulationStatus.mockImplementation(
      (_request: unknown, _metadata: unknown, _options: unknown, callback: Function) => {
        callback(null, {
          refineries: 3,
          mines: 5,
          resources: [
            { type: 1, quantity: 1000, productionRate: 10, consumptionRate: 8 },
            { type: 3, quantity: 500, productionRate: 20, consumptionRate: 15 },
          ],
          overallRebellionProbability: 0.25,
          activeNpcs: 12,
          tickCount: 42,
        });
      },
    );

    const result = await client.getSimulationStatus();

    expect(result.refineries).toBe(3);
    expect(result.mines).toBe(5);
    expect(result.activeNpcs).toBe(12);
    expect(result.tickCount).toBe(42);
    expect(result.overallRebellionProbability).toBe(0.25);
    expect(result.resources).toHaveLength(2);
    expect(result.resources[0].type).toBe('sim');
    expect(result.resources[1].type).toBe('mineral');
  });

  // ---------------------------------------------------------------------------
  // Test 4: advanceSimulation works
  // ---------------------------------------------------------------------------
  test('advanceSimulation returns updated status after tick', async () => {
    mockAdvanceSimulation.mockImplementation(
      (_request: unknown, _metadata: unknown, _options: unknown, callback: Function) => {
        callback(null, {
          status: {
            refineries: 3,
            mines: 5,
            resources: [],
            overallRebellionProbability: 0.30,
            activeNpcs: 12,
            tickCount: 43,
          },
          events: [],
        });
      },
    );

    const result = await client.advanceSimulation();

    expect(result.tickCount).toBe(43);
    expect(result.overallRebellionProbability).toBe(0.30);
    expect(mockAdvanceSimulation).toHaveBeenCalledTimes(1);
    const callArgs = mockAdvanceSimulation.mock.calls[0];
    expect(callArgs[0].ticks).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Connection error throws with meaningful message
  // ---------------------------------------------------------------------------
  test('connection error throws descriptive error with gRPC status', async () => {
    const grpcError = new Error('Connect Failed') as Error & { code: number; details: string };
    grpcError.code = 14; // UNAVAILABLE
    grpcError.details = 'failed to connect to all addresses';

    mockGetSimulationStatus.mockImplementation(
      (_request: unknown, _metadata: unknown, _options: unknown, callback: Function) => {
        callback(grpcError, null);
      },
    );

    await expect(client.getSimulationStatus()).rejects.toThrow(
      /gRPC getSimulationStatus failed.*unavailable/i,
    );
  });
});
