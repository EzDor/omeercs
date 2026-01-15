<script setup lang="ts">
import { onMounted, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat.store.ts';
import { useStreamingChat } from '@/composables/useStreamingChat.ts';
import ChatSessionList from '@/components/chat/ChatSessionList.vue';
import ChatMessageList from '@/components/chat/ChatMessageList.vue';
import ChatInput from '@/components/chat/ChatInput.vue';
import StreamingMessage from '@/components/chat/StreamingMessage.vue';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';

const { t } = useI18n();
const chatStore = useChatStore();
const { streamingMessage, isStreaming, connectStream, clearMessage } = useStreamingChat();

const isSending = computed(() => chatStore.isLoading || isStreaming.value);

onMounted(async () => {
  await chatStore.fetchSessions();
});

watch(
  () => chatStore.activeSessionId,
  async (newId) => {
    clearMessage();
    if (newId) {
      await chatStore.loadMessages(newId);
    }
  },
);

const handleCreateSession = async (): Promise<void> => {
  await chatStore.createSession();
};

const handleSelectSession = async (id: string): Promise<void> => {
  await chatStore.selectSession(id);
};

const handleSendMessage = async (content: string): Promise<void> => {
  if (!chatStore.activeSessionId) {
    return;
  }

  await chatStore.sendMessage(content);
  if (chatStore.activeSessionId) {
    connectStream(chatStore.activeSessionId, content);
  }
};

watch(
  () => isStreaming.value,
  async (streaming) => {
    if (!streaming && streamingMessage.value && chatStore.activeSessionId) {
      chatStore.addAssistantMessage({
        id: crypto.randomUUID(),
        sessionId: chatStore.activeSessionId,
        role: 'assistant',
        content: streamingMessage.value,
        createdAt: new Date(),
      });
      clearMessage();
      await chatStore.fetchSessions();
    }
  },
);
</script>

<template>
  <div class="chat-page-container">
    <div class="chat-card bg-surface-0 dark:bg-surface-900">
      <Splitter class="h-full">
        <SplitterPanel :size="25" :min-size="20" class="hidden md:block">
          <ChatSessionList
            :sessions="chatStore.sessions"
            :active-session-id="chatStore.activeSessionId"
            @select-session="handleSelectSession"
            @create-session="handleCreateSession"
          />
        </SplitterPanel>

        <SplitterPanel :size="75" class="flex flex-col">
          <div v-if="!chatStore.activeSessionId" class="flex items-center justify-center h-full">
            <div class="text-center">
              <i class="pi pi-comments text-6xl mb-4 text-surface-400 dark:text-surface-600" aria-hidden="true"></i>
              <p class="text-xl text-surface-600 dark:text-surface-400 mb-4">{{ t('chat.page.selectOrCreate') }}</p>
              <button class="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors" @click="handleCreateSession">
                <i class="pi pi-plus me-2" aria-hidden="true"></i>
                {{ t('chat.page.startNew') }}
              </button>
            </div>
          </div>

          <div v-else class="flex-1 flex flex-col overflow-hidden">
            <ChatMessageList :messages="chatStore.messages" />

            <div v-if="streamingMessage || isStreaming" class="px-4 pb-4">
              <StreamingMessage :content="streamingMessage" :is-streaming="isStreaming" />
            </div>

            <ChatInput :disabled="isSending" @send-message="handleSendMessage" />
          </div>
        </SplitterPanel>
      </Splitter>
    </div>

    <div class="md:hidden fixed bottom-4 end-4 z-50">
      <button
        class="w-14 h-14 rounded-full bg-primary-500 text-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors"
        @click="handleCreateSession"
        :aria-label="t('chat.page.createNewAria')"
      >
        <i class="pi pi-plus text-xl" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-page-container {
  height: calc(100vh - 8rem);
  display: flex;
  flex-direction: column;
}

.chat-card {
  flex: 1;
  border-radius: 0.75rem;
  box-shadow:
    0 1px 3px 0 rgb(0 0 0 / 0.1),
    0 1px 2px -1px rgb(0 0 0 / 0.1);
  overflow: hidden;
}

.chat-page-container :deep(.p-splitter) {
  height: 100%;
  border: none;
  background: transparent;
}

.chat-page-container :deep(.p-splitter-panel) {
  height: 100%;
  overflow: hidden;
}
</style>
