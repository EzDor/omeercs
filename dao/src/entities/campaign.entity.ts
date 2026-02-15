import { Entity, PrimaryGeneratedColumn, Column, Index, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { CampaignConfig } from '@agentic-template/dto/src/campaign/campaign-config.interface';

export type CampaignStatusType = 'draft' | 'generating' | 'live' | 'failed' | 'archived';

@Entity('campaigns', { schema: 'app' })
@Index('IDX_campaigns_tenant_id', ['tenantId'])
@Index('IDX_campaigns_tenant_status', ['tenantId', 'status'])
@Index('IDX_campaigns_tenant_user', ['tenantId', 'userId'])
@Index('IDX_campaigns_deleted_at', ['deletedAt'])
export class Campaign extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'template_id', type: 'varchar', length: 100 })
  templateId: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: CampaignStatusType;

  @Column({ type: 'jsonb', nullable: true })
  config?: CampaignConfig;

  @Column({ name: 'bundle_url', type: 'varchar', length: 2048, nullable: true })
  bundleUrl?: string;

  @Column({ name: 'thumbnail_url', type: 'varchar', length: 2048, nullable: true })
  thumbnailUrl?: string;

  @Column({ name: 'latest_run_id', type: 'uuid', nullable: true })
  latestRunId?: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
