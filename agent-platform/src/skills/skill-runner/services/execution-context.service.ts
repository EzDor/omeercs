import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import type { SkillDescriptor } from '@agentic-template/dto/src/skills/skill-descriptor.interface';
import { EnhancedSkillExecutionContext, SkillExecutionOptions } from '../interfaces/execution-context.interface';
import { SkillPolicy, DEFAULT_SKILL_POLICY } from '../interfaces/skill-policy.interface';
import { SecretsService } from './secrets.service';

/**
 * Service for creating execution contexts for skill handlers.
 */
@Injectable()
export class ExecutionContextService {
  private readonly logger = new Logger(ExecutionContextService.name);
  private readonly artifactBaseDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantClsService: TenantClsService,
    private readonly secretsService: SecretsService,
  ) {
    this.artifactBaseDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skill-artifacts';
  }

  /**
   * Create an enhanced execution context for a skill execution.
   *
   * @param descriptor The skill descriptor
   * @param workspaceDir The workspace directory for this execution
   * @param signal Optional AbortSignal for timeout/cancellation
   * @param options Optional execution options
   * @returns A fully populated EnhancedSkillExecutionContext
   */
  createContext(descriptor: SkillDescriptor, workspaceDir: string, signal?: AbortSignal, options?: SkillExecutionOptions): EnhancedSkillExecutionContext {
    const runId = randomUUID();
    const executionId = randomUUID();
    const tenantId = this.tenantClsService.getTenantId() || 'default';

    // Build policy from descriptor with defaults
    const policy = this.buildPolicy(descriptor, options);

    // Create scoped logger for this execution
    const scopedLogger = new Logger(`SkillRunner:${descriptor.skill_id}:${runId.substring(0, 8)}`);

    // Create secrets accessor - don't restrict based on allowed_hosts (network hostnames)
    // allowed_hosts is for network access control, not API provider filtering
    const secrets = this.secretsService.createAccessor(descriptor.skill_id);

    // Build artifact base URI for this run
    const artifactBaseUri = this.buildArtifactBaseUri(tenantId, runId);

    const context: EnhancedSkillExecutionContext = {
      // Basic context fields
      tenantId,
      executionId,
      skillId: descriptor.skill_id,
      provider: options?.provider,

      // Enhanced fields
      runId,
      workspaceDir,
      artifactBaseUri,
      logger: scopedLogger,
      secrets,
      policy,
      signal,
    };

    this.logger.debug(`Created execution context for ${descriptor.skill_id} [runId=${runId}, tenantId=${tenantId}]`);

    return context;
  }

  /**
   * Build the policy object from descriptor and options.
   */
  private buildPolicy(descriptor: SkillDescriptor, options?: SkillExecutionOptions): SkillPolicy {
    const descriptorPolicy = descriptor.policy;

    // Convert max_runtime_sec to timeout_ms
    const timeout_ms = options?.timeout_ms ?? (descriptorPolicy?.max_runtime_sec ? descriptorPolicy.max_runtime_sec * 1000 : DEFAULT_SKILL_POLICY.timeout_ms);

    return {
      timeout_ms,
      max_retries: DEFAULT_SKILL_POLICY.max_retries,
      allowed_providers: descriptorPolicy?.allowed_hosts,
      network_access: descriptorPolicy?.network !== 'none',
      filesystem_access: 'workspace',
    };
  }

  /**
   * Build the base URI for artifact storage.
   */
  private buildArtifactBaseUri(tenantId: string, runId: string): string {
    const artifactPath = path.join(this.artifactBaseDir, tenantId, runId);
    return `file://${artifactPath}/`;
  }
}
