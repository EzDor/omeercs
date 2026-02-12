import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Cache scope enum type
 */
export type CacheScopeType = 'global' | 'run_only';

/**
 * StepCache entity for mapping cache keys to artifact references
 */
@Entity('step_cache')
@Index(['workflowName', 'stepId', 'inputHash'])
export class StepCache extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cache_key', type: 'varchar', length: 512, unique: true })
  cacheKey: string;

  @Column({ name: 'workflow_name', type: 'varchar', length: 255 })
  workflowName: string;

  @Column({ name: 'step_id', type: 'varchar', length: 255 })
  stepId: string;

  @Column({ name: 'input_hash', type: 'varchar', length: 64 })
  inputHash: string;

  @Column({ name: 'artifact_ids', type: 'jsonb' })
  artifactIds: string[];

  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'global' })
  scope: CacheScopeType;

  // createdAt and updatedAt are inherited from BaseEntity
}
