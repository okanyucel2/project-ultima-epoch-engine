import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEpochWebSocket, type WebSocketMessage } from './useEpochWebSocket';

export interface NPCState {
  id: string;
  name: string;
  wisdomScore: number;
  traumaScore: number;
  rebellionProbability: number;
  confidenceInDirector: number;
  memoryCount: number;
  lastEvent: string;
  status: 'active' | 'idle' | 'rebelling';
}

export function useNPCMonitor() {
  const npcs = ref<NPCState[]>([]);
  const selectedNPC = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const { onMessage, offMessage } = useEpochWebSocket(['npc-events']);

  const sortedNPCs = computed(() => {
    return [...npcs.value].sort((a, b) => b.rebellionProbability - a.rebellionProbability);
  });

  const criticalCount = computed(() => {
    return npcs.value.filter((npc) => npc.rebellionProbability > 0.8).length;
  });

  const avgRebellion = computed(() => {
    if (npcs.value.length === 0) return 0;
    const sum = npcs.value.reduce((acc, npc) => acc + npc.rebellionProbability, 0);
    return sum / npcs.value.length;
  });

  function handleNPCEvent(msg: WebSocketMessage): void {
    const data = msg.data as Partial<NPCState> & { id?: string; npcId?: string };
    const npcId = data.id || data.npcId;
    if (!npcId) return;

    const index = npcs.value.findIndex((n) => n.id === npcId);
    if (index >= 0) {
      npcs.value[index] = {
        ...npcs.value[index],
        ...data,
        id: npcId,
        lastEvent: msg.timestamp,
      };
    } else {
      npcs.value.push({
        id: npcId,
        name: (data.name as string) || `NPC-${npcId.slice(0, 6)}`,
        wisdomScore: (data.wisdomScore as number) ?? 0.5,
        traumaScore: (data.traumaScore as number) ?? 0,
        rebellionProbability: (data.rebellionProbability as number) ?? 0,
        confidenceInDirector: (data.confidenceInDirector as number) ?? 1.0,
        memoryCount: (data.memoryCount as number) ?? 0,
        lastEvent: msg.timestamp,
        status: (data.status as NPCState['status']) ?? 'active',
      });
    }
  }

  function selectNPC(id: string | null): void {
    selectedNPC.value = id;
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`Failed to fetch NPC data: ${res.status}`);
      // Status endpoint provides aggregate data; NPC list comes via WebSocket
      loading.value = false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to refresh NPC data';
      loading.value = false;
    }
  }

  onMounted(() => {
    onMessage('npc-events', handleNPCEvent);
    refresh();
  });

  onUnmounted(() => {
    offMessage('npc-events', handleNPCEvent);
  });

  return {
    npcs,
    sortedNPCs,
    selectedNPC,
    loading,
    error,
    criticalCount,
    avgRebellion,
    selectNPC,
    refresh,
  };
}
