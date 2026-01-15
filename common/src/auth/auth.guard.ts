import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClerkClient } from '@clerk/backend';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthRequestDto } from '@agentic-template/dto/src/auth/auth-request.dto';
import type { Request as ExpressRequest } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private clerkClient;
  private readonly publishableKey: string;

  constructor(
    private reflector: Reflector,
    private readonly clerkSecretKey: string,
    publishableKey?: string,
  ) {
    this.clerkClient = createClerkClient({ secretKey: this.clerkSecretKey });
    this.publishableKey = publishableKey || '';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequestDto & ExpressRequest>();
    this.logger.debug(`AuthGuard.canActivate called for ${request.method} ${request.url}`);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      this.logger.debug('Endpoint is public, skipping authentication');
      return true;
    }

    try {
      const protocol = request.protocol || 'http';
      const host = request.get('host') || 'localhost';
      const url = `${protocol}://${host}${request.url}`;

      const headers = new Headers(request.headers as Record<string, string>);

      if (request.query && request.query.token && typeof request.query.token === 'string') {
        headers.set('authorization', `Bearer ${request.query.token}`);
      }

      const webRequest = new Request(url, {
        method: request.method,
        headers,
      });

      const requestState = await this.clerkClient.authenticateRequest(webRequest, {
        publishableKey: this.publishableKey,
      });

      const auth = requestState.toAuth();

      if (!auth || !auth.userId) {
        this.logger.error('Missing authentication token', { auth });
        throw new UnauthorizedException('Missing authentication token');
      }

      if (!auth.orgId) {
        this.logger.error('Missing organization ID', { auth });
        throw new UnauthorizedException('Organization ID is required');
      }

      request.auth = {
        userId: auth.userId,
        tenantId: auth.orgId,
        sessionClaims: auth.sessionClaims as Record<string, unknown>,
      };

      return true;
    } catch (error) {
      this.logger.error('Authentication failed', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
