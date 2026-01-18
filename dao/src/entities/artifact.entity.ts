import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Artifact entity for persisting skill execution artifacts
 * Based on data-model.md specification
 */
@Entity('artifacts')
@Index(['tenantId', 'runId'])
export class Artifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 255 })
  @Index()
  tenantId: string;

  @Column({ name: 'run_id', type: 'uuid' })
  @Index()
  runId: string;

  @Column({ name: 'skill_id', type: 'varchar', length: 64 })
  @Index()
  skillId: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 2048 })
  uri: string;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
