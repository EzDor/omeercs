import { Injectable, Logger } from '@nestjs/common';
import { WorkflowErrorCategory } from '../interfaces/workflow-error-category.enum';
import { CategorizedErrorInterface } from '../interfaces/categorized-error.interface';

@Injectable()
export class WorkflowErrorHandlerService {
  private readonly logger = new Logger(WorkflowErrorHandlerService.name);

  categorizeError(error: Error, context?: Record<string, unknown>): CategorizedErrorInterface {
    let category: WorkflowErrorCategory = WorkflowErrorCategory.UNKNOWN;
    let message = error.message;

    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      category = WorkflowErrorCategory.TIMEOUT;
      message = `Workflow execution exceeded the 5-minute timeout limit. The workflow took too long to complete. Consider breaking down complex workflows into smaller steps or optimizing step execution time. Original error: ${error.message}`;
    } else if (error.message.includes('recursion') || error.message.includes('maximum call stack') || error.message.includes('max steps')) {
      category = WorkflowErrorCategory.RECURSION_LIMIT;
      message = `Workflow exceeded the maximum allowed steps (100) or hit a recursion limit. This usually indicates an infinite loop or circular dependency in the workflow definition. Check for cycles in workflow transitions. Original error: ${error.message}`;
    } else if (error.message.includes('memory') || error.message.includes('resource') || error.message.includes('ENOMEM')) {
      category = WorkflowErrorCategory.RESOURCE_EXHAUSTED;
      message = `Workflow exhausted available system resources (512MB memory limit or 1 CPU core limit). Consider reducing data volume, optimizing memory usage, or breaking the workflow into smaller chunks. Original error: ${error.message}`;
    } else if (error.message.includes('validation') || error.message.includes('invalid') || error.message.includes('required')) {
      category = WorkflowErrorCategory.VALIDATION;
      message = `Workflow input or configuration validation failed. Please check that all required fields are provided and match the expected format. Original error: ${error.message}`;
    } else if (error.message.includes('shutting down')) {
      category = WorkflowErrorCategory.UNKNOWN;
      message = `Workflow execution was cancelled because the application is shutting down. The workflow can be retried after the system restarts.`;
    } else {
      category = WorkflowErrorCategory.UNKNOWN;
      message = `An unexpected error occurred during workflow execution. Please review the error details and contact support if the issue persists. Original error: ${error.message}`;
    }

    const contextInfo = context ? ` | Context: ${JSON.stringify(context)}` : '';
    this.logger.error(`Categorized error as ${category}: ${message}${contextInfo}`, error.stack);

    return {
      category,
      message,
      originalError: error,
      stack: error.stack,
      context,
    };
  }

  formatErrorForStorage(categorizedError: CategorizedErrorInterface): {
    errorMessage: string;
    errorCategory: string;
  } {
    return {
      errorMessage: categorizedError.message,
      errorCategory: categorizedError.category,
    };
  }
}
