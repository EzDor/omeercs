export interface GoogleApiExceptionDetails {
  code?: string;
  status?: number;
  statusText?: string;
  data?: {
    error?: string | { message?: string };
  };
}
