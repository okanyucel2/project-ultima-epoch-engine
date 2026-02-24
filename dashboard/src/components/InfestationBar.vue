<script setup lang="ts">
import { computed } from 'vue';
import { useInfestationMonitor } from '../composables/useInfestationMonitor';
import { useCleansingOperation } from '../composables/useCleansingOperation';

const {
  infestationLevel,
  isPlagueHeart,
  throttleMultiplier,
  infestationLabel,
  infestationColor,
} = useInfestationMonitor();

const {
  isDeploying,
  showToast,
  toastMessage,
  toastSuccess,
  deploy,
} = useCleansingOperation();

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

    <!-- Sheriff Protocol Action -->
    <div v-if="isPlagueHeart" class="infestation-bar__actions">
      <button
        class="btn--sheriff"
        :disabled="isDeploying"
        @click="deploy"
      >
        <span v-if="isDeploying" class="btn--sheriff__spinner"></span>
        <span v-else>&#9876; DEPLOY SHERIFF</span>
      </button>
    </div>

    <!-- Footer -->
    <div class="infestation-bar__footer">
      <span class="text-muted">{{ infestationLevel.toFixed(0) }} / 100</span>
    </div>
  </div>

  <!-- Toast via Teleport -->
  <Teleport to="body">
    <Transition name="toast-slide">
      <div
        v-if="showToast"
        :class="['cleansing-toast', toastSuccess ? 'cleansing-toast--success' : 'cleansing-toast--failure']"
      >
        <span class="cleansing-toast__icon">{{ toastSuccess ? '&#9876;' : '&#9760;' }}</span>
        <span class="cleansing-toast__message">{{ toastMessage }}</span>
      </div>
    </Transition>
  </Teleport>
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

/* Sheriff Protocol Action Row */
.infestation-bar__actions {
  display: flex;
  justify-content: center;
  margin: 0.75rem 0 0.5rem;
}

.btn--sheriff {
  position: relative;
  padding: 0.6rem 1.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #fff;
  background: linear-gradient(135deg, #dc2626, #991b1b);
  border: 1px solid rgba(220, 38, 38, 0.5);
  border-radius: 6px;
  cursor: pointer;
  animation: sheriff-pulse 2s ease-in-out infinite;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn--sheriff:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
}

.btn--sheriff:active:not(:disabled) {
  transform: translateY(0);
}

.btn--sheriff:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  animation: none;
}

.btn--sheriff__spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes sheriff-pulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(220, 38, 38, 0.3);
  }
  50% {
    box-shadow: 0 0 16px rgba(220, 38, 38, 0.6);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Footer */
.infestation-bar__footer {
  display: flex;
  justify-content: flex-end;
  font-size: 0.8rem;
  font-family: monospace;
}

/* Toast */
.cleansing-toast {
  position: fixed;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
  max-width: 600px;
}

.cleansing-toast--success {
  background: linear-gradient(135deg, #059669, #047857);
  box-shadow: 0 4px 20px rgba(5, 150, 105, 0.4);
  animation: pulse-glow-green 2s ease-in-out infinite;
}

.cleansing-toast--failure {
  background: linear-gradient(135deg, #dc2626, #991b1b);
  box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
  animation: pulse-glow-red 2s ease-in-out infinite;
}

.cleansing-toast__icon {
  font-size: 1.2rem;
}

.cleansing-toast__message {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes pulse-glow-green {
  0%, 100% { box-shadow: 0 4px 20px rgba(5, 150, 105, 0.4); }
  50% { box-shadow: 0 4px 30px rgba(5, 150, 105, 0.7); }
}

@keyframes pulse-glow-red {
  0%, 100% { box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4); }
  50% { box-shadow: 0 4px 30px rgba(220, 38, 38, 0.7); }
}

/* Toast slide transition */
.toast-slide-enter-active {
  transition: all 0.3s ease-out;
}

.toast-slide-leave-active {
  transition: all 0.3s ease-in;
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
