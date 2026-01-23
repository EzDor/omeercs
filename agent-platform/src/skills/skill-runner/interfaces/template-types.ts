export enum TemplateType {
  LLM_JSON_GENERATION = 'LLM_JSON_GENERATION',
  LLM_REVIEW = 'LLM_REVIEW',
}

export function isValidTemplateType(value: unknown): value is TemplateType {
  return typeof value === 'string' && Object.values(TemplateType).includes(value as TemplateType);
}
