import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { StepSpec } from '../interfaces/step-spec.interface';
import { RunStateAnnotation, RunStateType } from '../interfaces/langgraph-run-state.interface';
import { CachedStepExecutorService } from './cached-step-executor.service';
import { DependencyGraphService } from './dependency-graph.service';

type NodeFunction = (state: RunStateType) => Promise<Partial<RunStateType>>;

interface StateGraphBuilder {
  addNode(name: string, fn: NodeFunction): void;
  addEdge(from: string, to: string): void;
}

@Injectable()
export class LangGraphWorkflowBuilderService {
  private readonly logger = new Logger(LangGraphWorkflowBuilderService.name);

  constructor(
    private readonly cachedStepExecutor: CachedStepExecutorService,
    private readonly dependencyGraphService: DependencyGraphService,
  ) {}

  buildGraph(workflow: WorkflowSpec): StateGraph<RunStateType> {
    this.logger.log(`Building LangGraph for workflow: ${workflow.workflowName} v${workflow.version}`);

    const stateGraph = new StateGraph(RunStateAnnotation);
    const graph = stateGraph as unknown as StateGraphBuilder;

    for (const stepSpec of workflow.steps) {
      const nodeFunction = this.cachedStepExecutor.createNodeFunction(stepSpec);
      graph.addNode(stepSpec.stepId, nodeFunction);
    }

    const entrySteps = this.dependencyGraphService.getEntrySteps(workflow.steps);
    const dependentsMap = this.buildDependentsMap(workflow.steps);
    const terminalSteps = this.findTerminalSteps(workflow.steps, dependentsMap);

    for (const entryStep of entrySteps) {
      graph.addEdge(START, entryStep.stepId);
    }

    for (const stepSpec of workflow.steps) {
      const dependents = dependentsMap.get(stepSpec.stepId) || [];

      if (terminalSteps.has(stepSpec.stepId)) {
        graph.addEdge(stepSpec.stepId, END);
      } else {
        for (const dependent of dependents) {
          graph.addEdge(stepSpec.stepId, dependent);
        }
      }
    }

    this.logger.log(`LangGraph built with ${workflow.steps.length} nodes, ${entrySteps.length} entry points, ${terminalSteps.size} terminal steps`);

    return stateGraph as StateGraph<RunStateType>;
  }

  private buildDependentsMap(steps: StepSpec[]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const step of steps) {
      for (const depId of step.dependsOn) {
        const dependents = map.get(depId) || [];
        dependents.push(step.stepId);
        map.set(depId, dependents);
      }
    }

    return map;
  }

  private findTerminalSteps(steps: StepSpec[], dependentsMap: Map<string, string[]>): Set<string> {
    const terminal = new Set<string>();

    for (const step of steps) {
      const dependents = dependentsMap.get(step.stepId) || [];
      if (dependents.length === 0) {
        terminal.add(step.stepId);
      }
    }

    return terminal;
  }
}
