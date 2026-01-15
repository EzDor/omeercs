<template>
  <div class="flex min-h-screen items-center justify-center bg-surface-50 dark:bg-surface-900">
    <SignIn :routing="'path'" :path="'/sign-in'" />
  </div>
</template>

<script setup lang="ts">
import { SignIn } from '@clerk/vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@clerk/vue';
import { watch } from 'vue';

const route = useRoute();
const router = useRouter();
const { userId } = useAuth();

watch(userId, (newUserId) => {
  if (newUserId) {
    const redirectPath = (route.query.redirect as string) || '/chat';
    router.push(redirectPath);
  }
});
</script>
