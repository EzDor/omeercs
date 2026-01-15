import { WorkflowErrorCategory } from './workflow-error-category.enum';

export interface CategorizedErrorInterface {
  category: WorkflowErrorCategory;
  message: string;
  originalError: Error;
  stack?: string;
  context?: Record<string, unknown>;
}
