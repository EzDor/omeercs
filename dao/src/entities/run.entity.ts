import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { RunStep } from './run-step.entity';

/**
 * Run status enum type
 */
export type RunStatusType = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Run trigger type enum
 */
export type RunTriggerType = 'initial' | 'update';

/**
 * Run error structure
 */
export interface RunErrorJson {
  code: string;
  message: string;
  failedStepId?: string;
  timestamp: string;
}

/**
 * Run entity representing one execution instance of a workflow
 */
@Entity('runs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'workflowName'])
export class Run extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_name', type: 'varchar', length: 255 })
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

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt?: Date;

  // createdAt and updatedAt are inherited from BaseEntity

  // Relations will be added after RunStep entity is created
  @OneToMany('RunStep', 'run')
  steps?: RunStep[];
}
