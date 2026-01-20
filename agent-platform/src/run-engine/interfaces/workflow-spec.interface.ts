import { StepSpec } from './step-spec.interface';

export interface WorkflowSpec {
  workflowName: string;
  version: string;
  description?: string;
  steps: StepSpec[];
}
