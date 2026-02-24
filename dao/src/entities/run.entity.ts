import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { CampaignContext } from '@agentic-template/dto/src/campaign-context/campaign-context.interface';

export type RunStatusType = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RunTriggerType = 'initial' | 'update';

export interface RunErrorJson {
  code: string;
  message: string;
  failedStepId?: string;
  timestamp: string;
}

@Entity('runs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'workflowName'])
export class Run extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_name', type: 'varchar', length: 255, update: false })
  workflowName: string;

  @Column({ name: 'workflow_version', type: 'varchar', length: 50 })
  workflowVersion: string;

  @Column({ name: 'trigger_type', type: 'varchar', length: 20 })
  triggerType: RunTriggerType;

  @Column({ name: 'trigger_payload', type: 'jsonb', nullable: true })
  triggerPayload?: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status: RunStatusType;

  @Column({ name: 'base_run_id', type: 'uuid', nullable: true })
  @Index({ where: '"base_run_id" IS NOT NULL' })
  baseRunId?: string;

  @Column({ type: 'jsonb', nullable: true })
  error?: RunErrorJson;

  @Column({ type: 'jsonb', nullable: true })
  context?: CampaignContext;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt?: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;
}
