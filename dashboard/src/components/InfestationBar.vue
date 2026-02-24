<script setup lang="ts">
import { computed } from 'vue';
import { useInfestationMonitor } from '../composables/useInfestationMonitor';

const {
  infestationLevel,
  isPlagueHeart,
  throttleMultiplier,
  infestationLabel,
  infestationColor,
} = useInfestationMonitor();

const progressWidth = computed(() => `${Math.min(infestationLevel.value, 100)}%`);

const progressGradient = computed(() => {
  const level = infestationLevel.value;
  if (level <= 25) return 'var(--infestation-low)';
  if (level <= 50) return 'var(--infestation-medium)';
  if (level <= 75) return 'var(--infestation-high)';
  return 'var(--infestation-plague)';
});

const labelBadgeClass = computed(() => {
  const label = infestationLabel.value;
  if (label === 'PLAGUE HEART') return 'badge--danger';
  if (label === 'CRITICAL') return 'badge--danger';
  if (label === 'WARNING') return 'badge--warning';
  return 'badge--success';
});
</script>

<template>
  <div
    :class="['glass-card', 'infestation-bar', { 'infestation-bar--plague': isPlagueHeart }]"
    :style="{ borderLeftColor: infestationColor }"
  >
    <!-- Header -->
    <div class="infestation-bar__header">
      <div class="infestation-bar__title">
        <span v-if="isPlagueHeart" class="infestation-bar__skull">&#9760;</span>
        <span class="infestation-bar__label">INFESTATION</span>
        <span :class="['badge', labelBadgeClass]">{{ infestationLabel }}</span>
      </div>
      <div v-if="isPlagueHeart" class="badge badge--danger">
        Production: {{ (throttleMultiplier * 100).toFixed(0) }}%
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="infestation-bar__track">
      <div
        class="infestation-bar__fill"
        :style="{ width: progressWidth, backgroundColor: progressGradient }"
      ></div>
      <!-- Threshold markers -->
      <div class="infestation-bar__marker" :style="{ left: '50%' }">
        <span class="infestation-bar__marker-label">50</span>
      </div>
      <div class="infestation-bar__marker" :style="{ left: '75%' }">
        <span class="infestation-bar__marker-label">75</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="infestation-bar__footer">
      <span class="text-muted">{{ infestationLevel.toFixed(0) }} / 100</span>
    </div>
  </div>
</template>

<style scoped>
.infestation-bar {
  border-left: 3px solid var(--infestation-low);
  padding: 1rem 1.5rem;
}

.infestation-bar--plague {
  animation: plague-pulse 2s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(220, 38, 38, 0.3);
}

@keyframes plague-pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(220, 38, 38, 0.3);
  }
  50% {
    box-shadow: 0 0 30px rgba(220, 38, 38, 0.5);
  }
}

.infestation-bar__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.infestation-bar__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.infestation-bar__skull {
  font-size: 1.2rem;
  animation: pulse-glow 2s ease-in-out infinite;
}

.infestation-bar__label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
}

.infestation-bar__track {
  position: relative;
  width: 100%;
  height: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 5px;
  overflow: visible;
  margin-bottom: 0.5rem;
}

.infestation-bar__fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease, background-color 0.5s ease;
}

.infestation-bar__marker {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 1px;
  border-left: 1px dashed rgba(255, 255, 255, 0.2);
}

.infestation-bar__marker-label {
  position: absolute;
  top: -18px;
  left: 2px;
  font-size: 0.6rem;
  color: var(--text-muted);
}

.infestation-bar__footer {
  display: flex;
  justify-content: flex-end;
  font-size: 0.8rem;
  font-family: monospace;
}
</style>
