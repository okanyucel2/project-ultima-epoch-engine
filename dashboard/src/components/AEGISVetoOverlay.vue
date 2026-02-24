<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useEpochWebSocket, type WebSocketMessage } from '../composables/useEpochWebSocket';

const { onMessage, offMessage } = useEpochWebSocket(['cognitive-rails']);

const visible = ref(false);
const vetoData = ref<{
  reason: string;
  npcId: string;
  eventType: string;
  infestationLevel: number;
} | null>(null);

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

function handleCognitiveRails(msg: WebSocketMessage): void {
  const data = msg.data;
  if (!data.vetoedByAegis) return;

  vetoData.value = {
    reason: String(data.vetoReason ?? 'Action vetoed by AEGIS'),
    npcId: String(data.npcId ?? 'unknown'),
    eventType: String(data.eventType ?? data.tier ?? 'unknown'),
    infestationLevel: Number(data.infestationLevel ?? 100),
  };
  visible.value = true;

  // Auto-dismiss after 8 seconds
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    visible.value = false;
  }, 8000);
}

function dismiss(): void {
  visible.value = false;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
}

onMounted(() => {
  onMessage('cognitive-rails', handleCognitiveRails);
});

onUnmounted(() => {
  offMessage('cognitive-rails', handleCognitiveRails);
  if (dismissTimer) clearTimeout(dismissTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="veto-fade">
      <div v-if="visible" class="veto-overlay" @click.self="dismiss">
        <div class="veto-card glass-card">
          <div class="veto-card__icon">&#9940;</div>
          <h2 class="veto-card__title">ACTION VETOED BY AEGIS</h2>
          <p class="veto-card__reason">{{ vetoData?.reason }}</p>
          <div class="veto-card__details">
            <div class="veto-card__detail">
              <span class="text-muted">NPC</span>
              <span>{{ vetoData?.npcId }}</span>
            </div>
            <div class="veto-card__detail">
              <span class="text-muted">Action</span>
              <span>{{ vetoData?.eventType }}</span>
            </div>
            <div class="veto-card__detail">
              <span class="text-muted">Infestation</span>
              <span class="veto-card__level">{{ vetoData?.infestationLevel }}/100</span>
            </div>
          </div>
          <button class="veto-card__button" @click="dismiss">Acknowledged</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.veto-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 15, 25, 0.95);
}

.veto-card {
  max-width: 480px;
  width: 90%;
  text-align: center;
  border-color: var(--accent-danger);
  animation: veto-glow 2s ease-in-out infinite;
}

@keyframes veto-glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3), inset 0 0 20px rgba(239, 68, 68, 0.05);
  }
  50% {
    box-shadow: 0 0 40px rgba(239, 68, 68, 0.5), inset 0 0 30px rgba(239, 68, 68, 0.1);
  }
}

.veto-card__icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.veto-card__title {
  margin: 0 0 1rem 0;
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--accent-danger);
  letter-spacing: 0.05em;
}

.veto-card__reason {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  line-height: 1.6;
}

.veto-card__details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.veto-card__detail {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.85rem;
}

.veto-card__level {
  color: var(--accent-danger);
  font-weight: 700;
}

.veto-card__button {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 0.6rem 2rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.veto-card__button:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

/* Transition */
.veto-fade-enter-active {
  transition: opacity 0.3s ease;
}
.veto-fade-leave-active {
  transition: opacity 0.5s ease;
}
.veto-fade-enter-from,
.veto-fade-leave-to {
  opacity: 0;
}
</style>
