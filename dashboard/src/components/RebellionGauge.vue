<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  value: number; // 0 to 1
  npcName?: string;
  size?: number;
}>();

const size = computed(() => props.size ?? 120);
const radius = computed(() => (size.value - 12) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const percentage = computed(() => Math.round(Math.min(1, Math.max(0, props.value)) * 100));

const strokeDashoffset = computed(() => {
  const progress = 1 - props.value;
  return circumference.value * progress;
});

const gaugeColor = computed(() => {
  if (props.value > 0.8) return '#dc2626';
  if (props.value > 0.6) return 'var(--accent-danger)';
  if (props.value > 0.2) return 'var(--accent-warning)';
  return 'var(--accent-success)';
});

const rebellionClass = computed(() => {
  if (props.value > 0.8) return 'rebellion-critical';
  if (props.value > 0.6) return 'rebellion-high';
  if (props.value > 0.2) return 'rebellion-medium';
  return 'rebellion-low';
});

const isCritical = computed(() => props.value > 0.8);
</script>

<template>
  <div class="gauge-container" :class="{ pulse: isCritical }">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="gauge-svg"
    >
      <!-- Background circle -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        :stroke-width="6"
      />
      <!-- Progress arc -->
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="gaugeColor"
        :stroke-width="6"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
        class="gauge-progress"
        transform="rotate(-90)"
        :transform-origin="`${size / 2} ${size / 2}`"
      />
      <!-- Percentage text -->
      <text
        :x="size / 2"
        :y="size / 2"
        text-anchor="middle"
        dominant-baseline="central"
        :class="rebellionClass"
        class="gauge-text"
        :font-size="size * 0.22"
        fill="currentColor"
      >
        {{ percentage }}%
      </text>
    </svg>
    <div v-if="npcName" class="gauge-label">{{ npcName }}</div>
  </div>
</template>

<style scoped>
.gauge-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.gauge-svg {
  display: block;
}

.gauge-progress {
  transition: stroke-dashoffset 0.6s ease, stroke 0.3s ease;
}

.gauge-text {
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
}

.gauge-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: center;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
