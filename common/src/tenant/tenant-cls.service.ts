import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager } from 'typeorm';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_ENTITY_MANAGER } from './tenant-cls.constants';

@Injectable()
export class TenantClsService {
  constructor(
    private readonly cls: ClsService,
    private readonly dataSource: DataSource,
  ) {}

  setTenantId(tenantId: string): void {
    this.cls.set(CLS_TENANT_ID, tenantId);
  }

  getTenantId(): string | undefined {
    return this.cls.get(CLS_TENANT_ID);
  }

  setUserId(userId: string): void {
    this.cls.set(CLS_USER_ID, userId);
  }

  getUserId(): string | undefined {
    return this.cls.get(CLS_USER_ID);
  }

  setEntityManager(manager: EntityManager): void {
    this.cls.set(CLS_ENTITY_MANAGER, manager);
  }

  getEntityManager(): EntityManager | undefined {
    return this.cls.get(CLS_ENTITY_MANAGER);
  }

  get<T>(key: string | symbol): T | undefined {
    return this.cls.get(key);
  }

  set<T>(key: string | symbol, value: T): void {
    this.cls.set(key, value);
  }

  async runWithTenant<T>(tenantId: string, userId: string | undefined, callback: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.setTenantId(tenantId);
      if (userId) {
        this.setUserId(userId);
      }
      return callback();
    });
  }

  async runWithTenantTransaction<T>(tenantId: string, userId: string | undefined, callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      return this.cls.run(() => {
        this.setTenantId(tenantId);
        if (userId) {
          this.setUserId(userId);
        }
        this.setEntityManager(manager);
        return callback(manager);
      });
    });
  }
}
