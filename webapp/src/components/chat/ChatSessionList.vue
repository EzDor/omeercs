<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import type { ChatSessionResponseDto } from '@agentic-template/dto/src/chat/chat-session-response.dto';

interface Props {
  sessions: ChatSessionResponseDto[];
  activeSessionId: string | null;
}

const { t } = useI18n();
const props = defineProps<Props>();

const emit = defineEmits<{
  selectSession: [id: string];
  createSession: [];
}>();

const formatTimestamp = (date: Date): string => {
  const now = new Date();
  const messageDate = new Date(date);
  const diffMs = now.getTime() - messageDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('chat.sessionList.timeAgo.justNow');
  if (diffMins < 60) return t('chat.sessionList.timeAgo.minutesAgo', { minutes: diffMins });
  if (diffHours < 24) return t('chat.sessionList.timeAgo.hoursAgo', { hours: diffHours });
  if (diffDays < 7) return t('chat.sessionList.timeAgo.daysAgo', { days: diffDays });
  return messageDate.toLocaleDateString();
};

const isActive = (sessionId: string): boolean => {
  return props.activeSessionId === sessionId;
};
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-surface-200 dark:border-surface-700">
      <Button :label="t('chat.sessionList.newChat')" icon="pi pi-plus" class="w-full" @click="emit('createSession')" :aria-label="t('chat.sessionList.createNew')" />
    </div>

    <div class="flex-1 overflow-y-auto">
      <DataView :value="sessions" data-key="id" class="session-list">
        <template #list="{ items }">
          <div class="flex flex-col">
            <button
              v-for="session in items"
              :key="session.id"
              class="p-4 border-b border-surface-200 dark:border-surface-700 text-start text-surface-900 dark:text-surface-0 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-surface-800 dark:hover:text-surface-0 transition-colors focus:outline-none focus:bg-surface-100 dark:focus:bg-surface-700"
              :class="{ 'bg-surface-200 text-surface-900 dark:bg-primary-900/20 dark:text-surface-0': isActive(session.id) }"
              @click="emit('selectSession', session.id)"
              @keydown.enter="emit('selectSession', session.id)"
              :aria-label="t('chat.sessionList.selectSession', { title: session.title || t('chat.sessionList.newChat') })"
              :aria-current="isActive(session.id) ? 'true' : undefined"
              tabindex="0"
            >
              <div class="flex flex-col gap-1">
                <div class="font-medium text-current truncate">
                  {{ session.title || t('chat.sessionList.newChat') }}
                </div>
                <div class="text-sm opacity-60">
                  {{ formatTimestamp(session.lastMessageAt) }}
                </div>
              </div>
            </button>
          </div>
        </template>

        <template #empty>
          <div class="p-4 text-center text-surface-500 dark:text-surface-400">{{ t('chat.sessionList.noSessions') }}</div>
        </template>
      </DataView>
    </div>
  </div>
</template>

<style scoped>
.session-list :deep(.p-dataview-content) {
  background: transparent;
}
</style>
