import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEpochWebSocket, type WebSocketMessage } from './useEpochWebSocket';

// =============================================================================
// Telemetry Alert Types — The Alters + Battle Brothers event model
// =============================================================================

export type TelemetryAlertType = 'mental_breakdown' | 'permanent_trauma' | 'state_change' | 'rebellion';

export interface TelemetryAlert {
  eventId: string;
  npcId: string;
  type: TelemetryAlertType;
  severity: number;       // 0=info, 1=info, 2=warning, 3=critical, 4=catastrophic
  message: string;
  detail: string;
  timestamp: string;
}

const BREAKDOWN_LABELS: Record<number, string> = {
  1: 'Stress Spike',
  2: 'Psychological Fracture',
  3: 'Identity Crisis',
  4: 'Paranoia Onset',
  5: 'Dissociation',
  6: 'Rage Episode',
};

const TRAUMA_LABELS: Record<number, string> = {
  1: 'Limb Loss',
  2: 'Morale Collapse',
  3: 'PTSD',
  4: "Survivor's Guilt",
  5: 'Phobia',
  6: 'Brain Damage',
};

const SEVERITY_LABELS: Record<number, string> = {
  0: 'INFO',
  1: 'INFO',
  2: 'WARNING',
  3: 'CRITICAL',
  4: 'CATASTROPHIC',
};

const MAX_ALERTS = 100;

// =============================================================================
// Composable
// =============================================================================

export function useTelemetryAlerts() {
  const alerts = ref<TelemetryAlert[]>([]);
  const { onMessage, offMessage } = useEpochWebSocket(['rebellion-alerts', 'system-status']);

  const recentAlerts = computed(() => alerts.value.slice(0, 20));

  const criticalCount = computed(() =>
    alerts.value.filter((a) => a.severity >= 3).length,
  );

  const permanentTraumaCount = computed(() =>
    alerts.value.filter((a) => a.type === 'permanent_trauma').length,
  );

  const mentalBreakdownCount = computed(() =>
    alerts.value.filter((a) => a.type === 'mental_breakdown').length,
  );

  function handleRebellionAlert(msg: WebSocketMessage): void {
    const data = msg.data as Record<string, unknown>;
    const type = data.type as string;

    if (type === 'mental_breakdown') {
      const breakdownType = (data.breakdownType as number) ?? 0;
      const intensity = (data.intensity as number) ?? 0;
      const label = BREAKDOWN_LABELS[breakdownType] ?? 'Unknown';

      alerts.value = [
        {
          eventId: (data.eventId as string) ?? `mb-${Date.now()}`,
          npcId: (data.npcId as string) ?? 'unknown',
          type: 'mental_breakdown',
          severity: (data.severity as number) ?? 2,
          message: `${label} (${(intensity * 100).toFixed(0)}%)`,
          detail: (data.triggerContext as string) ?? '',
          timestamp: (data.timestamp as string) ?? msg.timestamp,
        },
        ...alerts.value,
      ].slice(0, MAX_ALERTS);
    } else if (type === 'permanent_trauma') {
      const traumaType = (data.traumaType as number) ?? 0;
      const severity = (data.traumaSeverity as number) ?? 0;
      const label = TRAUMA_LABELS[traumaType] ?? 'Unknown';
      const attr = (data.affectedAttribute as string) ?? '';
      const reduction = (data.attributeReduction as number) ?? 0;

      alerts.value = [
        {
          eventId: (data.eventId as string) ?? `pt-${Date.now()}`,
          npcId: (data.npcId as string) ?? 'unknown',
          type: 'permanent_trauma',
          severity: (data.severity as number) ?? 3,
          message: `PERMANENT: ${label}`,
          detail: attr ? `${attr} -${(reduction * 100).toFixed(0)}%` : '',
          timestamp: (data.timestamp as string) ?? msg.timestamp,
        },
        ...alerts.value,
      ].slice(0, MAX_ALERTS);
    } else {
      // Generic rebellion alert (existing format)
      const probability = (data.probability as number) ?? (data.rebellionProbability as number) ?? 0;
      if (probability > 0 || data.reason) {
        alerts.value = [
          {
            eventId: (data.eventId as string) ?? `reb-${Date.now()}`,
            npcId: (data.npcId as string) ?? 'unknown',
            type: 'rebellion',
            severity: probability > 0.8 ? 3 : probability > 0.5 ? 2 : 1,
            message: `Rebellion ${(probability * 100).toFixed(1)}%`,
            detail: (data.reason as string) ?? '',
            timestamp: (data.timestamp as string) ?? msg.timestamp,
          },
          ...alerts.value,
        ].slice(0, MAX_ALERTS);
      }
    }
  }

  function handleSystemStatus(msg: WebSocketMessage): void {
    const data = msg.data as Record<string, unknown>;
    const alertType = data.alert as string;

    if (alertType === 'mental_breakdown' || alertType === 'permanent_trauma') {
      // System-wide severity alerts already in rebellion-alerts — skip duplicates
      return;
    }
  }

  function getSeverityLabel(severity: number): string {
    return SEVERITY_LABELS[severity] ?? 'INFO';
  }

  function getSeverityColor(severity: number): string {
    if (severity >= 4) return '#dc2626';  // Catastrophic — deep red
    if (severity >= 3) return '#ef4444';  // Critical — red
    if (severity >= 2) return '#f59e0b';  // Warning — amber
    return '#6366f1';                     // Info — indigo
  }

  function getTypeIcon(type: TelemetryAlertType): string {
    switch (type) {
      case 'mental_breakdown': return '\u26A0'; // warning sign
      case 'permanent_trauma': return '\u2620'; // skull
      case 'rebellion': return '\u2694';        // crossed swords
      case 'state_change': return '\u2139';     // info
      default: return '\u2022';                 // bullet
    }
  }

  onMounted(() => {
    onMessage('rebellion-alerts', handleRebellionAlert);
    onMessage('system-status', handleSystemStatus);
  });

  onUnmounted(() => {
    offMessage('rebellion-alerts', handleRebellionAlert);
    offMessage('system-status', handleSystemStatus);
  });

  return {
    alerts,
    recentAlerts,
    criticalCount,
    permanentTraumaCount,
    mentalBreakdownCount,
    getSeverityLabel,
    getSeverityColor,
    getTypeIcon,
  };
}
