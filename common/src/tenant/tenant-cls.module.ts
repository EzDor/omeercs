import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantClsService } from './tenant-cls.service';
import { TenantTransactionClsModule } from './tenant-transaction-cls.provider';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
    TenantTransactionClsModule,
  ],
  providers: [TenantClsService],
  exports: [TenantClsService, TenantTransactionClsModule],
})
export class TenantClsModule {}
