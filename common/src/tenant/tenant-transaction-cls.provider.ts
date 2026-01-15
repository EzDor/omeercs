import { Module, Global, Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TenantClsService } from './tenant-cls.service';

export const TX_MANAGER_CLS = Symbol('TX_MANAGER_CLS');
export const QUERY_RUNNER_CLS = Symbol('QUERY_RUNNER_CLS');

@Injectable()
export class TenantTransactionClsProvider implements OnModuleDestroy {
  private readonly logger = new Logger(TenantTransactionClsProvider.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantCls: TenantClsService,
  ) {}

  private getQr(): QueryRunner | null {
    return this.tenantCls.get<QueryRunner>(QUERY_RUNNER_CLS) || null;
  }

  private setQr(qr: QueryRunner): void {
    this.tenantCls.set(QUERY_RUNNER_CLS, qr);
  }

  private isCommitted(): boolean {
    return this.tenantCls.get<boolean>('TX_COMMITTED') || false;
  }

  private setCommitted(value: boolean): void {
    this.tenantCls.set('TX_COMMITTED', value);
  }

  async getQueryRunner(): Promise<QueryRunner> {
    this.logger.debug('getQueryRunner called');
    const existing = this.getQr();
    if (existing) {
      this.logger.debug('Returning existing QueryRunner');
      return existing;
    }

    this.logger.debug('Getting tenant ID from CLS');
    const tenantId = this.tenantCls.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID not found in CLS context. Ensure TenantContextInterceptor is applied.');
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    this.logger.debug(`Setting tenant context in database ${tenantId}`);
    await qr.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    this.logger.debug('Tenant context set successfully');

    this.setQr(qr);
    return qr;
  }

  async getManager(): Promise<EntityManager> {
    const qr = await this.getQueryRunner();
    return qr.manager;
  }

  async commitEarly() {
    const qr = this.getQr();
    if (!qr) return;
    await qr.commitTransaction();
    this.setCommitted(true);
  }

  async commit() {
    const qr = this.getQr();
    if (!qr || this.isCommitted()) return;
    try {
      await qr.commitTransaction();
      this.setCommitted(true);
    } finally {
      await qr.release();
      this.logger.debug('QueryRunner released after commit');
    }
  }

  async rollback() {
    const qr = this.getQr();
    if (!qr || this.isCommitted()) return;
    try {
      await qr.rollbackTransaction();
      this.setCommitted(true);
    } finally {
      await qr.release();
      this.logger.debug('QueryRunner released after rollback');
    }
  }

  async onModuleDestroy() {
    try {
      const qr = this.getQr();
      if (!qr) return;

      if (!this.isCommitted()) {
        await qr.rollbackTransaction();
      }

      await qr.release();
    } catch (error) {
      console.error('Error during transaction cleanup:', error);
    }
  }
}

@Global()
@Module({
  providers: [TenantTransactionClsProvider],
  exports: [TenantTransactionClsProvider],
})
export class TenantTransactionClsModule {}
