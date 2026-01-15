import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { chatService } from '@/services/chat.service';
import type { ChatSessionResponseDto } from '@agentic-template/dto/src/chat/chat-session-response.dto';
import type { ChatMessageResponseDto } from '@agentic-template/dto/src/chat/chat-message-response.dto';

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSessionResponseDto[]>([]);
  const activeSessionId = ref<string | null>(null);
  const messages = ref<ChatMessageResponseDto[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const activeSession = computed(() => sessions.value.find((s) => s.id === activeSessionId.value));

  const fetchSessions = async (): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      sessions.value = await chatService.listSessions();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sessions';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const createSession = async (): Promise<ChatSessionResponseDto> => {
    const newSession = await chatService.createSession();
    sessions.value.unshift(newSession);
    activeSessionId.value = newSession.id;
    messages.value = [];
    return newSession;
  };

  const selectSession = async (id: string): Promise<void> => {
    activeSessionId.value = id;
    await loadMessages(id);
  };

  const loadMessages = async (sessionId: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      messages.value = await chatService.getMessages(sessionId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load messages';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const sendMessage = async (content: string): Promise<ChatMessageResponseDto> => {
    isLoading.value = true;
    error.value = null;
    try {
      if (!activeSessionId.value) {
        throw new Error('No active session');
      }

      const message = await chatService.sendMessage(activeSessionId.value, content);
      messages.value.push(message);
      return message;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to send message';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await chatService.deleteSession(sessionId);
      sessions.value = sessions.value.filter((s) => s.id !== sessionId);
      if (activeSessionId.value === sessionId) {
        activeSessionId.value = null;
        messages.value = [];
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete session';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const addAssistantMessage = (message: ChatMessageResponseDto): void => {
    messages.value.push(message);
  };

  return {
    sessions,
    activeSessionId,
    messages,
    isLoading,
    error,
    activeSession,
    fetchSessions,
    createSession,
    selectSession,
    loadMessages,
    sendMessage,
    deleteSession,
    addAssistantMessage,
  };
});
