import type { EpochDispatcher } from '../dispatcher';
import type { NPCEvent } from '../schemas/npc-events';
import type { SimulationTick } from '../schemas/simulation-ticks';
import type { RebellionAlert } from '../schemas/rebellion-alerts';
import type { TelemetryEvent } from '../schemas/telemetry';

// =============================================================================
// BASE EXPORTER — Abstract interface for engine-specific adapters
//
// Each game engine (Godot, UE5, custom) implements this interface.
// The exporter registers itself with the dispatcher and transforms
// validated Epoch events into engine-native formats.
// =============================================================================

export interface EngineExporter {
  /** Human-readable engine name */
  readonly engineName: string;

  /** Register all handlers with the dispatcher */
  attach(dispatcher: EpochDispatcher): void;

  /** Detach all handlers from the dispatcher */
  detach(dispatcher: EpochDispatcher): void;

  /** Transform NPC state update into engine-native format */
  onNPCEvent(data: NPCEvent, timestamp: string): void;

  /** Transform simulation tick into engine-native format */
  onSimulationTick(data: SimulationTick, timestamp: string): void;

  /** Transform rebellion alert into engine-native format */
  onRebellionAlert(data: RebellionAlert, timestamp: string): void;

  /** Transform telemetry event into engine-native format */
  onTelemetryEvent(data: TelemetryEvent, timestamp: string): void;
}

/**
 * Abstract base with attach/detach boilerplate.
 * Concrete exporters only need to implement the on* methods.
 */
export abstract class BaseExporter implements EngineExporter {
  abstract readonly engineName: string;

  attach(dispatcher: EpochDispatcher): void {
    dispatcher.on('npc-events', this.onNPCEvent.bind(this));
    dispatcher.on('simulation-ticks', this.onSimulationTick.bind(this));
    dispatcher.on('rebellion-alerts', this.onRebellionAlert.bind(this));
    dispatcher.on('telemetry', this.onTelemetryEvent.bind(this));
  }

  detach(dispatcher: EpochDispatcher): void {
    dispatcher.off('npc-events', this.onNPCEvent.bind(this));
    dispatcher.off('simulation-ticks', this.onSimulationTick.bind(this));
    dispatcher.off('rebellion-alerts', this.onRebellionAlert.bind(this));
    dispatcher.off('telemetry', this.onTelemetryEvent.bind(this));
  }

  abstract onNPCEvent(data: NPCEvent, timestamp: string): void;
  abstract onSimulationTick(data: SimulationTick, timestamp: string): void;
  abstract onRebellionAlert(data: RebellionAlert, timestamp: string): void;
  abstract onTelemetryEvent(data: TelemetryEvent, timestamp: string): void;
}
