import { HttpException, HttpStatus } from '@nestjs/common';
import { GoogleApiExceptionDetails } from '../interfaces/google-api-exception-details.interface';

export class GoogleApiException extends HttpException {
  public readonly code?: string;
  public readonly googleStatus?: number;
  public readonly googleStatusText?: string;
  public readonly googleData?: {
    error?: string | { message?: string };
  };

  constructor(message: string, details?: GoogleApiExceptionDetails) {
    super(message, details?.status || HttpStatus.INTERNAL_SERVER_ERROR);
    this.code = details?.code;
    this.googleStatus = details?.status;
    this.googleStatusText = details?.statusText;
    this.googleData = details?.data;
  }

  static fromGoogleApiError(error: unknown): GoogleApiException {
    if (error instanceof GoogleApiException) {
      return error;
    }

    const apiError = error as {
      message?: string;
      code?: string;
      response?: {
        status?: number;
        statusText?: string;
        data?: {
          error?: string | { message?: string };
        };
      };
    };

    const message = apiError.message || 'Google API error occurred';
    const details: GoogleApiExceptionDetails = {
      code: apiError.code,
      status: apiError.response?.status,
      statusText: apiError.response?.statusText,
      data: apiError.response?.data,
    };

    return new GoogleApiException(message, details);
  }
}
