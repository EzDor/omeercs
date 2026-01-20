import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Run } from './run.entity';

/**
 * Step status enum type
 */
export type StepStatusType = 'pending' | 'running' | 'skipped' | 'completed' | 'failed';

/**
 * Step error structure
 */
export interface StepErrorJson {
  code: string;
  message: string;
  attempt: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * RunStep entity representing one step's execution within a run
 */
@Entity('run_steps')
@Index(['runId', 'status'])
@Index(['tenantId', 'runId'])
@Index(['stepId', 'inputHash'])
@Unique(['runId', 'stepId'])
export class RunStep extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'step_id', type: 'varchar', length: 255 })
  stepId: string;

  @Column({ name: 'skill_id', type: 'varchar', length: 255 })
  skillId: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: StepStatusType;

  @Column({ name: 'input_hash', type: 'varchar', length: 64 })
  inputHash: string;

  @Column({ type: 'integer', default: 1 })
  attempt: number;

  @Column({ name: 'output_artifact_ids', type: 'jsonb', nullable: true })
  outputArtifactIds?: string[];

  @Column({ type: 'jsonb', nullable: true })
  error?: StepErrorJson;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt?: Date;

  @Column({ name: 'ended_at', type: 'timestamp with time zone', nullable: true })
  endedAt?: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ name: 'cache_hit', type: 'boolean', default: false })
  cacheHit: boolean;

  // createdAt and updatedAt are inherited from BaseEntity

  @ManyToOne('Run', 'steps', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run?: Run;
}
