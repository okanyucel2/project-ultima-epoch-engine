// =============================================================================
// Watchdog Telemetry Composable — Wave 25B
// =============================================================================
// Subscribes to 'system-status' WebSocket channel and tracks watchdog events
// (restarts, startups, shutdowns). Provides reactive state for the dashboard.
// =============================================================================

import { ref, readonly } from 'vue';
import { useEpochWebSocket } from './useEpochWebSocket';

export interface WatchdogEvent {
  type: 'watchdog_restart' | 'startup' | 'shutdown';
  service: string;
  reason?: string;
  attempt?: number;
  signal?: string;
  version?: string;
  port?: number;
  wsPort?: number;
  timestamp: string;
}

const MAX_EVENTS = 50;

export function useWatchdogTelemetry() {
  const events = ref<WatchdogEvent[]>([]);
  const lastRestart = ref<WatchdogEvent | null>(null);

  const { onMessage } = useEpochWebSocket(['system-status']);

  onMessage('system-status', (msg) => {
    const data = msg.data as unknown as WatchdogEvent;
    if (!data?.type) return;

    if (data.type === 'watchdog_restart' || data.type === 'startup' || data.type === 'shutdown') {
      events.value = [data, ...events.value].slice(0, MAX_EVENTS);
      if (data.type === 'watchdog_restart') {
        lastRestart.value = data;
      }
    }
  });

  return {
    events: readonly(events),
    lastRestart: readonly(lastRestart),
  };
}
