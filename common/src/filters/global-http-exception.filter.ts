import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ErrorResponse } from '@agentic-template/dto/src/error/interfaces/error-response.interface';

@Catch(HttpException)
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): Response {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorMessage = this.extractErrorMessage(exceptionResponse);
    const errorType = this.getErrorTypeName(status);
    const sanitizedPath = this.sanitizePath(request.url);

    this.logger.error(`HTTP Exception: ${errorMessage}`, {
      statusCode: status,
      path: sanitizedPath,
      method: request.method,
      error: errorType,
    });

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: errorMessage,
      error: errorType,
      timestamp: new Date().toISOString(),
      path: sanitizedPath,
    };

    return response.status(status).json(errorResponse);
  }

  private extractErrorMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
      return 'An error occurred';
    }

    const messageValue = this.getPropertySafely(exceptionResponse, 'message');
    if (Array.isArray(messageValue)) {
      return messageValue.join(', ');
    }

    if (typeof messageValue === 'string') {
      return messageValue;
    }

    const errorValue = this.getPropertySafely(exceptionResponse, 'error');
    if (typeof errorValue === 'string') {
      return errorValue;
    }

    return 'An error occurred';
  }

  private getPropertySafely(obj: object, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
  }

  private getErrorTypeName(status: number): string {
    const statusNames: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
      [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
    };

    return statusNames[status] || 'Error';
  }

  private sanitizePath(url: string): string {
    const urlWithoutQuery = url.split('?')[0];
    return urlWithoutQuery;
  }
}
