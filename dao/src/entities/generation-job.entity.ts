import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Artifact } from './artifact.entity';

export type GenerationJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'timed_out';

@Entity('generation_jobs')
@Index(['tenantId', 'status'])
@Index(['providerId', 'status'])
export class GenerationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 255 })
  @Index()
  tenantId: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'run_step_id', type: 'uuid' })
  @Index()
  runStepId: string;

  @Column({ name: 'provider_id', type: 'varchar', length: 100 })
  providerId: string;

  @Column({ name: 'provider_job_id', type: 'varchar', length: 255 })
  providerJobId: string;

  @Column({ name: 'media_type', type: 'varchar', length: 50 })
  mediaType: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: GenerationJobStatus;

  @Column({ name: 'poll_interval_ms', type: 'integer' })
  pollIntervalMs: number;

  @Column({ name: 'timeout_ms', type: 'integer' })
  timeoutMs: number;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'input_params', type: 'jsonb' })
  inputParams: Record<string, unknown>;

  @Column({ name: 'result_uri', type: 'varchar', length: 2048, nullable: true })
  resultUri?: string;

  @Column({ name: 'artifact_id', type: 'uuid', nullable: true })
  artifactId?: string;

  @ManyToOne(() => Artifact, { nullable: true })
  @JoinColumn({ name: 'artifact_id' })
  artifact?: Artifact;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 10, scale: 4, nullable: true })
  costUsd?: number;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
