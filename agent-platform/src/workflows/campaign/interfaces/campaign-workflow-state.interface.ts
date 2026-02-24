import { Annotation } from '@langchain/langgraph';

export interface SkillStepResult {
  ok: boolean;
  data?: Record<string, unknown>;
  artifactIds: string[];
  error?: string;
  durationMs: number;
}

function mergeStepResults(
  current: Record<string, SkillStepResult>,
  update: Record<string, SkillStepResult>,
): Record<string, SkillStepResult> {
  return { ...current, ...update };
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

  stepResults: Annotation<Record<string, SkillStepResult>>({
    reducer: mergeStepResults,
    default: () => ({}),
  }),

  baseRunOutputs: Annotation<Record<string, Record<string, unknown>>>({
    reducer: (_current: Record<string, Record<string, unknown>>, update: Record<string, Record<string, unknown>>) => update,
    default: () => ({}),
  }),

  error: Annotation<string | null>({
    reducer: (_current: string | null, update: string | null) => update,
    default: () => null,
  }),
});

export type CampaignWorkflowStateType = typeof CampaignWorkflowState.State;
