import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { WorkflowYaml, WorkflowStepYaml, WorkflowIndexYaml, WorkflowIndexEntry } from '../interfaces/workflow-yaml.interface';
import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import type { StepSpec, CachePolicy, RetryPolicy } from '../interfaces/step-spec.interface';
import { WorkflowRegistryService } from './workflow-registry.service';
import { InputSelectorInterpreterService } from './input-selector-interpreter.service';
import { SkillCatalogService } from '../../skills/services/skill-catalog.service';
import * as workflowYamlSchema from '../schemas/workflow-yaml.schema.json';
import * as workflowIndexSchema from '../schemas/workflow-index.schema.json';

export interface WorkflowLoadError {
  workflowName: string;
  message: string;
  field?: string;
}

export interface WorkflowLoadResult {
  loaded: number;
  errors: WorkflowLoadError[];
}

@Injectable()
export class WorkflowYamlLoaderService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowYamlLoaderService.name);
  private readonly workflowsPath: string;
  private readonly ajv: Ajv;
  private readonly loadErrors: WorkflowLoadError[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly workflowRegistryService: WorkflowRegistryService,
    private readonly inputSelectorInterpreterService: InputSelectorInterpreterService,
    private readonly skillCatalogService: SkillCatalogService,
  ) {
    this.workflowsPath = this.resolveWorkflowsPath();
    this.ajv = this.initializeAjv();
  }

  private resolveWorkflowsPath(): string {
    return this.configService.get<string>('WORKFLOWS_PATH') || path.join(process.cwd(), 'workflows');
  }

  private initializeAjv(): Ajv {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
    });
    addFormats(ajv);
    return ajv;
  }

  onModuleInit(): void {
    const result = this.loadAllWorkflows();
    this.logger.log(`Workflow loading complete: ${result.loaded} loaded, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        this.logger.error(`Failed to load workflow '${error.workflowName}': ${error.message}`);
      }
    }
  }

  loadAllWorkflows(): WorkflowLoadResult {
    this.loadErrors.length = 0;

    const index = this.loadIndex();
    if (!index) {
      return { loaded: 0, errors: this.loadErrors };
    }

    this.logger.log(`Loading workflows from index v${index.version} (updated: ${index.updated_at})`);

    let loadedCount = 0;
    for (const entry of index.workflows) {
      if (entry.status !== 'active') {
        this.logger.debug(`Skipping non-active workflow: ${entry.workflow_name} (${entry.status})`);
        continue;
      }

      const success = this.loadAndRegisterWorkflow(entry);
      if (success) {
        loadedCount++;
      }
    }

    return { loaded: loadedCount, errors: [...this.loadErrors] };
  }

  loadIndex(): WorkflowIndexYaml | null {
    const indexPath = path.join(this.workflowsPath, 'index.yaml');

    if (!fs.existsSync(indexPath)) {
      this.logger.warn(`Workflows index not found at ${indexPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const indexYaml = yaml.load(content) as WorkflowIndexYaml;

      const validation = this.validateAgainstSchema(indexYaml, workflowIndexSchema as Record<string, unknown>);
      if (!validation.valid) {
        for (const error of validation.errors) {
          this.loadErrors.push({
            workflowName: 'index',
            message: `${error.field}: ${error.message}`,
          });
        }
        return null;
      }

      return indexYaml;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load workflows index: ${message}`);
      this.loadErrors.push({ workflowName: 'index', message });
      return null;
    }
  }

  loadWorkflowFile(entry: WorkflowIndexEntry): WorkflowYaml | null {
    const filename = entry.file || `${entry.workflow_name}.v${this.extractMajorVersion(entry.version)}.yaml`;
    const filePath = path.join(this.workflowsPath, filename);

    if (!fs.existsSync(filePath)) {
      this.loadErrors.push({
        workflowName: entry.workflow_name,
        message: `Workflow file not found: ${filePath}`,
      });
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const workflowYaml = yaml.load(content) as WorkflowYaml;
      return workflowYaml;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loadErrors.push({ workflowName: entry.workflow_name, message });
      return null;
    }
  }

  private extractMajorVersion(version: string): string {
    const parsed = semver.parse(version);
    return parsed ? `${parsed.major}` : '1';
  }

  validateAgainstSchema(data: unknown, schema: Record<string, unknown>): { valid: boolean; errors: Array<{ field: string; message: string }> } {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors =
      validate.errors?.map((error) => {
        const missingProp = error.params && 'missingProperty' in error.params ? String(error.params.missingProperty) : '';
        return {
          field: error.instancePath || missingProp,
          message: error.message || 'Validation failed',
        };
      }) || [];

    return { valid: false, errors };
  }

  validateSkillReferences(workflowYaml: WorkflowYaml): Array<{ stepId: string; skillId: string }> {
    const invalidRefs: Array<{ stepId: string; skillId: string }> = [];

    for (const step of workflowYaml.steps) {
      if (!this.skillCatalogService.hasSkill(step.skill_id)) {
        invalidRefs.push({ stepId: step.step_id, skillId: step.skill_id });
      }
    }

    return invalidRefs;
  }

  compileToWorkflowSpec(workflowYaml: WorkflowYaml): WorkflowSpec {
    const steps: StepSpec[] = workflowYaml.steps.map((stepYaml) => this.compileStep(stepYaml));

    return {
      workflowName: workflowYaml.workflow_name,
      version: workflowYaml.version,
      description: workflowYaml.description,
      steps,
    };
  }

  private compileStep(stepYaml: WorkflowStepYaml): StepSpec {
    const inputSelector = this.inputSelectorInterpreterService.compile(stepYaml.input_selector);
    const cachePolicy = this.compileCachePolicy(stepYaml.cache_policy);
    const retryPolicy = this.compileRetryPolicy(stepYaml.retry_policy);

    return {
      stepId: stepYaml.step_id,
      skillId: stepYaml.skill_id,
      dependsOn: stepYaml.depends_on,
      inputSelector,
      cachePolicy,
      retryPolicy,
      description: stepYaml.description,
    };
  }

  private compileCachePolicy(yamlPolicy?: { enabled: boolean; scope: 'global' | 'run_only' }): CachePolicy {
    if (!yamlPolicy) {
      return { enabled: false, scope: 'run_only' };
    }
    return {
      enabled: yamlPolicy.enabled,
      scope: yamlPolicy.scope,
    };
  }

  private compileRetryPolicy(yamlPolicy?: { max_attempts: number; backoff_ms: number }): RetryPolicy {
    if (!yamlPolicy) {
      return { maxAttempts: 1, backoffMs: 1000 };
    }
    return {
      maxAttempts: yamlPolicy.max_attempts,
      backoffMs: yamlPolicy.backoff_ms,
    };
  }

  private loadAndRegisterWorkflow(entry: WorkflowIndexEntry): boolean {
    const workflowYaml = this.loadWorkflowFile(entry);
    if (!workflowYaml) {
      return false;
    }

    const schemaValidation = this.validateAgainstSchema(workflowYaml, workflowYamlSchema as Record<string, unknown>);
    if (!schemaValidation.valid) {
      for (const error of schemaValidation.errors) {
        this.loadErrors.push({
          workflowName: entry.workflow_name,
          message: `Schema validation failed: ${error.field} - ${error.message}`,
          field: error.field,
        });
      }
      return false;
    }

    const invalidSkillRefs = this.validateSkillReferences(workflowYaml);
    if (invalidSkillRefs.length > 0) {
      for (const ref of invalidSkillRefs) {
        this.loadErrors.push({
          workflowName: entry.workflow_name,
          message: `Unknown skill reference: ${ref.skillId} in step ${ref.stepId}`,
        });
      }
      return false;
    }

    try {
      const workflowSpec = this.compileToWorkflowSpec(workflowYaml);
      this.workflowRegistryService.register(workflowSpec);
      this.logger.log(`Registered workflow: ${entry.workflow_name} v${entry.version} with ${workflowYaml.steps.length} steps`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loadErrors.push({
        workflowName: entry.workflow_name,
        message: `Failed to compile/register workflow: ${message}`,
      });
      return false;
    }
  }

  getLoadErrors(): WorkflowLoadError[] {
    return [...this.loadErrors];
  }

  reloadWorkflows(): WorkflowLoadResult {
    return this.loadAllWorkflows();
  }
}
