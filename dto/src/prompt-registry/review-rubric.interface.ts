import type { JSONSchema } from './prompt-template.interface';

export interface RubricCriterion {
  name: string;
  description: string;
  scoringGuidance: string;
  weight?: number;
}

export interface ReviewRubric {
  rubricId: string;
  version: string;
  description: string;
  criteria: RubricCriterion[];
  outputSchema: JSONSchema;
}
