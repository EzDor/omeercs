import { Annotation } from '@langchain/langgraph';
import { DataItem } from './data-item.interface';
import { EnrichedDataItem } from './enriched-data-item.interface';

export const DataEnrichmentState = Annotation.Root({
  // Input: IDs to process
  inputIds: Annotation<string[]>({
    reducer: (current: string[], update: string[]) => update,
    default: () => [],
  }),

  // Loaded raw data items
  rawData: Annotation<DataItem[]>({
    reducer: (current: DataItem[], update: DataItem[]) => update,
    default: () => [],
  }),

  // Transformed data items
  transformedData: Annotation<DataItem[]>({
    reducer: (current: DataItem[], update: DataItem[]) => update,
    default: () => [],
  }),

  // Enriched data with LLM analysis
  enrichedData: Annotation<EnrichedDataItem[]>({
    reducer: (current: EnrichedDataItem[], update: EnrichedDataItem[]) => update,
    default: () => [],
  }),

  // Final saved results (IDs or confirmation)
  savedResultIds: Annotation<string[]>({
    reducer: (current: string[], update: string[]) => update,
    default: () => [],
  }),

  // Error field for conditional error handling
  error: Annotation<string | null>({
    reducer: (current: string | null, update: string | null) => update,
    default: () => null,
  }),

  // Current step for tracking progress
  currentStep: Annotation<string>({
    reducer: (current: string, update: string) => update,
    default: () => 'init',
  }),
});

export type DataEnrichmentStateType = typeof DataEnrichmentState.State;
