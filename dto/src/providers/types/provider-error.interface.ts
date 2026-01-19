/**
 * Error codes for provider failures.
 */
export enum ProviderErrorCode {
  /** Provider API is unreachable */
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  /** Authentication failed (don't expose credential details) */
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',

  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',

  /** Generation request failed */
  GENERATION_FAILED = 'GENERATION_FAILED',

  /** Invalid or unsupported parameters */
  INVALID_PARAMS = 'INVALID_PARAMS',

  /** Provider not found in registry */
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',

  /** Content URI expired or inaccessible */
  CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',
}

/**
 * Structured error from provider operations.
 */
export interface ProviderErrorDetails {
  code: ProviderErrorCode;
  providerId?: string;
  message: string;
  /** Additional context for debugging (not exposed to users) */
  debugContext?: Record<string, unknown>;
}
