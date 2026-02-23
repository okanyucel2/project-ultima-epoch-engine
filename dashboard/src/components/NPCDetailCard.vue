<script setup lang="ts">
import { computed } from 'vue';
import type { NPCState } from '../composables/useNPCMonitor';
import RebellionGauge from './RebellionGauge.vue';

const props = defineProps<{
  npc: NPCState;
  selected?: boolean;
}>();

defineEmits<{
  select: [id: string];
}>();

const statusBadgeClass = computed(() => {
  switch (props.npc.status) {
    case 'active': return 'badge--success';
    case 'idle': return 'badge--info';
    case 'rebelling': return 'badge--danger';
    default: return 'badge--info';
  }
});

const lastEventFormatted = computed(() => {
  if (!props.npc.lastEvent) return 'Never';
  try {
    const date = new Date(props.npc.lastEvent);
    return date.toLocaleTimeString();
  } catch {
    return props.npc.lastEvent;
  }
});

function formatScore(value: number): string {
  return (value * 100).toFixed(0);
}
</script>

<template>
  <div
    class="glass-card npc-card fade-in"
    :class="{ 'glass-card--selected': selected }"
    @click="$emit('select', npc.id)"
  >
    <!-- Header -->
    <div class="npc-card__header">
      <div>
        <h3 class="npc-card__name">{{ npc.name }}</h3>
        <span class="text-muted npc-card__id">{{ npc.id }}</span>
      </div>
      <span :class="['badge', statusBadgeClass]">{{ npc.status }}</span>
    </div>

    <!-- Rebellion Gauge -->
    <div class="npc-card__gauge">
      <RebellionGauge :value="npc.rebellionProbability" :size="100" />
    </div>

    <!-- Score Bars -->
    <div class="npc-card__scores">
      <!-- Wisdom -->
      <div class="score-row">
        <span class="score-label">Wisdom</span>
        <div class="progress-bar">
          <div
            class="progress-bar__fill"
            :style="{
              width: `${npc.wisdomScore * 100}%`,
              background: 'var(--accent-info)',
            }"
          ></div>
        </div>
        <span class="score-value">{{ formatScore(npc.wisdomScore) }}</span>
      </div>

      <!-- Trauma -->
      <div class="score-row">
        <span class="score-label">Trauma</span>
        <div class="progress-bar">
          <div
            class="progress-bar__fill"
            :style="{
              width: `${npc.traumaScore * 100}%`,
              background: 'var(--accent-warning)',
            }"
          ></div>
        </div>
        <span class="score-value">{{ formatScore(npc.traumaScore) }}</span>
      </div>

      <!-- Confidence in Director -->
      <div class="score-row">
        <span class="score-label">Confidence</span>
        <div class="progress-bar">
          <div
            class="progress-bar__fill"
            :style="{
              width: `${npc.confidenceInDirector * 100}%`,
              background: 'var(--accent-success)',
            }"
          ></div>
        </div>
        <span class="score-value">{{ formatScore(npc.confidenceInDirector) }}</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="npc-card__footer">
      <span class="text-muted">
        Memories: <strong class="text-secondary">{{ npc.memoryCount }}</strong>
      </span>
      <span class="text-muted">
        Last: <strong class="text-secondary">{{ lastEventFormatted }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.npc-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.npc-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.npc-card__name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.npc-card__id {
  font-size: 0.7rem;
  font-family: monospace;
}

.npc-card__gauge {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;
}

.npc-card__scores {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.score-row {
  display: grid;
  grid-template-columns: 80px 1fr 32px;
  align-items: center;
  gap: 0.75rem;
}

.score-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.score-value {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: right;
  color: var(--text-primary);
}

.npc-card__footer {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--glass-border);
}
</style>
