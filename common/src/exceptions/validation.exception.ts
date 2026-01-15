import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: errors,
        error: 'Validation Error',
      },
      HttpStatus.BAD_REQUEST,
    );
    this.errors = errors;
  }
}
