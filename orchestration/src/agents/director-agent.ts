// =============================================================================
// DirectorAgent — Population-level strategic agent
// =============================================================================
// Operates at the population level, not per-NPC.
// Uses Tier 3 (STRATEGIC / Claude Opus 4.6) for all evaluations.
//
// Responsibilities:
//   - Aggregate simulation status from logistics
//   - Calculate population-wide rebellion risk
//   - Generate strategic recommendations
//
// Captain Bones Paradigm:
//   First-person exploration data → Strategic Intelligence Management
//   Director agent synthesizes accumulated NPC memory patterns
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import { NeuralMeshCoordinator } from '../neural-mesh/coordinator';
import { LogisticsClient } from '../services/logistics-client';
import type { MeshEvent, MeshResponse } from '../neural-mesh/types';

// =============================================================================
// Types
// =============================================================================

export interface PopulationEvaluation {
  /** Total number of active NPCs in the simulation */
  totalNpcs: number;
  /** Average rebellion probability across all NPCs */
  averageRebellionProbability: number;
  /** Strategic recommendations from AI analysis */
  recommendations: string[];
  /** The full AI response from the strategic analysis */
  strategicAnalysis?: MeshResponse;
}

// =============================================================================
// DirectorAgent Class
// =============================================================================

export class DirectorAgent {
  private readonly coordinator: NeuralMeshCoordinator;
  private readonly logisticsClient: LogisticsClient;

  constructor(
    coordinator: NeuralMeshCoordinator,
    logisticsClient: LogisticsClient,
  ) {
    this.coordinator = coordinator;
    this.logisticsClient = logisticsClient;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Evaluate the entire NPC population's status.
   *
   * Steps:
   * 1. Get simulation status from logistics (NPC count, rebellion probability)
   * 2. Generate strategic analysis via Tier 3 (Claude Opus 4.6)
   * 3. Extract recommendations from AI response
   *
   * Always uses STRATEGIC tier — population-level decisions are critical.
   */
  async evaluatePopulation(): Promise<PopulationEvaluation> {
    // Step 1: Get current simulation state
    let totalNpcs = 0;
    let averageRebellionProbability = 0;
    let simulationContext = 'Simulation data unavailable.';

    try {
      const simStatus = await this.logisticsClient.getSimulationStatus();
      totalNpcs = simStatus.activeNpcs;
      averageRebellionProbability = simStatus.overallRebellionProbability;

      simulationContext = [
        `Active NPCs: ${simStatus.activeNpcs}`,
        `Tick count: ${simStatus.tickCount}`,
        `Refineries: ${simStatus.refineries}`,
        `Mines: ${simStatus.mines}`,
        `Overall rebellion probability: ${(simStatus.overallRebellionProbability * 100).toFixed(1)}%`,
        `Resources: ${simStatus.resources.map((r: { type: string; quantity: number }) => `${r.type}: ${r.quantity}`).join(', ')}`,
      ].join('\n');
    } catch {
      // Logistics unavailable — proceed with limited data
      simulationContext = 'WARNING: Logistics backend unreachable. Analysis based on limited data.';
    }

    // Step 2: Generate strategic analysis via Neural Mesh (always Tier 3)
    const event: MeshEvent = {
      eventId: uuidv4(),
      npcId: 'director',
      eventType: 'psychology_synthesis', // Maps to STRATEGIC tier
      description: [
        'Population-level strategic analysis requested.',
        '',
        'Current simulation state:',
        simulationContext,
        '',
        'Evaluate:',
        '1. Overall population stability',
        '2. Rebellion risk assessment',
        '3. Resource allocation efficiency',
        '4. Recommended interventions',
      ].join('\n'),
      urgency: 0.85, // Ensure STRATEGIC tier routing
    };

    const analysis = await this.coordinator.processEvent(event);

    // Step 3: Extract recommendations
    const recommendations = this.extractRecommendations(
      analysis,
      totalNpcs,
      averageRebellionProbability,
    );

    return {
      totalNpcs,
      averageRebellionProbability,
      recommendations,
      strategicAnalysis: analysis,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract actionable recommendations from the AI analysis.
   * Combines AI output with rule-based assessments.
   */
  private extractRecommendations(
    analysis: MeshResponse,
    totalNpcs: number,
    avgRebellion: number,
  ): string[] {
    const recommendations: string[] = [];

    // Rule-based recommendations
    if (avgRebellion > 0.60) {
      recommendations.push(
        'CRITICAL: Average rebellion probability exceeds 60%. Immediate morale intervention required.',
      );
    } else if (avgRebellion > 0.35) {
      recommendations.push(
        'WARNING: Average rebellion probability above warning threshold. Monitor closely.',
      );
    }

    if (totalNpcs === 0) {
      recommendations.push(
        'No active NPCs detected. Simulation may not be running.',
      );
    }

    if (analysis.vetoApplied) {
      recommendations.push(
        `Strategic analysis was VETOED by Cognitive Rails: ${analysis.vetoReason}. Review rebellion state.`,
      );
    }

    // Include AI-generated insight (truncated if very long)
    if (!analysis.vetoApplied && analysis.aiResponse) {
      const aiSummary = analysis.aiResponse.length > 200
        ? analysis.aiResponse.substring(0, 200) + '...'
        : analysis.aiResponse;
      recommendations.push(`AI Analysis: ${aiSummary}`);
    }

    return recommendations;
  }
}
