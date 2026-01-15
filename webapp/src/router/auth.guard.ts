import { useAuth } from '@clerk/vue';

export const requireAuth = async (to: any) => {
  const { userId, isLoaded } = useAuth();

  const timeout = 7000;
  const startTime = Date.now();

  while (!isLoaded.value) {
    if (Date.now() - startTime > timeout) {
      console.error('Auth guard timeout: Clerk failed to load');
      return { name: 'sign-in', query: { redirect: to.fullPath } };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!userId.value) {
    return { name: 'sign-in', query: { redirect: to.fullPath } };
  }

  return true;
};
