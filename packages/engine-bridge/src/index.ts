// =============================================================================
// @epoch/engine-bridge — Barrel Export
//
// Engine-agnostic adapter SDK. Validates WebSocket events via Zod,
// dispatches to registered engine exporters (Godot, UE5, custom).
// =============================================================================

// Core dispatcher
export { EpochDispatcher } from './dispatcher';
export type {
  ChannelName,
  ChannelPayloadMap,
  ChannelHandler,
  DispatchError,
  ErrorHandler,
  DispatcherOptions,
} from './dispatcher';

// Schemas (Zod validators + inferred types)
export * from './schemas';

// Exporters
export { BaseExporter } from './exporters/base-exporter';
export type { EngineExporter } from './exporters/base-exporter';

export { GodotExporter } from './exporters/godot-exporter';
export type {
  GodotFrame,
  GodotSignal,
  GodotNodeUpdate,
  GodotAnimationParams,
  GodotFrameCallback,
} from './exporters/godot-exporter';

export { UE5Exporter } from './exporters/ue5-exporter';
export type {
  UE5Frame,
  FEpochNPCState,
  BehaviorTreeBlackboard,
  MetaHumanFaceState,
  NiagaraTrigger,
  MaterialParameterUpdate,
  UE5FrameCallback,
} from './exporters/ue5-exporter';
