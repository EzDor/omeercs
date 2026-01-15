<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';

interface Props {
  disabled?: boolean;
}

const { t } = useI18n();

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  sendMessage: [content: string];
}>();

const content = ref('');
const MAX_LENGTH = 10000;

const characterCount = computed(() => content.value.length);
const isOverLimit = computed(() => characterCount.value > MAX_LENGTH);
const canSend = computed(() => content.value.trim().length > 0 && !isOverLimit.value && !props.disabled);

const handleSend = (): void => {
  if (canSend.value) {
    emit('sendMessage', content.value.trim());
    content.value = '';
  }
};

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
};
</script>

<template>
  <div class="border-t border-surface-200 dark:border-surface-700 p-4">
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <Textarea
          v-model="content"
          :disabled="disabled"
          :placeholder="t('chat.input.placeholder')"
          rows="3"
          auto-resize
          class="flex-1"
          :class="{ 'border-red-500': isOverLimit }"
          @keydown="handleKeydown"
          :aria-label="t('chat.input.placeholder')"
          :aria-invalid="isOverLimit"
        />
        <Button icon="pi pi-send" :disabled="!canSend" @click="handleSend" class="self-end" :aria-label="t('common.sending')" :aria-disabled="!canSend" />
      </div>

      <div class="flex justify-between items-center text-sm">
        <span v-if="disabled" class="text-surface-500 dark:text-surface-400">
          <i class="pi pi-spin pi-spinner me-1" aria-hidden="true"></i>
          {{ t('common.sending') }}
        </span>
        <span v-else class="text-surface-500 dark:text-surface-400">{{ t('chat.input.helper') }}</span>
        <span class="text-surface-500 dark:text-surface-400" :class="{ 'text-red-500': isOverLimit }"> {{ characterCount }} / {{ MAX_LENGTH }} </span>
      </div>

      <div v-if="isOverLimit" class="text-sm text-red-500" role="alert">{{ t('chat.input.maxLengthError', { max: MAX_LENGTH }) }}</div>
    </div>
  </div>
</template>
