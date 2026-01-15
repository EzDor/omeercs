import { useAuth } from '@clerk/vue';
import { unref } from 'vue';

class AuthService {
  private tokenRetriever: (() => Promise<string | null>) | null = null;

  setTokenGetter(getTokenFn: () => Promise<string | null>): void {
    this.tokenRetriever = getTokenFn;
  }

  async getToken(): Promise<string | null> {
    if (!this.tokenRetriever || typeof this.tokenRetriever !== 'function') {
      console.warn('Clerk auth not initialized');
      return null;
    }
    try {
      return await this.tokenRetriever();
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }
}

export const authService = new AuthService();

export const useAuthSetup = (): void => {
  const { getToken } = useAuth();
  const tokenFn = unref(getToken);
  authService.setTokenGetter(() => tokenFn());
};
