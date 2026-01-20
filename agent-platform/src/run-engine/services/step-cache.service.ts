import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StepCache, CacheScopeType } from '@agentic-template/dao/src/entities/step-cache.entity';

export interface CacheSetParams {
  cacheKey: string;
  workflowName: string;
  stepId: string;
  inputHash: string;
  artifactIds: string[];
  scope: CacheScopeType;
}

@Injectable()
export class StepCacheService {
  private readonly logger = new Logger(StepCacheService.name);

  constructor(
    @InjectRepository(StepCache)
    private readonly cacheRepository: Repository<StepCache>,
  ) {}

  async get(cacheKey: string): Promise<string[] | null> {
    const entry = await this.cacheRepository.findOne({
      where: { cacheKey },
    });

    if (entry) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      return entry.artifactIds;
    }

    this.logger.debug(`Cache miss for key: ${cacheKey}`);
    return null;
  }

  async set(params: CacheSetParams): Promise<void> {
    const { cacheKey, workflowName, stepId, inputHash, artifactIds, scope } = params;

    const existing = await this.cacheRepository.findOne({ where: { cacheKey } });

    if (existing) {
      existing.artifactIds = artifactIds;
      existing.scope = scope;
      await this.cacheRepository.save(existing);
      this.logger.debug(`Cache updated for key: ${cacheKey}`);
    } else {
      const entry = this.cacheRepository.create({
        cacheKey,
        workflowName,
        stepId,
        inputHash,
        artifactIds,
        scope,
      });
      await this.cacheRepository.save(entry);
      this.logger.debug(`Cache entry created for key: ${cacheKey}`);
    }
  }

  async invalidateStep(workflowName: string, stepId: string): Promise<number> {
    const result = await this.cacheRepository.delete({ workflowName, stepId });
    const count = result.affected || 0;
    this.logger.debug(`Invalidated ${count} cache entries for ${workflowName}:${stepId}`);
    return count;
  }

  async invalidateWorkflow(workflowName: string): Promise<number> {
    const result = await this.cacheRepository.delete({ workflowName });
    const count = result.affected || 0;
    this.logger.debug(`Invalidated ${count} cache entries for workflow ${workflowName}`);
    return count;
  }
}
