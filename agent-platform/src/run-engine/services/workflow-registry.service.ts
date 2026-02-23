import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { DependencyGraphService } from './dependency-graph.service';
import { ALL_WORKFLOWS } from '../workflow-definitions/all-workflows';

@Injectable()
export class WorkflowRegistryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowRegistryService.name);
  private readonly workflows = new Map<string, Map<string, WorkflowSpec>>();

  constructor(private readonly dependencyGraphService: DependencyGraphService) {}

  onModuleInit() {
    for (const workflow of ALL_WORKFLOWS) {
      this.register(workflow);
    }
    this.logger.log(`Registered ${ALL_WORKFLOWS.length} workflows`);
  }

  register(workflow: WorkflowSpec): void {
    const validation = this.dependencyGraphService.validateNoCycles(workflow.steps);
    if (!validation.valid) {
      throw new Error(`Workflow '${workflow.workflowName}' has invalid dependencies: ${validation.error}`);
    }

    let versions = this.workflows.get(workflow.workflowName);
    if (!versions) {
      versions = new Map<string, WorkflowSpec>();
      this.workflows.set(workflow.workflowName, versions);
    }

    versions.set(workflow.version, workflow);

    this.logger.log(`Registered workflow: ${workflow.workflowName} v${workflow.version} with ${workflow.steps.length} steps`);
  }

  getWorkflow(workflowName: string, version?: string): WorkflowSpec | undefined {
    const versions = this.workflows.get(workflowName);
    if (!versions) {
      return undefined;
    }

    if (version) {
      return versions.get(version);
    }

    const sortedVersions = Array.from(versions.keys()).sort().reverse();
    return sortedVersions.length > 0 ? versions.get(sortedVersions[0]) : undefined;
  }

  listWorkflows(): Array<{ name: string; version: string; stepCount: number; description?: string }> {
    const result: Array<{ name: string; version: string; stepCount: number; description?: string }> = [];

    for (const [name, versions] of this.workflows) {
      for (const [version, workflow] of versions) {
        result.push({
          name,
          version,
          stepCount: workflow.steps.length,
          description: workflow.description,
        });
      }
    }

    return result;
  }

  getWorkflowVersions(workflowName: string): string[] {
    const versions = this.workflows.get(workflowName);
    return versions ? Array.from(versions.keys()) : [];
  }

  hasWorkflow(workflowName: string, version?: string): boolean {
    return this.getWorkflow(workflowName, version) !== undefined;
  }

  unregister(workflowName: string, version: string): boolean {
    const versions = this.workflows.get(workflowName);
    if (!versions) {
      return false;
    }

    const deleted = versions.delete(version);

    if (versions.size === 0) {
      this.workflows.delete(workflowName);
    }

    if (deleted) {
      this.logger.log(`Unregistered workflow: ${workflowName} v${version}`);
    }

    return deleted;
  }
}
