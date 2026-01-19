import { Injectable, Logger } from '@nestjs/common';
import { DirectedAcyclicGraph } from 'typescript-graph';
import { StepSpec } from '../interfaces/step-spec.interface';

/**
 * Service for performing DAG operations on workflow steps.
 * Handles topological sorting and computing downstream dependency closures.
 */
@Injectable()
export class DependencyGraphService {
  private readonly logger = new Logger(DependencyGraphService.name);

  /**
   * Perform topological sort on workflow steps.
   * Returns steps in execution order respecting dependencies.
   *
   * @param steps Array of step specifications
   * @returns Steps sorted in topological order
   * @throws Error if the graph contains cycles
   */
  topologicalSort(steps: StepSpec[]): StepSpec[] {
    const graph = new DirectedAcyclicGraph<StepSpec>((step) => step.stepId);
    const nodeMap = new Map<string, StepSpec>();

    // First pass: insert all nodes
    for (const step of steps) {
      graph.insert(step);
      nodeMap.set(step.stepId, step);
    }

    // Second pass: add edges (dependency → dependent)
    for (const step of steps) {
      for (const depId of step.dependsOn) {
        const dependency = nodeMap.get(depId);
        if (!dependency) {
          throw new Error(`Step '${step.stepId}' depends on unknown step '${depId}'`);
        }
        // Edge from dependency to step (dependency must complete before step)
        // Using identity function since nodes are already inserted
        graph.addEdge(dependency.stepId, step.stepId);
      }
    }

    return graph.topologicallySortedNodes();
  }

  /**
   * Compute the downstream closure of changed steps.
   * Returns all steps that need to be re-executed when the given steps change.
   *
   * @param allSteps All workflow steps
   * @param changedStepIds IDs of steps that have changed
   * @returns Set of step IDs that are impacted (includes changed steps and all downstream dependents)
   */
  downstreamClosure(allSteps: StepSpec[], changedStepIds: string[]): Set<string> {
    const closure = new Set<string>(changedStepIds);
    const queue = [...changedStepIds];

    // Build reverse dependency map: stepId → steps that depend on it
    const dependentsMap = new Map<string, string[]>();
    for (const step of allSteps) {
      for (const depId of step.dependsOn) {
        const dependents = dependentsMap.get(depId) || [];
        dependents.push(step.stepId);
        dependentsMap.set(depId, dependents);
      }
    }

    // BFS to find all downstream dependents
    while (queue.length > 0) {
      const stepId = queue.shift()!;
      const dependents = dependentsMap.get(stepId) || [];

      for (const dependent of dependents) {
        if (!closure.has(dependent)) {
          closure.add(dependent);
          queue.push(dependent);
        }
      }
    }

    return closure;
  }

  /**
   * Check if the workflow step dependencies form a valid DAG (no cycles).
   *
   * @param steps Array of step specifications
   * @returns true if valid (no cycles), false if cycles detected
   */
  validateNoCycles(steps: StepSpec[]): { valid: boolean; error?: string } {
    try {
      this.topologicalSort(steps);
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  /**
   * Get steps that have no dependencies (entry points of the DAG).
   *
   * @param steps Array of step specifications
   * @returns Steps with no dependencies
   */
  getEntrySteps(steps: StepSpec[]): StepSpec[] {
    return steps.filter((step) => step.dependsOn.length === 0);
  }

  /**
   * Get steps that can run in parallel given the current completed steps.
   *
   * @param allSteps All workflow steps
   * @param completedStepIds IDs of steps that have completed
   * @param pendingStepIds IDs of steps that are pending
   * @returns Steps that can be executed (all dependencies satisfied)
   */
  getReadySteps(allSteps: StepSpec[], completedStepIds: Set<string>, pendingStepIds: Set<string>): StepSpec[] {
    const ready: StepSpec[] = [];

    for (const step of allSteps) {
      if (!pendingStepIds.has(step.stepId)) {
        continue; // Not pending, skip
      }

      // Check if all dependencies are completed
      const allDependenciesMet = step.dependsOn.every((depId) => completedStepIds.has(depId));

      if (allDependenciesMet) {
        ready.push(step);
      }
    }

    return ready;
  }
}
