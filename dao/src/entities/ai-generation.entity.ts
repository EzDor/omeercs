import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { GenerationType, GenerationStatus } from '@agentic-template/dto/src/intelligence/intelligence-enums';

@Entity('ai_generations', { schema: 'app' })
@Index('IDX_ai_generations_tenant_campaign', ['tenantId', 'campaignId'])
@Index('IDX_ai_generations_tenant_type', ['tenantId', 'generationType'])
@Index('IDX_ai_generations_tenant_created', ['tenantId', 'createdAt'])
export class AiGeneration extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId?: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'generation_type', type: 'varchar', length: 30 })
  generationType: GenerationType;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: GenerationStatus;

  @Column({ type: 'boolean', default: false })
  accepted: boolean;

  @Column({ name: 'input_params', type: 'jsonb' })
  inputParams: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  error?: Record<string, unknown>;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ name: 'llm_model', type: 'varchar', length: 100, nullable: true })
  llmModel?: string;

  @Column({ type: 'integer', default: 1 })
  attempts: number;

  @ManyToOne('Campaign', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: unknown;
}
