<script setup lang="ts">
import { useTelemetryAlerts } from '../composables/useTelemetryAlerts';

const {
  recentAlerts,
  criticalCount,
  permanentTraumaCount,
  mentalBreakdownCount,
  getSeverityColor,
  getSeverityLabel,
  getTypeIcon,
} = useTelemetryAlerts();

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '--:--:--';
  }
}
</script>

<template>
  <div class="telemetry-panel glass-card">
    <div class="panel-header">
      <h2 class="panel-title">Telemetry Feed</h2>
      <div class="panel-badges">
        <span v-if="criticalCount > 0" class="badge badge--critical pulse-glow">
          {{ criticalCount }} CRITICAL
        </span>
        <span v-if="permanentTraumaCount > 0" class="badge badge--trauma">
          {{ permanentTraumaCount }} Trauma
        </span>
        <span v-if="mentalBreakdownCount > 0" class="badge badge--breakdown">
          {{ mentalBreakdownCount }} Breakdown
        </span>
      </div>
    </div>

    <div v-if="recentAlerts.length === 0" class="empty-state">
      <p class="text-muted">No telemetry events yet.</p>
      <p class="text-muted text-small">Events appear when NPCs experience trauma or mental breakdowns.</p>
    </div>

    <div v-else class="alerts-scroll">
      <div
        v-for="alert in recentAlerts"
        :key="alert.eventId"
        class="alert-row fade-in"
        :class="{
          'alert-row--critical': alert.severity >= 3,
          'alert-row--catastrophic': alert.severity >= 4,
          'alert-row--trauma': alert.type === 'permanent_trauma',
        }"
      >
        <span class="alert-icon" :style="{ color: getSeverityColor(alert.severity) }">
          {{ getTypeIcon(alert.type) }}
        </span>
        <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
        <span class="alert-npc" :title="alert.npcId">{{ alert.npcId }}</span>
        <span class="alert-msg">{{ alert.message }}</span>
        <span
          class="alert-severity"
          :style="{ color: getSeverityColor(alert.severity) }"
        >
          {{ getSeverityLabel(alert.severity) }}
        </span>
        <span v-if="alert.detail" class="alert-detail text-muted">{{ alert.detail }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.telemetry-panel {
  border-left: 3px solid var(--accent-danger);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.panel-badges {
  display: flex;
  gap: 0.5rem;
}

.badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge--critical {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.badge--trauma {
  background: rgba(220, 38, 38, 0.2);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.4);
}

.badge--breakdown {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
  text-align: center;
}

.text-small {
  font-size: 0.75rem;
}

.alerts-scroll {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.alert-row {
  display: grid;
  grid-template-columns: 24px 72px 120px 1fr 80px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  transition: background-color 0.2s;
}

.alert-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.alert-row--critical {
  background: rgba(239, 68, 68, 0.05);
  border-left: 2px solid rgba(239, 68, 68, 0.6);
}

.alert-row--catastrophic {
  background: rgba(220, 38, 38, 0.1);
  border-left: 2px solid #dc2626;
  animation: pulse-glow 2s ease-in-out infinite;
}

.alert-row--trauma {
  background: rgba(220, 38, 38, 0.08);
}

.alert-icon {
  font-size: 1rem;
  text-align: center;
}

.alert-time {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.alert-npc {
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-msg {
  font-size: 0.8rem;
  font-weight: 500;
}

.alert-severity {
  font-size: 0.65rem;
  font-weight: 700;
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.alert-detail {
  grid-column: 3 / -1;
  font-size: 0.7rem;
  padding-left: 0.25rem;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.pulse-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}
</style>
