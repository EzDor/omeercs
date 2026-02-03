import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
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

    const artifactMap: ArtifactMap = {};
    const refs: ArtifactReferences = {} as ArtifactReferences;

    for (const artifact of artifacts) {
      const artifactData: ArtifactData = {
        type: artifact.type,
        uri: artifact.uri,
        hash: artifact.contentHash,
        metadata: artifact.metadata,
        createdAt: artifact.createdAt.toISOString(),
        stepId: artifact.skillId,
      };

      artifactMap[artifact.id] = artifactData;

      if (this.referenceTypeRegistry.isValidType(artifact.type)) {
        const refName = this.referenceTypeRegistry.getRefName(artifact.type);
        refs[refName] = artifact.id;
      }
    }

    const runSteps = await this.runStepRepository.find({
      where: { runId: baseRunId },
    });

    const inputHashesByStep: Record<string, string> = {};
    for (const step of runSteps) {
      if (step.inputHash) {
        inputHashesByStep[step.stepId] = step.inputHash;
      }
    }

    const context: CampaignContext = {
      campaignId: (baseRun.triggerPayload?.campaignId as string) ?? '',
      runId: baseRunId,
      workflowName: baseRun.workflowName,
      trigger: {
        type: baseRun.triggerType === 'initial' ? 'api' : 'api',
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

    const updatedArtifacts = { ...context.artifacts };
    const updatedRefs = { ...context.refs };

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

      const artifactId = randomUUID();

      if (updatedArtifacts[artifactId]) {
        return {
          ok: false,
          error: {
            code: ContextErrorCodes.DUPLICATE_ARTIFACT_ID,
            message: `Artifact ID collision detected: ${artifactId}`,
            details: { artifactId },
          },
        };
      }

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

  async persist(context: CampaignContext): Promise<void> {
    await this.runRepository
      .createQueryBuilder()
      .update(Run)
      .set({ context: () => `:context` })
      .setParameter('context', JSON.stringify(context))
      .where('id = :id', { id: context.runId })
      .execute();
    this.logger.debug(`Persisted context for run ${context.runId}`);
  }
}
