import { ProviderErrorCode } from '@agentic-template/dto/src/providers';

/**
 * Error class for provider-related failures.
 * Implementations should throw this when provider operations fail.
 */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerId: string | undefined,
    message: string,
    public readonly debugContext?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /**
   * Returns a full JSON representation including debug context.
   * Use for internal logging only - do NOT send to users.
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      debugContext: this.debugContext,
    };
  }

  /**
   * Returns a user-safe representation without internal details.
   * Safe to include in API responses.
   */
  toUserSafeJSON() {
    return {
      code: this.code,
      message: this.getUserSafeMessage(),
      providerId: this.providerId,
    };
  }

  /**
   * Returns a user-friendly error message without internal implementation details.
   * Maps technical errors to generic messages.
   */
  getUserSafeMessage(): string {
    switch (this.code) {
      case ProviderErrorCode.PROVIDER_UNAVAILABLE:
        return 'The service is temporarily unavailable. Please try again later.';
      case ProviderErrorCode.AUTHENTICATION_ERROR:
        return 'Service configuration error. Please contact support.';
      case ProviderErrorCode.RATE_LIMITED:
        return 'Too many requests. Please wait a moment and try again.';
      case ProviderErrorCode.GENERATION_FAILED:
        return 'Generation failed. Please try again with different parameters.';
      case ProviderErrorCode.INVALID_PARAMS:
        return 'Invalid parameters provided.';
      case ProviderErrorCode.PROVIDER_NOT_FOUND:
        return 'The requested provider is not available.';
      case ProviderErrorCode.CONTENT_UNAVAILABLE:
        return 'Generated content is no longer available.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}
