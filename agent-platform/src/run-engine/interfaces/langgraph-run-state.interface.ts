import { Annotation } from '@langchain/langgraph';

export interface StepResult {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed';
  artifactIds: string[];
  data?: Record<string, unknown>;
  cacheHit: boolean;
  durationMs: number;
  error?: { code: string; message: string };
}

function mergeMapReducer<K, V>(current: Map<K, V>, update: Map<K, V>): Map<K, V> {
  const merged = new Map(current);
  for (const [key, value] of update) {
    merged.set(key, value);
  }
  return merged;
}

export const RunStateAnnotation = Annotation.Root({
  runId: Annotation<string>({
    reducer: (_current: string, update: string) => update,
    default: () => '',
  }),

  tenantId: Annotation<string>({
    reducer: (_current: string, update: string) => update,
    default: () => '',
  }),

  workflowName: Annotation<string>({
    reducer: (_current: string, update: string) => update,
    default: () => '',
  }),

  triggerPayload: Annotation<Record<string, unknown>>({
    reducer: (_current: Record<string, unknown>, update: Record<string, unknown>) => update,
    default: () => ({}),
  }),

  stepResults: Annotation<Map<string, StepResult>>({
    reducer: mergeMapReducer,
    default: () => new Map(),
  }),

  artifacts: Annotation<Map<string, string[]>>({
    reducer: mergeMapReducer,
    default: () => new Map(),
  }),

  error: Annotation<string | null>({
    reducer: (current: string | null, update: string | null) => update ?? current,
    default: () => null,
  }),
});

export type RunStateType = typeof RunStateAnnotation.State;
