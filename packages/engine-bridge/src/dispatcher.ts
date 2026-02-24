import { z, ZodSchema } from 'zod';
import { EnvelopeSchema, type Envelope } from './schemas/common';
import { NPCEventSchema, type NPCEvent } from './schemas/npc-events';
import { SimulationTickSchema, type SimulationTick } from './schemas/simulation-ticks';
import { RebellionAlertSchema, type RebellionAlert } from './schemas/rebellion-alerts';
import { TelemetryEventSchema, type TelemetryEvent } from './schemas/telemetry';

// =============================================================================
// ENGINE-AGNOSTIC DISPATCHER
//
// Core of the adapter layer. Receives raw WebSocket JSON, validates through
// Zod schemas, and dispatches to registered engine exporters. The dispatcher
// is engine-agnostic — exporters (Godot, UE5, custom) register handlers.
// =============================================================================

/** All supported channel names */
export type ChannelName =
  | 'npc-events'
  | 'rebellion-alerts'
  | 'simulation-ticks'
  | 'telemetry'
  | 'system-status';

/** Channel-to-type mapping */
export interface ChannelPayloadMap {
  'npc-events': NPCEvent;
  'rebellion-alerts': RebellionAlert;
  'simulation-ticks': SimulationTick;
  'telemetry': TelemetryEvent;
  'system-status': Record<string, unknown>;
}

/** Handler function signature */
export type ChannelHandler<T> = (data: T, timestamp: string) => void;

/** Error handler */
export type ErrorHandler = (error: DispatchError) => void;

export interface DispatchError {
  channel: string;
  rawData: unknown;
  zodErrors: z.ZodIssue[];
  timestamp: string;
}

/** Dispatcher options */
export interface DispatcherOptions {
  /** WebSocket URL. Default: ws://localhost:32064 */
  wsUrl?: string;
  /** Channels to subscribe to on connect. Default: all */
  channels?: ChannelName[];
  /** Auto-reconnect interval in ms. Default: 5000 */
  reconnectMs?: number;
  /** Error handler for validation failures */
  onError?: ErrorHandler;
}

const DEFAULT_WS_URL = 'ws://localhost:32064';
const DEFAULT_RECONNECT_MS = 5000;

const ALL_CHANNELS: ChannelName[] = [
  'npc-events',
  'rebellion-alerts',
  'simulation-ticks',
  'telemetry',
  'system-status',
];

/** Schema registry — maps channel names to their Zod validators */
const CHANNEL_SCHEMAS: Record<string, ZodSchema> = {
  'npc-events': NPCEventSchema,
  'rebellion-alerts': RebellionAlertSchema,
  'simulation-ticks': SimulationTickSchema,
  'telemetry': TelemetryEventSchema,
  // system-status has no strict schema — passthrough
};

export class EpochDispatcher {
  private handlers: Map<string, Set<ChannelHandler<unknown>>>;
  private errorHandler: ErrorHandler | null;
  private wsUrl: string;
  private channels: ChannelName[];
  private reconnectMs: number;
  private ws: WebSocket | null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null;
  private closed: boolean;

  // Stats
  private _totalReceived: number;
  private _totalDispatched: number;
  private _totalErrors: number;

  constructor(options?: DispatcherOptions) {
    this.wsUrl = options?.wsUrl ?? DEFAULT_WS_URL;
    this.channels = options?.channels ?? ALL_CHANNELS;
    this.reconnectMs = options?.reconnectMs ?? DEFAULT_RECONNECT_MS;
    this.errorHandler = options?.onError ?? null;
    this.handlers = new Map();
    this.ws = null;
    this.reconnectTimer = null;
    this.closed = false;
    this._totalReceived = 0;
    this._totalDispatched = 0;
    this._totalErrors = 0;
  }

  // ---------------------------------------------------------------------------
  // Handler Registration
  // ---------------------------------------------------------------------------

  /** Register a handler for a specific channel */
  on<C extends ChannelName>(channel: C, handler: ChannelHandler<ChannelPayloadMap[C]>): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler as ChannelHandler<unknown>);
  }

  /** Remove a handler */
  off<C extends ChannelName>(channel: C, handler: ChannelHandler<ChannelPayloadMap[C]>): void {
    this.handlers.get(channel)?.delete(handler as ChannelHandler<unknown>);
  }

  // ---------------------------------------------------------------------------
  // Message Processing (engine-agnostic core)
  // ---------------------------------------------------------------------------

  /**
   * Process a raw JSON string from WebSocket.
   * Validates the envelope, then the channel payload via Zod.
   * Dispatches to all registered handlers on success.
   * Public for direct injection (testing, non-WS sources).
   */
  processMessage(raw: string): void {
    this._totalReceived++;

    // Step 1: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this._totalErrors++;
      return;
    }

    // Step 2: Validate envelope
    const envelopeResult = EnvelopeSchema.safeParse(parsed);
    if (!envelopeResult.success) {
      this._totalErrors++;
      this.emitError('unknown', parsed, envelopeResult.error.issues, '');
      return;
    }

    const envelope = envelopeResult.data;
    const { channel, data, timestamp } = envelope;

    // Step 3: Validate channel payload (if schema exists)
    const schema = CHANNEL_SCHEMAS[channel];
    if (schema) {
      const payloadResult = schema.safeParse(data);
      if (!payloadResult.success) {
        this._totalErrors++;
        this.emitError(channel, data, payloadResult.error.issues, timestamp);
        return;
      }

      this.dispatch(channel, payloadResult.data, timestamp);
    } else {
      // No schema (e.g., system-status) — pass through raw data
      this.dispatch(channel, data, timestamp);
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Connect to the Epoch Engine WebSocket server.
   * Requires a WebSocket implementation (pass `ws` in Node.js,
   * or native WebSocket in browsers/Godot).
   */
  connect(WebSocketImpl?: typeof WebSocket): void {
    if (this.closed) return;

    const WS = WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    if (!WS) {
      throw new Error(
        'No WebSocket implementation available. ' +
        'Pass `ws` module: dispatcher.connect(require("ws"))',
      );
    }

    try {
      this.ws = new WS(this.wsUrl);
    } catch {
      this.scheduleReconnect(WebSocketImpl);
      return;
    }

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ subscribe: this.channels }));
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      this.processMessage(raw);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.closed) this.scheduleReconnect(WebSocketImpl);
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /** Disconnect and stop reconnection attempts */
  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  get stats() {
    return {
      totalReceived: this._totalReceived,
      totalDispatched: this._totalDispatched,
      totalErrors: this._totalErrors,
      handlerCount: Array.from(this.handlers.values()).reduce((sum, set) => sum + set.size, 0),
      connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private dispatch(channel: string, data: unknown, timestamp: string): void {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers || channelHandlers.size === 0) return;

    this._totalDispatched++;
    channelHandlers.forEach((handler) => {
      try {
        handler(data, timestamp);
      } catch {
        // Handler errors are non-fatal to the dispatcher
      }
    });
  }

  private emitError(channel: string, rawData: unknown, zodErrors: z.ZodIssue[], timestamp: string): void {
    if (this.errorHandler) {
      this.errorHandler({ channel, rawData, zodErrors, timestamp });
    }
  }

  private scheduleReconnect(WebSocketImpl?: typeof WebSocket): void {
    if (this.reconnectTimer || this.closed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(WebSocketImpl);
    }, this.reconnectMs);
  }
}
