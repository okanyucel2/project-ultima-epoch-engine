<script setup lang="ts">
/**
 * RebellionHeatmap — Wave 21C
 *
 * Grid-based heatmap showing NPC rebellion probability and trauma weight
 * with real-time WebSocket updates. Red/green color gradient prevents
 * cognitive blindness (Prism Effect) by making danger immediately visible.
 */
import { computed } from 'vue';

interface NPCState {
  id: string;
  name: string;
  rebellionProbability: number;
  traumaScore: number;
  wisdomScore: number;
  confidenceInDirector: number;
}

type HeatmapMetric = 'rebellion' | 'trauma';

const props = withDefaults(defineProps<{
  npcs: NPCState[];
  metric?: HeatmapMetric;
}>(), {
  metric: 'rebellion',
});

const emit = defineEmits<{
  (e: 'select', npcId: string): void;
}>();

const title = computed(() =>
  props.metric === 'rebellion'
    ? 'Rebellion Probability Heatmap'
    : 'Trauma Weight Heatmap',
);

function getValue(npc: NPCState): number {
  return props.metric === 'rebellion'
    ? npc.rebellionProbability
    : npc.traumaScore;
}

function getCellColor(value: number): string {
  // 0.0 = green (#22c55e), 0.5 = amber (#f59e0b), 1.0 = red (#dc2626)
  if (value <= 0.5) {
    const t = value / 0.5;
    const r = Math.round(34 + t * (245 - 34));
    const g = Math.round(197 + t * (158 - 197));
    const b = Math.round(94 + t * (11 - 94));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (value - 0.5) / 0.5;
    const r = Math.round(245 + t * (220 - 245));
    const g = Math.round(158 + t * (38 - 158));
    const b = Math.round(11 + t * (38 - 11));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function getCellTextColor(value: number): string {
  return value > 0.65 ? '#fff' : 'var(--text-primary)';
}

function getCellGlow(value: number): string {
  if (value > 0.8) return '0 0 12px rgba(220, 38, 38, 0.6)';
  if (value > 0.6) return '0 0 8px rgba(245, 158, 11, 0.3)';
  return 'none';
}

// Sort by value descending for visual impact
const sortedNPCs = computed(() =>
  [...props.npcs].sort((a, b) => getValue(b) - getValue(a)),
);
</script>

<template>
  <div class="glass-card heatmap-container">
    <h2 class="heatmap-title">{{ title }}</h2>

    <!-- Legend -->
    <div class="heatmap-legend">
      <span class="legend-label">0%</span>
      <div class="legend-gradient"></div>
      <span class="legend-label">100%</span>
    </div>

    <!-- Heatmap grid -->
    <div v-if="sortedNPCs.length === 0" class="heatmap-empty">
      <p>No NPC data available</p>
    </div>
    <div v-else class="heatmap-grid">
      <div
        v-for="npc in sortedNPCs"
        :key="npc.id"
        class="heatmap-cell"
        :style="{
          backgroundColor: getCellColor(getValue(npc)),
          color: getCellTextColor(getValue(npc)),
          boxShadow: getCellGlow(getValue(npc)),
        }"
        :title="`${npc.name}: ${(getValue(npc) * 100).toFixed(1)}%`"
        @click="emit('select', npc.id)"
      >
        <span class="cell-name">{{ npc.name }}</span>
        <span class="cell-value">{{ (getValue(npc) * 100).toFixed(0) }}%</span>
      </div>
    </div>

    <!-- Aggregate stats -->
    <div v-if="sortedNPCs.length > 0" class="heatmap-stats">
      <span class="stat">
        <span class="stat-label">Critical (&gt;80%):</span>
        <span class="stat-value stat-value--danger">
          {{ sortedNPCs.filter(n => getValue(n) > 0.8).length }}
        </span>
      </span>
      <span class="stat">
        <span class="stat-label">Warning (&gt;50%):</span>
        <span class="stat-value stat-value--warning">
          {{ sortedNPCs.filter(n => getValue(n) > 0.5 && getValue(n) <= 0.8).length }}
        </span>
      </span>
      <span class="stat">
        <span class="stat-label">Stable (&le;50%):</span>
        <span class="stat-value stat-value--success">
          {{ sortedNPCs.filter(n => getValue(n) <= 0.5).length }}
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.heatmap-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.heatmap-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-label {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.legend-gradient {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    #22c55e 0%,
    #f59e0b 50%,
    #dc2626 100%
  );
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
}

.heatmap-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0.4rem;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.3s ease;
  min-height: 56px;
}

.heatmap-cell:hover {
  transform: scale(1.05);
  z-index: 1;
}

.cell-name {
  font-size: 0.7rem;
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
  opacity: 0.9;
}

.cell-value {
  font-size: 1rem;
  font-weight: 700;
  margin-top: 2px;
}

.heatmap-stats {
  display: flex;
  gap: 1.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat-value {
  font-size: 0.85rem;
  font-weight: 700;
}

.stat-value--danger {
  color: #dc2626;
}

.stat-value--warning {
  color: #f59e0b;
}

.stat-value--success {
  color: #22c55e;
}

.heatmap-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-muted);
}
</style>
