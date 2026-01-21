export interface RegistrySuccessResult<T> {
  ok: true;
  data: T;
}

export type RegistryErrorCode = 'TEMPLATE_NOT_FOUND' | 'VERSION_NOT_FOUND' | 'VALIDATION_ERROR' | 'RENDER_ERROR' | 'LOAD_ERROR';

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface RegistryErrorResult {
  ok: false;
  error: string;
  errorCode: RegistryErrorCode;
  details?: {
    validationErrors?: ValidationError[];
    availableVersions?: string[];
  };
}

export type RegistryResult<T> = RegistrySuccessResult<T> | RegistryErrorResult;
