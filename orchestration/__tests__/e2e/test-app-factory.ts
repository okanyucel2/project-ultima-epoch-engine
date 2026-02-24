// =============================================================================
// Test App Factory — Creates an Epoch Engine app instance with injectable mocks
// =============================================================================

import { createApp } from '../../src/index';
import type { ILogisticsClient } from '../../src/services/logistics-client';
import type { CleansingResult } from '../../../shared/types/cleansing';
import type { Express } from 'express';

// =============================================================================
// Mock Logistics Client
// =============================================================================

export class MockLogisticsClient implements ILogisticsClient {
  public calls: { method: string; args: unknown[] }[] = [];
  public rebellionProbability = 0.15;
  public thresholdExceeded = false;
  public shouldFail = false;

  async getHealth(): Promise<Record<string, unknown>> {
    this.calls.push({ method: 'getHealth', args: [] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return { status: 'ok', service: 'mock-logistics' };
  }

  async getSimulationStatus(): Promise<Record<string, unknown>> {
    this.calls.push({ method: 'getSimulationStatus', args: [] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return { tickCount: 100, activeNpcs: 5, resources: [] };
  }

  async getRebellionProbability(npcId: string): Promise<{ probability: number; thresholdExceeded: boolean; factors?: Record<string, number> }> {
    this.calls.push({ method: 'getRebellionProbability', args: [npcId] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return {
      probability: this.rebellionProbability,
      thresholdExceeded: this.thresholdExceeded,
    };
  }

  async processNPCAction(npcId: string, action: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ method: 'processNPCAction', args: [npcId, action] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return { npcId, updatedState: {} };
  }

  async advanceSimulation(): Promise<Record<string, unknown>> {
    this.calls.push({ method: 'advanceSimulation', args: [] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return { tickCount: 101, activeNpcs: 5, resources: [] };
  }

  async deployCleansingOperation(npcIds?: string[]): Promise<CleansingResult> {
    this.calls.push({ method: 'deployCleansingOperation', args: [npcIds] });
    if (this.shouldFail) throw new Error('Logistics unavailable');
    return {
      success: true,
      successRate: 0.72,
      participantCount: 2,
      participantIds: ['w1', 'w2'],
      rolledValue: 0.45,
      factors: {
        base: 0.5, avgMorale: 0.7, moraleContribution: 0.175,
        avgTrauma: 0.3, traumaPenalty: 0.09, avgConfidence: 0.6, confidenceContribution: 0.09,
      },
    };
  }

  reset(): void {
    this.calls = [];
    this.rebellionProbability = 0.15;
    this.thresholdExceeded = false;
    this.shouldFail = false;
  }
}

// =============================================================================
// Mock WebSocket Server
// =============================================================================

export class MockWebSocketServer {
  public broadcasts: { channel: string; data: unknown }[] = [];

  broadcast(channel: string, data: unknown): void {
    this.broadcasts.push({ channel, data });
  }

  getPort(): number {
    return 0;
  }

  async close(): Promise<void> {
    // no-op
  }

  reset(): void {
    this.broadcasts = [];
  }
}

// =============================================================================
// Create Test App
// =============================================================================

export interface TestAppInstance {
  app: Express;
  mockLogistics: MockLogisticsClient;
  mockWs: MockWebSocketServer;
}

export function createTestApp(): TestAppInstance {
  const mockLogistics = new MockLogisticsClient();
  const mockWs = new MockWebSocketServer();

  const { app } = createApp({
    logisticsClient: mockLogistics,
    wsServer: mockWs as any,
    mockMode: true,
  });

  return { app, mockLogistics, mockWs };
}
