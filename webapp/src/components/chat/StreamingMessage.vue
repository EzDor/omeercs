<script setup lang="ts">
import { useI18n } from 'vue-i18n';

interface Props {
  content: string;
  isStreaming: boolean;
}

const { t } = useI18n();
defineProps<Props>();
</script>

<template>
  <div v-if="content || isStreaming" class="flex justify-start">
    <div
      class="max-w-[70%] rounded-lg px-4 py-3 shadow-sm bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-0"
      role="status"
      :aria-label="isStreaming ? t('chat.streaming.typing') : t('chat.streaming.message')"
      aria-live="polite"
    >
      <div class="whitespace-pre-wrap break-words">
        {{ content }}
        <span v-if="isStreaming" class="inline-flex gap-1 ms-1" aria-hidden="true">
          <span class="typing-dot">.</span>
          <span class="typing-dot animation-delay-200">.</span>
          <span class="typing-dot animation-delay-400">.</span>
        </span>
      </div>
      <div v-if="isStreaming" class="text-xs mt-2 opacity-70 text-start">{{ t('chat.streaming.generating') }}</div>
    </div>
  </div>
</template>

<style scoped>
.typing-dot {
  animation: typing 1.4s infinite;
  opacity: 0;
}

.animation-delay-200 {
  animation-delay: 0.2s;
}

.animation-delay-400 {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}
</style>
