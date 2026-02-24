import { Annotation } from '@langchain/langgraph';

export interface SkillStepResult {
  ok: boolean;
  data?: Record<string, unknown>;
  artifactIds: string[];
  error?: string;
  durationMs: number;
}

function mergeStepResults(current: Map<string, SkillStepResult>, update: Map<string, SkillStepResult>): Map<string, SkillStepResult> {
  const merged = new Map(current);
  for (const [key, value] of update) {
    merged.set(key, value);
  }
  return merged;
}

export const CampaignWorkflowState = Annotation.Root({
  runId: Annotation<string>({
    reducer: (_current: string, update: string) => update,
    default: () => '',
  }),

  tenantId: Annotation<string>({
    reducer: (_current: string, update: string) => update,
    default: () => '',
  }),

  triggerPayload: Annotation<Record<string, unknown>>({
    reducer: (_current: Record<string, unknown>, update: Record<string, unknown>) => update,
    default: () => ({}),
  }),

  stepResults: Annotation<Map<string, SkillStepResult>>({
    reducer: mergeStepResults,
    default: () => new Map(),
  }),

  error: Annotation<string | null>({
    reducer: (_current: string | null, update: string | null) => update,
    default: () => null,
  }),
});

export type CampaignWorkflowStateType = typeof CampaignWorkflowState.State;
