<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatMessageResponseDto } from '@agentic-template/dto/src/chat/chat-message-response.dto';

interface Props {
  messages: ChatMessageResponseDto[];
}

const { t } = useI18n();
const props = defineProps<Props>();

const messageContainer = ref<HTMLElement | null>(null);

const scrollToBottom = async (): Promise<void> => {
  await nextTick();
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
  }
};

watch(
  () => props.messages,
  () => {
    scrollToBottom();
  },
  { deep: true },
);

const formatTime = (date: Date): string => {
  const messageDate = new Date(date);
  return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<template>
  <div ref="messageContainer" class="flex-1 overflow-y-auto p-4 space-y-4 h-full" role="log" :aria-label="t('chat.messageList.startConversation')">
    <div v-for="message in messages" :key="message.id" class="flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
      <div
        class="max-w-[70%] rounded-2xl px-4 py-3 shadow-md"
        :class="message.role === 'user' ? 'bg-primary-500 text-surface-900' : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-0'"
        :aria-label="t('chat.messageList.messageAria', { role: t(`chat.messageList.roles.${message.role}`), content: message.content })"
      >
        <div class="whitespace-pre-wrap break-words">
          {{ message.content }}
        </div>
        <div class="text-xs mt-2 opacity-70" :class="message.role === 'user' ? 'text-end' : 'text-start'">
          {{ formatTime(message.createdAt) }}
        </div>
      </div>
    </div>

    <div v-if="messages.length === 0" class="flex items-center justify-center h-full text-surface-500 dark:text-surface-400">
      <div class="text-center">
        <i class="pi pi-comments text-6xl mb-4 opacity-50" aria-hidden="true"></i>
        <p class="text-lg">{{ t('chat.messageList.startConversation') }}</p>
      </div>
    </div>
  </div>
</template>
