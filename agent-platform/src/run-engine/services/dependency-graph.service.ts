import { Injectable, Logger } from '@nestjs/common';
import { DirectedAcyclicGraph } from 'typescript-graph';
import { StepSpec } from '../interfaces/step-spec.interface';

@Injectable()
export class DependencyGraphService {
  private readonly logger = new Logger(DependencyGraphService.name);

  topologicalSort(steps: StepSpec[]): StepSpec[] {
    const graph = new DirectedAcyclicGraph<StepSpec>((step) => step.stepId);
    const nodeMap = new Map<string, StepSpec>();

    for (const step of steps) {
      graph.insert(step);
      nodeMap.set(step.stepId, step);
    }

    for (const step of steps) {
      for (const depId of step.dependsOn) {
        const dependency = nodeMap.get(depId);
        if (!dependency) {
          throw new Error(`Step '${step.stepId}' depends on unknown step '${depId}'`);
        }
        graph.addEdge(dependency.stepId, step.stepId);
      }
    }

    return graph.topologicallySortedNodes();
  }

  validateNoCycles(steps: StepSpec[]): { valid: boolean; error?: string } {
    try {
      this.topologicalSort(steps);
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  getEntrySteps(steps: StepSpec[]): StepSpec[] {
    return steps.filter((step) => step.dependsOn.length === 0);
  }
}
