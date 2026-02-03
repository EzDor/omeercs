export const ContextErrorCodes = {
  BASE_RUN_NOT_FOUND: 'BASE_RUN_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INCOMPLETE_BASE_RUN: 'INCOMPLETE_BASE_RUN',
  DUPLICATE_ARTIFACT_ID: 'DUPLICATE_ARTIFACT_ID',
  INVALID_ARTIFACT_TYPE: 'INVALID_ARTIFACT_TYPE',
  CONTEXT_CAPACITY_EXCEEDED: 'CONTEXT_CAPACITY_EXCEEDED',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INVALID_ARTIFACT_URI: 'INVALID_ARTIFACT_URI',
  INVALID_ARTIFACT_HASH: 'INVALID_ARTIFACT_HASH',
} as const;

export type ContextErrorCode = (typeof ContextErrorCodes)[keyof typeof ContextErrorCodes];

export interface ContextError {
  ok: false;
  error: {
    code: ContextErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ContextResult<T> {
  ok: true;
  data: T;
}

export type ContextOperationResult<T> = ContextResult<T> | ContextError;
