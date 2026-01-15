import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { TenantClsService } from './tenant-cls.service';
import { TenantTransactionClsProvider } from './tenant-transaction-cls.provider';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(
    private readonly tenantCls: TenantClsService,
    private readonly txProvider: TenantTransactionClsProvider,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { method: string; url: string }>();
    this.logger.debug(`TenantContextInterceptor.intercept called for ${request.method} ${request.url}`);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      this.logger.debug('Endpoint is public, skipping tenant context setup');
      return next.handle();
    }

    if (!request.auth?.tenantId) {
      this.logger.error(`Tenant ID not found in request.auth for ${request.method} ${request.url}`);
      throw new UnauthorizedException('Tenant context is required');
    }

    this.tenantCls.setTenantId(request.auth.tenantId);
    this.tenantCls.setUserId(request.auth.userId);

    this.logger.debug(`Tenant context set: tenantId=${request.auth.tenantId}, userId=${request.auth.userId}`);

    let hasError = false;

    return next.handle().pipe(
      catchError((error) => {
        hasError = true;
        return from(
          this.txProvider
            .rollback()
            .then(() => {
              this.logger.debug('Transaction rolled back due to error');
            })
            .catch((rollbackError) => {
              this.logger.error('Failed to rollback transaction', rollbackError instanceof Error ? rollbackError.stack : String(rollbackError));
            })
            .then(() => {
              throw error;
            }),
        );
      }),
      finalize(() => {
        if (!hasError) {
          void this.txProvider
            .commit()
            .then(() => {
              this.logger.debug('Transaction committed successfully');
            })
            .catch((error) => {
              this.logger.error('Failed to commit transaction', error instanceof Error ? error.stack : String(error));
            });
        }
      }),
    );
  }
}
