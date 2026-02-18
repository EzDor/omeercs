import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('INTERNAL_API_KEY', '');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-internal-api-key'] as string;

    if (!providedKey || providedKey !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing internal API key');
    }

    return true;
  }
}
