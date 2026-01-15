import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalServiceException extends HttpException {
  public readonly serviceName: string;

  constructor(serviceName: string, message?: string) {
    const errorMessage = message || `External service ${serviceName} is unavailable`;
    super(errorMessage, HttpStatus.SERVICE_UNAVAILABLE);
    this.serviceName = serviceName;
  }
}
