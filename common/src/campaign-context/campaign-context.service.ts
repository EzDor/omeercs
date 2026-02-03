import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { Run, type RunTriggerType } from '@agentic-template/dao/src/entities/run.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { RunStep } from '@agentic-template/dao/src/entities/run-step.entity';
import { ReferenceTypeRegistryService } from './reference-type-registry.service';
import type {
  CampaignContext,
  CreateContextParams,
  AttachStepResultParams,
  StoreInputHashParams,
  StoreQualityCheckParams,
  ArtifactMap,
} from '@agentic-template/dto/src/campaign-context/campaign-context.interface';
import type { ArtifactData } from '@agentic-template/dto/src/campaign-context/artifact-data.interface';
import type { ArtifactReferences } from '@agentic-template/dto/src/campaign-context/artifact-references.interface';
import type { ComputedData } from '@agentic-template/dto/src/campaign-context/computed-data.interface';
import { ContextErrorCodes, type ContextOperationResult } from '@agentic-template/dto/src/campaign-context/context-error.interface';
import type { TriggerType } from '@agentic-template/dto/src/campaign-context/trigger-info.interface';
import { randomUUID } from 'crypto';

const MAX_ARTIFACTS = 50;

@Injectable()
export class CampaignContextService {
  private readonly logger = new Logger(CampaignContextService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(Artifact)
    private readonly artifactRepository: Repository<Artifact>,
    @InjectRepository(RunStep)
    private readonly runStepRepository: Repository<RunStep>,
    private readonly referenceTypeRegistry: ReferenceTypeRegistryService,
  ) {}

  private mapTriggerType(runTriggerType: RunTriggerType): TriggerType {
    const mapping: Record<RunTriggerType, TriggerType> = {
      initial: 'api',
      update: 'continuation',
    };
    return mapping[runTriggerType] ?? 'api';
  }

  private isValidUri(uri: string): boolean {
    return /^(s3|https?|file|gs):\/\/.+/.test(uri);
  }

  private isValidHash(hash: string): boolean {
    return /^[a-z0-9]+:[a-f0-9]{16,}$/i.test(hash);
  }

  create(params: CreateContextParams): CampaignContext {
    const context: CampaignContext = {
      campaignId: params.campaignId,
      runId: params.runId,
      workflowName: params.workflowName,
      trigger: params.trigger,
      refs: {} as ArtifactReferences,
      artifacts: {} as ArtifactMap,
    };

    this.logger.debug(`Created context for run ${params.runId}`);
    return context;
  }

  async loadFromRun(baseRunId: string, tenantId: string): Promise<ContextOperationResult<CampaignContext>> {
    try {
      const baseRun = await this.runRepository.findOne({
        where: { id: baseRunId },
      });

      if (!baseRun) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.BASE_RUN_NOT_FOUND,
            message: `Base run not found: ${baseRunId}`,
            details: { baseRunId },
          },
        };
      }

      if (baseRun.tenantId !== tenantId) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.UNAUTHORIZED,
            message: `Unauthorized access to run: ${baseRunId}`,
            details: { baseRunId, requestedTenantId: tenantId },
          },
        };
      }

      if (baseRun.status !== 'completed') {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.INCOMPLETE_BASE_RUN,
            message: `Base run is not completed: ${baseRunId} (status: ${baseRun.status})`,
            details: { baseRunId, status: baseRun.status },
          },
        };
      }

      const artifacts = await this.artifactRepository.find({
        where: { runId: baseRunId, tenantId },
      });

      const runSteps = await this.runStepRepository.find({
        where: { runId: baseRunId },
      });

      const stepIdBySkillId = new Map<string, string>();
      const inputHashesByStep: Record<string, string> = {};
      for (const step of runSteps) {
        stepIdBySkillId.set(step.skillId, step.stepId);
        if (step.inputHash) {
          inputHashesByStep[step.stepId] = step.inputHash;
        }
      }

      const artifactMap: ArtifactMap = {};
      const refs: ArtifactReferences = {} as ArtifactReferences;

      for (const artifact of artifacts) {
        const artifactData: ArtifactData = {
          type: artifact.type,
          uri: artifact.uri,
          hash: artifact.contentHash,
          metadata: artifact.metadata,
          createdAt: artifact.createdAt.toISOString(),
          stepId: stepIdBySkillId.get(artifact.skillId) ?? artifact.skillId,
        };

        artifactMap[artifact.id] = artifactData;

        if (this.referenceTypeRegistry.isValidType(artifact.type)) {
          const refName = this.referenceTypeRegistry.getRefName(artifact.type);
          refs[refName] = artifact.id;
        }
      }

      const context: CampaignContext = {
        campaignId: (baseRun.triggerPayload?.campaignId as string) ?? '',
        runId: baseRunId,
        workflowName: baseRun.workflowName,
        trigger: {
          type: this.mapTriggerType(baseRun.triggerType),
          timestamp: baseRun.createdAt.toISOString(),
          payload: baseRun.triggerPayload,
        },
        refs,
        artifacts: artifactMap,
        computed: {
          inputHashesByStep,
          qualityChecks: [],
        },
      };

      this.logger.debug(`Loaded context from run ${baseRunId} with ${artifacts.length} artifacts`);
      return { ok: true, data: context };
    } catch (error) {
      this.logger.error(`Failed to load context from run ${baseRunId}: ${String(error)}`);
      return {
        ok: false,
        error: {
          code: ContextErrorCodes.DATABASE_ERROR,
          message: `Failed to load context: ${String(error)}`,
          details: { baseRunId },
        },
      };
    }
  }

  attachStepResult(context: CampaignContext, params: AttachStepResultParams): ContextOperationResult<CampaignContext> {
    const currentArtifactCount = Object.keys(context.artifacts).length;
    const newArtifactCount = params.artifacts.length;

    if (currentArtifactCount + newArtifactCount > MAX_ARTIFACTS) {
      return {
        ok: false,
        error: {
          code: ContextErrorCodes.CONTEXT_CAPACITY_EXCEEDED,
          message: `Cannot add ${newArtifactCount} artifacts: would exceed capacity of ${MAX_ARTIFACTS} (current: ${currentArtifactCount})`,
          details: { currentCount: currentArtifactCount, newCount: newArtifactCount, maxCapacity: MAX_ARTIFACTS },
        },
      };
    }

    for (const artifact of params.artifacts) {
      if (!this.referenceTypeRegistry.isValidType(artifact.type)) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.INVALID_ARTIFACT_TYPE,
            message: `Invalid artifact type: ${artifact.type}`,
            details: { type: artifact.type, validTypes: this.referenceTypeRegistry.listTypes() },
          },
        };
      }

      if (!this.isValidUri(artifact.uri)) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.INVALID_ARTIFACT_URI,
            message: `Invalid artifact URI: ${artifact.uri}`,
            details: { uri: artifact.uri, expectedSchemes: ['s3', 'https', 'http', 'file', 'gs'] },
          },
        };
      }

      if (!this.isValidHash(artifact.hash)) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.INVALID_ARTIFACT_HASH,
            message: `Invalid artifact hash format: ${artifact.hash}`,
            details: { hash: artifact.hash, expectedFormat: 'algorithm:hexdigest (e.g., sha256:abc123...)' },
          },
        };
      }
    }

    const updatedArtifacts = { ...context.artifacts };
    const updatedRefs = { ...context.refs };

    for (const artifact of params.artifacts) {
      const artifactId = randomUUID();

      const artifactData: ArtifactData = {
        type: artifact.type,
        uri: artifact.uri,
        hash: artifact.hash,
        metadata: artifact.metadata,
        createdAt: new Date().toISOString(),
        stepId: params.stepId,
      };

      updatedArtifacts[artifactId] = artifactData;

      const refName = this.referenceTypeRegistry.getRefName(artifact.type);
      updatedRefs[refName] = artifactId;
    }

    const updatedContext: CampaignContext = {
      ...context,
      artifacts: updatedArtifacts,
      refs: updatedRefs as ArtifactReferences,
    };

    this.logger.debug(`Attached ${params.artifacts.length} artifacts from step ${params.stepId} to context`);
    return { ok: true, data: updatedContext };
  }

  storeInputHash(context: CampaignContext, params: StoreInputHashParams): CampaignContext {
    const computed: ComputedData = context.computed ?? {
      inputHashesByStep: {},
      qualityChecks: [],
    };

    return {
      ...context,
      computed: {
        ...computed,
        inputHashesByStep: {
          ...computed.inputHashesByStep,
          [params.stepId]: params.inputHash,
        },
      },
    };
  }

  storeQualityCheck(context: CampaignContext, params: StoreQualityCheckParams): CampaignContext {
    const computed: ComputedData = context.computed ?? {
      inputHashesByStep: {},
      qualityChecks: [],
    };

    return {
      ...context,
      computed: {
        ...computed,
        qualityChecks: [
          ...computed.qualityChecks,
          {
            artifactId: params.artifactId,
            checkType: params.checkType,
            status: params.status,
            message: params.message,
            timestamp: new Date().toISOString(),
            details: params.details,
          },
        ],
      },
    };
  }

  async persist(context: CampaignContext, tenantId: string, queryRunner?: QueryRunner): Promise<ContextOperationResult<void>> {
    try {
      const repo = queryRunner ? queryRunner.manager.getRepository(Run) : this.runRepository;

      const result = await repo
        .createQueryBuilder()
        .update(Run)
        .set({ context: () => `:context` })
        .setParameter('context', JSON.stringify(context))
        .where('id = :id AND tenant_id = :tenantId', {
          id: context.runId,
          tenantId,
        })
        .execute();

      if (result.affected === 0) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.UNAUTHORIZED,
            message: `Run not found or unauthorized: ${context.runId}`,
            details: { runId: context.runId },
          },
        };
      }

      this.logger.debug(`Persisted context for run ${context.runId}`);
      return { ok: true, data: undefined };
    } catch (error) {
      this.logger.error(`Failed to persist context: ${String(error)}`);
      return {
        ok: false,
        error: {
          code: ContextErrorCodes.DATABASE_ERROR,
          message: `Failed to persist context: ${String(error)}`,
          details: { runId: context.runId },
        },
      };
    }
  }
}
