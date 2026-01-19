import { StepSpec } from './step-spec.interface';

/**
 * Workflow specification defining the DAG structure
 */
export interface WorkflowSpec {
  workflowName: string;
  version: string;
  description?: string;
  steps: StepSpec[];
}
