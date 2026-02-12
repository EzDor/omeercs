import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger, HttpException } from '@nestjs/common';
import { Response, Request } from 'express';
import { ErrorResponse } from '@agentic-template/dto/src/error/interfaces/error-response.interface';
import * as fs from 'fs';

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

    const sanitizedPath = this.sanitizePath(request.url);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const baseResponse = typeof exceptionResponse === 'object' ? (exceptionResponse as Record<string, unknown>) : {};

      const errorResponse: ErrorResponse = {
        statusCode: status,
        message: (baseResponse.message as string) || exception.message || 'An error occurred',
        error: (baseResponse.error as string) || exception.name || 'Error',
        timestamp: new Date().toISOString(),
        path: sanitizedPath,
      };

      return response.status(status).json(errorResponse);
    }

    const errorMessage = this.extractErrorMessage(exception);
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    const logEntry = `=== UNHANDLED EXCEPTION ===\nPath: ${sanitizedPath}\nMethod: ${request.method}\nError: ${errorMessage}\nStack: ${errorStack}\n=== END EXCEPTION ===\n`;
    try {
      fs.appendFileSync('/tmp/unhandled-errors.log', logEntry);
    } catch (fsErr) {
      // ignore fs errors
    }
    console.error(logEntry);
    this.logger.error(`Unhandled exception: ${errorMessage}`, errorStack);

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
