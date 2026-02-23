// =============================================================================
// NPCAgent — Per-NPC event processor
// =============================================================================
// Wraps NeuralMeshCoordinator for a single NPC identity.
// Tracks the most recent response for status queries.
//
// Usage:
//   const agent = new NPCAgent('npc-001', coordinator);
//   const response = await agent.processAction(action);
//   const status = await agent.getStatus();
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { NPCAction } from '../../shared/types/npc';
import { NeuralMeshCoordinator } from '../neural-mesh/coordinator';
import type { MeshEvent, MeshResponse } from '../neural-mesh/types';

// =============================================================================
// NPCAgent Class
// =============================================================================

export class NPCAgent {
  private readonly npcId: string;
  private readonly coordinator: NeuralMeshCoordinator;
  private lastResponse?: MeshResponse;

  constructor(npcId: string, coordinator: NeuralMeshCoordinator) {
    this.npcId = npcId;
    this.coordinator = coordinator;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process an NPC action through the Neural Mesh pipeline.
   *
   * Converts NPCAction → MeshEvent, delegates to coordinator,
   * and caches the response for status queries.
   */
  async processAction(action: NPCAction): Promise<MeshResponse> {
    const event: MeshEvent = {
      eventId: action.actionId || uuidv4(),
      npcId: this.npcId,
      eventType: action.actionType,
      description: action.description,
      urgency: action.intensity, // Intensity maps to urgency for tier escalation
      metadata: action.metadata ? { ...action.metadata } : undefined,
    };

    const response = await this.coordinator.processEvent(event);
    this.lastResponse = response;
    return response;
  }

  /**
   * Get the current status of this NPC agent.
   * Returns the NPC ID and most recent pipeline response (if any).
   */
  async getStatus(): Promise<{
    npcId: string;
    lastResponse?: MeshResponse;
  }> {
    return {
      npcId: this.npcId,
      lastResponse: this.lastResponse,
    };
  }

  /**
   * Get the NPC ID this agent represents.
   */
  getNpcId(): string {
    return this.npcId;
  }
}
