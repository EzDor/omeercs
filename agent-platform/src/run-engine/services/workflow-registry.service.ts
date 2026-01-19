import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { DependencyGraphService } from './dependency-graph.service';

/**
 * Service for managing workflow definitions.
 * Maintains an in-memory registry of workflows with validation on registration.
 */
@Injectable()
export class WorkflowRegistryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowRegistryService.name);
  private readonly workflows = new Map<string, Map<string, WorkflowSpec>>();

  constructor(private readonly dependencyGraphService: DependencyGraphService) {}

  onModuleInit() {
    this.logger.log('WorkflowRegistryService initialized');
  }

  /**
   * Register a workflow definition.
   * Validates the workflow DAG before registration.
   *
   * @param workflow The workflow specification to register
   * @throws Error if workflow has cycles or invalid dependencies
   */
  register(workflow: WorkflowSpec): void {
    // Validate DAG (no cycles)
    const validation = this.dependencyGraphService.validateNoCycles(workflow.steps);
    if (!validation.valid) {
      throw new Error(`Workflow '${workflow.workflowName}' has invalid dependencies: ${validation.error}`);
    }

    // Get or create version map for this workflow
    let versions = this.workflows.get(workflow.workflowName);
    if (!versions) {
      versions = new Map<string, WorkflowSpec>();
      this.workflows.set(workflow.workflowName, versions);
    }

    // Register the version
    versions.set(workflow.version, workflow);

    this.logger.log(`Registered workflow: ${workflow.workflowName} v${workflow.version} with ${workflow.steps.length} steps`);
  }

  /**
   * Get a workflow by name and optionally version.
   * If version is not specified, returns the latest version.
   *
   * @param workflowName Name of the workflow
   * @param version Optional specific version
   * @returns The workflow specification or undefined if not found
   */
  getWorkflow(workflowName: string, version?: string): WorkflowSpec | undefined {
    const versions = this.workflows.get(workflowName);
    if (!versions) {
      return undefined;
    }

    if (version) {
      return versions.get(version);
    }

    // Return latest version (lexicographically highest)
    const sortedVersions = Array.from(versions.keys()).sort().reverse();
    return sortedVersions.length > 0 ? versions.get(sortedVersions[0]) : undefined;
  }

  /**
   * List all registered workflows.
   *
   * @returns Array of workflow summaries
   */
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

  /**
   * Get all versions of a workflow.
   *
   * @param workflowName Name of the workflow
   * @returns Array of versions or empty array if workflow not found
   */
  getWorkflowVersions(workflowName: string): string[] {
    const versions = this.workflows.get(workflowName);
    return versions ? Array.from(versions.keys()) : [];
  }

  /**
   * Check if a workflow exists.
   *
   * @param workflowName Name of the workflow
   * @param version Optional specific version
   * @returns true if workflow exists
   */
  hasWorkflow(workflowName: string, version?: string): boolean {
    return this.getWorkflow(workflowName, version) !== undefined;
  }

  /**
   * Unregister a workflow version.
   *
   * @param workflowName Name of the workflow
   * @param version Version to unregister
   * @returns true if workflow was unregistered
   */
  unregister(workflowName: string, version: string): boolean {
    const versions = this.workflows.get(workflowName);
    if (!versions) {
      return false;
    }

    const deleted = versions.delete(version);

    // Clean up empty version maps
    if (versions.size === 0) {
      this.workflows.delete(workflowName);
    }

    if (deleted) {
      this.logger.log(`Unregistered workflow: ${workflowName} v${version}`);
    }

    return deleted;
  }
}
