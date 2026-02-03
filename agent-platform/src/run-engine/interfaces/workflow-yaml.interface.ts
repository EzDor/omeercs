export interface WorkflowYaml {
  workflow_name: string;
  version: string;
  description?: string;
  steps: WorkflowStepYaml[];
}

export interface WorkflowStepYaml {
  step_id: string;
  skill_id: string;
  depends_on: string[];
  description?: string;
  input_selector: InputSelectorYaml;
  cache_policy?: CachePolicyYaml;
  retry_policy?: RetryPolicyYaml;
}

export interface CachePolicyYaml {
  enabled: boolean;
  scope: 'global' | 'run_only';
}

export interface RetryPolicyYaml {
  max_attempts: number;
  backoff_ms: number;
}

export type InputSelectorYaml = Record<string, InputSelectorFieldYaml>;

export type InputSelectorFieldYaml =
  | TriggerSourceSelector
  | StepOutputSourceSelector
  | BaseRunSourceSelector
  | RegistrySourceSelector
  | ConstantsSourceSelector
  | MergeOperationSelector
  | PickOperationSelector;

export interface TriggerSourceSelector {
  source: 'trigger';
  path: string;
}

export interface StepOutputSourceSelector {
  source: 'step_output';
  step_id: string;
  path: string;
}

export interface BaseRunSourceSelector {
  source: 'base_run';
  step_id: string;
  path: string;
}

export interface RegistrySourceSelector {
  source: 'registry';
  type: 'prompt' | 'config' | 'rubric';
  id: string;
  version?: string;
}

export interface ConstantsSourceSelector {
  source: 'constants';
  value: unknown;
}

export interface MergeOperationSelector {
  operation: 'merge';
  inputs: InputSelectorFieldYaml[];
}

export interface PickOperationSelector {
  operation: 'pick';
  input: InputSelectorFieldYaml;
  keys: string[];
}

export interface WorkflowIndexYaml {
  version: string;
  updated_at: string;
  workflows: WorkflowIndexEntry[];
}

export interface WorkflowIndexEntry {
  workflow_name: string;
  version: string;
  file?: string;
  status: 'active' | 'deprecated' | 'experimental';
}
