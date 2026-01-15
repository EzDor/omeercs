import { CreateDateColumn, UpdateDateColumn, Column, Index } from 'typeorm';

export abstract class BaseEntity {
  @Column({ name: 'tenant_id', type: 'varchar', length: 255, nullable: false })
  @Index()
  tenantId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
