import { ref, onMounted, onUnmounted } from 'vue';
import { deployCleansingOperation } from '../api/epoch-api';
import type { CleansingDeployResult } from '../api/epoch-api';
import { useEpochWebSocket, type WebSocketMessage } from './useEpochWebSocket';

export function useCleansingOperation() {
  const { onMessage, offMessage } = useEpochWebSocket(['system-status']);

  const isDeploying = ref(false);
  const lastResult = ref<CleansingDeployResult | null>(null);
  const showToast = ref(false);
  const toastMessage = ref('');
  const toastSuccess = ref(false);
  const error = ref<string | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function setToast(message: string, success: boolean) {
    toastMessage.value = message;
    toastSuccess.value = success;
    showToast.value = true;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      showToast.value = false;
    }, 8000);
  }

  async function deploy() {
    if (isDeploying.value) return;

    isDeploying.value = true;
    error.value = null;

    try {
      const result = await deployCleansingOperation();
      lastResult.value = result;

      if (result.success) {
        setToast(
          `PLAGUE HEART CLEANSED! ${result.participantCount} heroes (${(result.successRate * 100).toFixed(0)}% chance)`,
          true,
        );
      } else {
        setToast(
          `CLEANSING FAILED. ${result.participantCount} NPCs suffer Survivor's Guilt (${(result.successRate * 100).toFixed(0)}%)`,
          false,
        );
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error';
      setToast(`CLEANSING ERROR: ${error.value}`, false);
    } finally {
      isDeploying.value = false;
    }
  }

  // Multi-tab sync via WebSocket
  function handleSystemStatus(msg: WebSocketMessage) {
    const data = msg.data;
    if (data.type === 'cleansing_result') {
      const success = Boolean(data.success);
      const rate = Number(data.successRate ?? 0);
      const count = Number(data.participantCount ?? 0);

      if (success) {
        setToast(
          `PLAGUE HEART CLEANSED! ${count} heroes (${(rate * 100).toFixed(0)}% chance)`,
          true,
        );
      } else {
        setToast(
          `CLEANSING FAILED. ${count} NPCs suffer Survivor's Guilt (${(rate * 100).toFixed(0)}%)`,
          false,
        );
      }
    }
  }

  onMounted(() => {
    onMessage('system-status', handleSystemStatus);
  });

  onUnmounted(() => {
    offMessage('system-status', handleSystemStatus);
    if (toastTimer) clearTimeout(toastTimer);
  });

  return {
    isDeploying,
    lastResult,
    showToast,
    toastMessage,
    toastSuccess,
    error,
    deploy,
  };
}
