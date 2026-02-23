// =============================================================================
// LogisticsGrpcClient — gRPC client to Golang logistics backend
// =============================================================================
// Connects to the logistics Go service via gRPC (default :12066) for:
//   - Simulation status
//   - Rebellion probability per NPC
//   - NPC action processing
//   - Simulation tick advancement
//
// Features:
//   - 5s deadline per call
//   - Uses generated proto stubs from epoch.ts
//   - Converts gRPC response types to match HTTP client return types
//   - Descriptive error messages for common gRPC failure modes
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import type { ServiceError } from '@grpc/grpc-js';
import type { SimulationStatus } from '../../shared/types/simulation';
import type { NPCState } from '../../shared/types/npc';
import type {
  ILogisticsClient,
  RebellionProbabilityResponse,
  NPCActionInput,
} from './logistics-client';

import {
  RebellionServiceClient,
  SimulationServiceClient,
} from '../generated/epoch';
import type {
  RebellionRequest,
  ProcessActionRequest,
  RebellionResponse,
  ProcessActionResponse,
  SimStatusRequest,
  AdvanceRequest,
  AdvanceResponse,
} from '../generated/epoch';
import type {
  SimulationStatus as ProtoSimulationStatus,
} from '../generated/simulation';
import type {
  NPCState as ProtoNPCState,
} from '../generated/npc';
import { ActionType as ProtoActionType } from '../generated/npc';

// =============================================================================
// gRPC error code descriptions for readable error messages
// =============================================================================

const GRPC_STATUS_DESCRIPTIONS: Record<number, string> = {
  [grpc.status.OK]: 'OK',
  [grpc.status.CANCELLED]: 'Request cancelled',
  [grpc.status.UNKNOWN]: 'Unknown error',
  [grpc.status.INVALID_ARGUMENT]: 'Invalid argument',
  [grpc.status.DEADLINE_EXCEEDED]: 'Deadline exceeded (5s timeout)',
  [grpc.status.NOT_FOUND]: 'Resource not found',
  [grpc.status.ALREADY_EXISTS]: 'Resource already exists',
  [grpc.status.PERMISSION_DENIED]: 'Permission denied',
  [grpc.status.RESOURCE_EXHAUSTED]: 'Resource exhausted',
  [grpc.status.FAILED_PRECONDITION]: 'Failed precondition',
  [grpc.status.ABORTED]: 'Operation aborted',
  [grpc.status.OUT_OF_RANGE]: 'Out of range',
  [grpc.status.UNIMPLEMENTED]: 'Method not implemented',
  [grpc.status.INTERNAL]: 'Internal server error',
  [grpc.status.UNAVAILABLE]: 'Service unavailable (is logistics gRPC server running?)',
  [grpc.status.DATA_LOSS]: 'Data loss',
  [grpc.status.UNAUTHENTICATED]: 'Unauthenticated',
};

// =============================================================================
// LogisticsGrpcClient Class
// =============================================================================

export class LogisticsGrpcClient implements ILogisticsClient {
  private readonly rebellionClient: RebellionServiceClient;
  private readonly simulationClient: SimulationServiceClient;
  private readonly deadlineMs: number;

  constructor(
    host: string = 'localhost:12066',
    deadlineMs: number = 5000,
  ) {
    const credentials = grpc.credentials.createInsecure();
    this.rebellionClient = new RebellionServiceClient(host, credentials);
    this.simulationClient = new SimulationServiceClient(host, credentials);
    this.deadlineMs = deadlineMs;
  }

  // ---------------------------------------------------------------------------
  // Public API — matches ILogisticsClient interface
  // ---------------------------------------------------------------------------

  /**
   * Health check via gRPC — uses getSimulationStatus as a proxy for health.
   * gRPC services don't have a dedicated /health endpoint, so we check
   * if the simulation service responds.
   */
  async getHealth(): Promise<Record<string, unknown>> {
    try {
      await this.getSimulationStatus();
      return { status: 'ok', protocol: 'grpc' };
    } catch (error) {
      throw this.wrapError('getHealth', error);
    }
  }

  /**
   * Get current simulation status via gRPC SimulationService.
   */
  async getSimulationStatus(): Promise<SimulationStatus> {
    const request: SimStatusRequest = { includeDetails: true };

    const response = await this.unaryCall<SimStatusRequest, ProtoSimulationStatus>(
      this.simulationClient,
      'getSimulationStatus',
      request,
    );

    return this.convertSimulationStatus(response);
  }

  /**
   * Get rebellion probability for a specific NPC via gRPC RebellionService.
   */
  async getRebellionProbability(npcId: string): Promise<RebellionProbabilityResponse> {
    const request: RebellionRequest = {
      npcId,
      includeFactors: true,
    };

    const response = await this.unaryCall<RebellionRequest, RebellionResponse>(
      this.rebellionClient,
      'getRebellionProbability',
      request,
    );

    return {
      npcId: response.npcId,
      probability: response.probability,
      factors: response.factors ?? {
        base: 0,
        traumaModifier: 0,
        efficiencyModifier: 0,
        moraleModifier: 0,
      },
      thresholdExceeded: response.thresholdExceeded,
    };
  }

  /**
   * Process an NPC action via gRPC RebellionService.
   * Returns the updated NPC state.
   */
  async processNPCAction(npcId: string, action: NPCActionInput): Promise<NPCState> {
    const request: ProcessActionRequest = {
      action: {
        actionId: '',
        npcId,
        actionType: this.mapActionType(action.actionType),
        description: action.description,
        intensity: action.intensity,
        timestamp: undefined,
        metadata: {},
      },
      dryRun: false,
    };

    const response = await this.unaryCall<ProcessActionRequest, ProcessActionResponse>(
      this.rebellionClient,
      'processNpcAction',
      request,
    );

    return this.convertNPCState(response.updatedState);
  }

  /**
   * Advance the simulation by one tick via gRPC SimulationService.
   * Returns the updated simulation status.
   */
  async advanceSimulation(): Promise<SimulationStatus> {
    const request: AdvanceRequest = { ticks: 1 };

    const response = await this.unaryCall<AdvanceRequest, AdvanceResponse>(
      this.simulationClient,
      'advanceSimulation',
      request,
    );

    return this.convertSimulationStatus(response.status);
  }

  /**
   * Close the gRPC channel connections.
   */
  close(): void {
    this.rebellionClient.close();
    this.simulationClient.close();
  }

  // ---------------------------------------------------------------------------
  // Internal: gRPC call wrapper
  // ---------------------------------------------------------------------------

  /**
   * Generic unary call wrapper that converts callback-based gRPC into Promise.
   * Sets a deadline and provides descriptive error messages.
   */
  private unaryCall<TReq, TRes>(
    client: grpc.Client,
    method: string,
    request: TReq,
  ): Promise<TRes> {
    return new Promise<TRes>((resolve, reject) => {
      const deadline = new Date(Date.now() + this.deadlineMs);
      const callOptions: grpc.CallOptions = { deadline };

      const fn = (client as Record<string, Function>)[method];
      if (typeof fn !== 'function') {
        reject(new Error(`gRPC method '${method}' not found on client`));
        return;
      }

      fn.call(
        client,
        request,
        new grpc.Metadata(),
        callOptions,
        (error: ServiceError | null, response: TRes) => {
          if (error) {
            reject(this.wrapError(method, error));
          } else {
            resolve(response);
          }
        },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: Error handling
  // ---------------------------------------------------------------------------

  /**
   * Wrap gRPC errors into descriptive Error objects.
   */
  private wrapError(method: string, error: unknown): Error {
    if (error instanceof Error && 'code' in error) {
      const grpcError = error as ServiceError;
      const statusDesc = GRPC_STATUS_DESCRIPTIONS[grpcError.code] || `gRPC status ${grpcError.code}`;
      const msg = `gRPC ${method} failed: ${statusDesc} — ${grpcError.details || grpcError.message}`;
      const wrapped = new Error(msg);
      (wrapped as Error & { grpcCode: number }).grpcCode = grpcError.code;
      return wrapped;
    }

    if (error instanceof Error) {
      return new Error(`gRPC ${method} failed: ${error.message}`);
    }

    return new Error(`gRPC ${method} failed: ${String(error)}`);
  }

  // ---------------------------------------------------------------------------
  // Internal: Proto-to-shared type converters
  // ---------------------------------------------------------------------------

  /**
   * Convert proto SimulationStatus to shared SimulationStatus type.
   */
  private convertSimulationStatus(proto: ProtoSimulationStatus | undefined): SimulationStatus {
    if (!proto) {
      return {
        refineries: 0,
        mines: 0,
        resources: [],
        overallRebellionProbability: 0,
        activeNpcs: 0,
        tickCount: 0,
      };
    }

    return {
      refineries: proto.refineries,
      mines: proto.mines,
      resources: (proto.resources || []).map((r) => ({
        type: this.convertResourceType(r.type),
        quantity: r.quantity,
        productionRate: r.productionRate,
        consumptionRate: r.consumptionRate,
      })),
      overallRebellionProbability: proto.overallRebellionProbability,
      activeNpcs: proto.activeNpcs,
      tickCount: proto.tickCount,
    };
  }

  /**
   * Convert proto NPCState to shared NPCState type.
   */
  private convertNPCState(proto: ProtoNPCState | undefined): NPCState {
    if (!proto) {
      return {
        npcId: '',
        name: '',
        wisdomScore: 0,
        traumaScore: 0,
        rebellionProbability: 0,
        workEfficiency: 0,
        morale: 0,
        memoryCount: 0,
      };
    }

    return {
      npcId: proto.npcId,
      name: proto.name,
      wisdomScore: proto.wisdomScore,
      traumaScore: proto.traumaScore,
      rebellionProbability: proto.rebellionProbability,
      workEfficiency: proto.workEfficiency,
      morale: proto.morale,
      memoryCount: proto.memoryCount,
    };
  }

  /**
   * Map proto ResourceType enum (int) to shared ResourceType string.
   */
  private convertResourceType(protoType: number): string {
    switch (protoType) {
      case 1: return 'sim';
      case 2: return 'rapidlum';
      case 3: return 'mineral';
      default: return 'unknown';
    }
  }

  /**
   * Map shared action type string to proto ActionType enum.
   */
  private mapActionType(actionType: string): ProtoActionType {
    const mapping: Record<string, ProtoActionType> = {
      'command': ProtoActionType.ACTION_TYPE_COMMAND,
      'resource_change': ProtoActionType.ACTION_TYPE_RESOURCE_CHANGE,
      'punishment': ProtoActionType.ACTION_TYPE_PUNISHMENT,
      'reward': ProtoActionType.ACTION_TYPE_REWARD,
      'dialogue': ProtoActionType.ACTION_TYPE_DIALOGUE,
      'environment': ProtoActionType.ACTION_TYPE_ENVIRONMENT,
    };

    return mapping[actionType] ?? ProtoActionType.ACTION_TYPE_UNSPECIFIED;
  }
}
