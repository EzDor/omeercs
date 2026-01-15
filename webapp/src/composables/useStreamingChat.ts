import { ref, onUnmounted } from 'vue';
import { authService } from '../services/api/auth.service';

export function useStreamingChat() {
  const streamingMessage = ref('');
  const isStreaming = ref(false);
  const error = ref<string | null>(null);
  let eventSource: EventSource | null = null;

  function clearMessage() {
    streamingMessage.value = '';
    error.value = null;
  }

  async function connectStream(sessionId: string, message: string) {
    streamingMessage.value = '';
    isStreaming.value = true;
    error.value = null;

    const token = await authService.getToken();
    const baseUrl = import.meta.env.VITE_API_CENTER_BASE_URL || 'http://localhost:3001';
    const url = `${baseUrl}/chat/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}&token=${token}`;

    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        disconnect();
        return;
      }
      streamingMessage.value += event.data;
    };

    eventSource.onerror = () => {
      error.value = 'Connection lost. Please try again.';
      disconnect();
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isStreaming.value = false;
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    streamingMessage,
    isStreaming,
    error,
    connectStream,
    disconnect,
    clearMessage,
  };
}
