import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries?: number;
  backoffMultiplier?: number;
  logger?: Logger;
  operationName?: string;
}

export class RetryUtil {
  static async withBackoff<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const { maxRetries = 3, backoffMultiplier = 2, logger, operationName = 'operation' } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (logger) {
          logger.warn(`${operationName} attempt ${attempt} failed: ${lastError.message}`);
        }

        if (attempt < maxRetries) {
          const delayMs = this.calculateBackoffDelay(attempt, backoffMultiplier);
          await this.sleep(delayMs);
        }
      }
    }

    if (logger) {
      logger.error(`${operationName} failed after all retries`, lastError);
    }

    throw new Error(`Failed to ${operationName} after ${maxRetries} attempts`);
  }

  static calculateBackoffDelay(attempt: number, multiplier: number = 2): number {
    return Math.pow(multiplier, attempt) * 1000;
  }

  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
