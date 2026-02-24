<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useNPCMonitor } from '../composables/useNPCMonitor';
import { useEpochWebSocket, type WebSocketMessage } from '../composables/useEpochWebSocket';
import { fetchSystemStatus, type SystemStatus } from '../api/epoch-api';
import MetricCard from '../components/MetricCard.vue';
import TelemetryAlertPanel from '../components/TelemetryAlertPanel.vue';
import InfestationBar from '../components/InfestationBar.vue';
import RebellionHeatmap from '../components/RebellionHeatmap.vue';

const { npcs, sortedNPCs, loading, error, demoMode, criticalCount, avgRebellion, selectNPC } = useNPCMonitor();
const { onMessage, offMessage } = useEpochWebSocket(['rebellion-alerts']);

const systemStatus = ref<SystemStatus | null>(null);
const rebellionAlerts = ref<{ npcId: string; npcName: string; probability: number; timestamp: string }[]>([]);
const statusError = ref<string | null>(null);

// Thresholds
const HALT_THRESHOLD = 0.35;
const VETO_THRESHOLD = 0.80;

const maxBarValue = computed(() => {
  if (sortedNPCs.value.length === 0) return 1;
  return Math.max(...sortedNPCs.value.map((n) => n.rebellionProbability), 1);
});

function getBarColor(value: number): string {
  if (value > 0.8) return '#dc2626';
  if (value > 0.6) return 'var(--accent-danger)';
  if (value > 0.2) return 'var(--accent-warning)';
  return 'var(--accent-success)';
}

function getBarWidth(value: number): string {
  return `${(value / maxBarValue.value) * 100}%`;
}

function getThresholdPosition(threshold: number): string {
  return `${(threshold / maxBarValue.value) * 100}%`;
}

function handleRebellionAlert(msg: WebSocketMessage): void {
  const data = msg.data as { npcId?: string; npcName?: string; probability?: number };
  rebellionAlerts.value = [
    {
      npcId: data.npcId || 'unknown',
      npcName: data.npcName || 'Unknown NPC',
      probability: data.probability || 0,
      timestamp: msg.timestamp,
    },
    ...rebellionAlerts.value,
  ].slice(0, 50);
}

async function loadStatus(): Promise<void> {
  try {
    systemStatus.value = await fetchSystemStatus();
    statusError.value = null;
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'Failed to load status';
  }
}

let refreshInterval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  onMessage('rebellion-alerts', handleRebellionAlert);
  loadStatus();
  refreshInterval = setInterval(loadStatus, 10000);
});

onUnmounted(() => {
  offMessage('rebellion-alerts', handleRebellionAlert);
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<template>
  <div class="rebellion-dashboard">
    <h1 class="view-title">
      Rebellion Dashboard
      <span v-if="demoMode" class="demo-badge">DEMO</span>
    </h1>

    <!-- Metrics Row -->
    <div class="metrics-row">
      <MetricCard
        label="Total NPCs"
        :value="sortedNPCs.length"
        color="var(--accent-info)"
      />
      <MetricCard
        label="Avg Rebellion"
        :value="`${(avgRebellion * 100).toFixed(1)}%`"
        :color="avgRebellion > 0.5 ? 'var(--accent-danger)' : 'var(--accent-warning)'"
      />
      <MetricCard
        label="Critical NPCs"
        :value="criticalCount"
        :color="criticalCount > 0 ? '#dc2626' : 'var(--accent-success)'"
      />
      <MetricCard
        label="Vetoes"
        :value="systemStatus?.vetoes ?? '--'"
        color="var(--accent-danger)"
      />
    </div>

    <!-- Infestation Bar -->
    <InfestationBar />

    <!-- Loading -->
    <div v-if="loading && sortedNPCs.length === 0" class="state-message">
      <p class="pulse">Loading rebellion data...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-message state-message--error">
      <p>{{ error }}</p>
    </div>

    <!-- Empty -->
    <div v-else-if="sortedNPCs.length === 0" class="state-message">
      <p>No NPC rebellion data available yet.</p>
      <p class="text-muted">Data will appear as NPCs generate events.</p>
    </div>

    <!-- Bar Chart -->
    <div v-else class="glass-card chart-container">
      <h2 class="chart-title">Rebellion Probability by NPC</h2>
      <div class="bar-chart">
        <!-- Threshold lines -->
        <div
          class="threshold-line threshold-line--halt"
          :style="{ left: getThresholdPosition(HALT_THRESHOLD) }"
        >
          <span class="threshold-label">Halt ({{ (HALT_THRESHOLD * 100).toFixed(0) }}%)</span>
        </div>
        <div
          class="threshold-line threshold-line--veto"
          :style="{ left: getThresholdPosition(VETO_THRESHOLD) }"
        >
          <span class="threshold-label">Veto ({{ (VETO_THRESHOLD * 100).toFixed(0) }}%)</span>
        </div>

        <!-- Bars -->
        <div v-for="npc in sortedNPCs" :key="npc.id" class="bar-row">
          <span class="bar-label" :title="npc.id">{{ npc.name }}</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{
                width: getBarWidth(npc.rebellionProbability),
                backgroundColor: getBarColor(npc.rebellionProbability),
              }"
            ></div>
          </div>
          <span class="bar-value" :style="{ color: getBarColor(npc.rebellionProbability) }">
            {{ (npc.rebellionProbability * 100).toFixed(1) }}%
          </span>
        </div>
      </div>
    </div>

    <!-- Wave 21C: Rebellion & Trauma Heatmaps (Prism Effect prevention) -->
    <div v-if="sortedNPCs.length > 0" class="heatmap-row">
      <RebellionHeatmap
        :npcs="npcs"
        metric="rebellion"
        @select="selectNPC"
      />
      <RebellionHeatmap
        :npcs="npcs"
        metric="trauma"
        @select="selectNPC"
      />
    </div>

    <!-- Telemetry Feed — Mental Breakdowns + Permanent Traumas -->
    <TelemetryAlertPanel />

    <!-- Recent Rebellion Alerts -->
    <div class="glass-card alerts-panel">
      <h2 class="chart-title">Recent Rebellion Alerts</h2>
      <div v-if="rebellionAlerts.length === 0" class="state-message state-message--compact">
        <p class="text-muted">No rebellion alerts yet.</p>
      </div>
      <div v-else class="alerts-list">
        <div
          v-for="(alert, idx) in rebellionAlerts.slice(0, 10)"
          :key="idx"
          class="alert-item fade-in"
        >
          <span class="alert-time text-muted">
            {{ new Date(alert.timestamp).toLocaleTimeString() }}
          </span>
          <span class="alert-npc">{{ alert.npcName }}</span>
          <span
            class="alert-prob"
            :style="{ color: getBarColor(alert.probability) }"
          >
            {{ (alert.probability * 100).toFixed(1) }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rebellion-dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.view-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.chart-container {
  position: relative;
  overflow: hidden;
}

.chart-title {
  margin: 0 0 1.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.bar-chart {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-left: 0;
}

.bar-row {
  display: grid;
  grid-template-columns: 120px 1fr 60px;
  align-items: center;
  gap: 0.75rem;
}

.bar-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  width: 100%;
  height: 20px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
  min-width: 2px;
}

.bar-value {
  font-size: 0.85rem;
  font-weight: 600;
  text-align: right;
}

.threshold-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 2px dashed;
  z-index: 1;
  pointer-events: none;
}

.threshold-line--halt {
  border-color: rgba(245, 158, 11, 0.4);
}

.threshold-line--veto {
  border-color: rgba(239, 68, 68, 0.4);
}

.threshold-label {
  position: absolute;
  top: -20px;
  left: 4px;
  font-size: 0.65rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.alerts-panel {
  max-height: 300px;
  overflow-y: auto;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alert-item {
  display: grid;
  grid-template-columns: 80px 1fr 60px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.alert-time {
  font-size: 0.75rem;
  font-family: monospace;
}

.alert-npc {
  font-size: 0.85rem;
}

.alert-prob {
  font-size: 0.85rem;
  font-weight: 600;
  text-align: right;
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.state-message--compact {
  padding: 1.5rem;
}

.state-message--error {
  color: var(--accent-danger);
}

.demo-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  vertical-align: middle;
  margin-left: 0.5rem;
}

.heatmap-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .heatmap-row {
    grid-template-columns: 1fr;
  }
}
</style>
