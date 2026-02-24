import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEpochWebSocket, type WebSocketMessage } from './useEpochWebSocket';

export interface AEGISWhisper {
  message: string;
  infestationLevel: number;
  npcId?: string;
  timestamp: string;
}

export interface AEGISVeto {
  eventId: string;
  npcId: string;
  reason: string;
  infestationLevel: number;
  timestamp: string;
}

export function useInfestationMonitor() {
  const { onMessage, offMessage } = useEpochWebSocket([
    'system-status',
    'simulation-ticks',
    'cognitive-rails',
  ]);

  const infestationLevel = ref(0);
  const isPlagueHeart = ref(false);
  const throttleMultiplier = ref(1.0);
  const aegisWhispers = ref<AEGISWhisper[]>([]);
  const aegisVetoes = ref<AEGISVeto[]>([]);

  const infestationLabel = computed(() => {
    if (isPlagueHeart.value) return 'PLAGUE HEART';
    if (infestationLevel.value >= 75) return 'CRITICAL';
    if (infestationLevel.value >= 50) return 'WARNING';
    return 'CLEAR';
  });

  const infestationColor = computed(() => {
    if (isPlagueHeart.value) return 'var(--infestation-plague)';
    if (infestationLevel.value >= 75) return 'var(--infestation-high)';
    if (infestationLevel.value >= 50) return 'var(--infestation-medium)';
    return 'var(--infestation-low)';
  });

  function handleSystemStatus(msg: WebSocketMessage): void {
    const data = msg.data;
    if (data.type === 'aegis_whisper') {
      aegisWhispers.value = [
        {
          message: String(data.message ?? ''),
          infestationLevel: Number(data.infestationLevel ?? 0),
          npcId: data.npcId ? String(data.npcId) : undefined,
          timestamp: msg.timestamp,
        },
        ...aegisWhispers.value,
      ].slice(0, 50);
    }

    // Sync infestation from simulation tick data
    if (data.infestation_level !== undefined) {
      infestationLevel.value = Number(data.infestation_level);
      isPlagueHeart.value = Boolean(data.is_plague_heart);
      throttleMultiplier.value = Number(data.throttle_multiplier ?? 1.0);
    }
  }

  function handleSimulationTick(msg: WebSocketMessage): void {
    const data = msg.data;
    if (data.infestationLevel !== undefined) {
      infestationLevel.value = Number(data.infestationLevel);
      isPlagueHeart.value = Boolean(data.isPlagueHeart);
      throttleMultiplier.value = Number(data.throttleMultiplier ?? 1.0);
    }
  }

  function handleCognitiveRails(msg: WebSocketMessage): void {
    const data = msg.data;
    if (data.vetoedByAegis) {
      aegisVetoes.value = [
        {
          eventId: String(data.eventId ?? ''),
          npcId: String(data.npcId ?? 'unknown'),
          reason: String(data.vetoReason ?? 'AEGIS Veto'),
          infestationLevel: Number(data.infestationLevel ?? 100),
          timestamp: msg.timestamp,
        },
        ...aegisVetoes.value,
      ].slice(0, 50);
    }
  }

  onMounted(() => {
    onMessage('system-status', handleSystemStatus);
    onMessage('simulation-ticks', handleSimulationTick);
    onMessage('cognitive-rails', handleCognitiveRails);
  });

  onUnmounted(() => {
    offMessage('system-status', handleSystemStatus);
    offMessage('simulation-ticks', handleSimulationTick);
    offMessage('cognitive-rails', handleCognitiveRails);
  });

  return {
    infestationLevel,
    isPlagueHeart,
    throttleMultiplier,
    infestationLabel,
    infestationColor,
    aegisWhispers,
    aegisVetoes,
  };
}
