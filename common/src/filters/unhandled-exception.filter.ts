import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ErrorResponse } from '@agentic-template/dto/src/error/interfaces/error-response.interface';

@Catch()
export class UnhandledExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnhandledExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void | Response {
    if (host.getType() !== 'http') {
      const errorMessage = this.extractErrorMessage(exception);
      this.logger.error('Unhandled exception in non-HTTP context', {
        error: errorMessage,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorMessage = this.extractErrorMessage(exception);
    const errorStack = exception instanceof Error ? exception.stack : undefined;
    const sanitizedPath = this.sanitizePath(request.url);

    this.logger.error('Unhandled exception occurred', {
      error: errorMessage,
      stack: errorStack,
      path: sanitizedPath,
      method: request.method,
    });

    const errorResponse: ErrorResponse = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path: sanitizedPath,
    };

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
  }

  private extractErrorMessage(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }
    return String(exception);
  }

  private sanitizePath(url: string): string {
    const urlWithoutQuery = url.split('?')[0];
    return urlWithoutQuery;
  }
}
