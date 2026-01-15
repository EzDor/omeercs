import AppDataSource from '@agentic-template/dao/src/datasource';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { TenantTransactionClsProvider } from '@agentic-template/common/src/tenant/tenant-transaction-cls.provider';
import { TenantContextInterceptor } from '@agentic-template/common/src/tenant/tenant-context.interceptor';
import { createBullConfig } from '@agentic-template/common/src/queues/bull.config';
import { ConfigUtil } from '@agentic-template/common/src/config/config-util';
import { AuthModule } from './auth/auth.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const { entities, migrations, migrationsTableName, synchronize, logging } = AppDataSource.options;
        return {
          type: 'postgres',
          url: ConfigUtil.getDatabaseUrl(configService),
          schema: configService.get<string>('APP_SCHEMA', 'app'),
          entities,
          migrations,
          migrationsTableName,
          synchronize,
          logging,
          migrationsRun: false,
          ssl: ConfigUtil.getDatabaseSslConfig(configService),
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createBullConfig,
    }),
    TenantClsModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useFactory: (tenantCls: TenantClsService, txProvider: TenantTransactionClsProvider, reflector: Reflector) => {
        return new TenantContextInterceptor(tenantCls, txProvider, reflector);
      },
      inject: [TenantClsService, TenantTransactionClsProvider, Reflector],
    },
  ],
  exports: [],
})
export class CoreModule {}
