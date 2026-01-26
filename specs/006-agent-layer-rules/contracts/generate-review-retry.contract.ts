/**
 * Generate-Review-Retry Pattern Contract
 *
 * Defines the interface for the utility that composes LLM generation
 * and review with optional retry on failure.
 */

import type { GenerationInput, GenerationConfig, GenerationResult } from './llm-generation.contract';
import type { ReviewConfig, ReviewResult } from './llm-review.contract';

// ============================================================================
// Configuration Types
// ============================================================================

export interface GenerateWithReviewConfig {
  /**
   * Configuration for the generation step
   */
  generation: GenerationConfig;

  /**
   * Configuration for the review step
   */
  review: ReviewConfig;

  /**
   * Whether to retry generation once if review fails (default: false)
   */
  retryOnce?: boolean;

  /**
   * Custom function to build retry input from review feedback
   * If not provided, uses default behavior of injecting issues/suggestions
   */
  buildRetryInput?: (
    originalInput: GenerationInput,
    reviewResult: ReviewResult
  ) => GenerationInput;
}

// ============================================================================
// Result Types
// ============================================================================

export interface GenerateWithReviewResult<T = unknown> {
  /**
   * Whether the final output passed review
   */
  success: boolean;

  /**
   * The generated data (may be from retry if retryOnce was used)
   */
  data?: T;

  /**
   * Result from the generation step
   */
  generationResult: GenerationResult<T>;

  /**
   * Result from the review step
   */
  reviewResult: ReviewResult;

  /**
   * Whether a retry was attempted
   */
  retried: boolean;

  /**
   * If retried, the result from the retry generation
   */
  retryGenerationResult?: GenerationResult<T>;

  /**
   * If retried, the result from the retry review
   */
  retryReviewResult?: ReviewResult;

  /**
   * Overall performance breakdown
   */
  timings_ms: {
    initial_generation: number;
    initial_review: number;
    retry_generation?: number;
    retry_review?: number;
    total: number;
  };
}

// ============================================================================
// Service Interface
// ============================================================================

export interface IGenerateReviewRetryService {
  /**
   * Generate output, review it, and optionally retry if review fails
   *
   * @param input - Variables and context for generation
   * @param config - Configuration for generation, review, and retry behavior
   * @returns Combined result with generation and review outcomes
   *
   * @example
   * ```typescript
   * // Without retry
   * const result = await service.generateWithReview(
   *   { variables: { brief: 'Summer campaign' } },
   *   {
   *     generation: { promptId: 'campaign_plan', outputSchema: schema },
   *     review: { rubricId: 'campaign_quality' }
   *   }
   * );
   *
   * // With retry on failure
   * const resultWithRetry = await service.generateWithReview(
   *   { variables: { brief: 'Summer campaign' } },
   *   {
   *     generation: { promptId: 'campaign_plan', outputSchema: schema },
   *     review: { rubricId: 'campaign_quality' },
   *     retryOnce: true
   *   }
   * );
   *
   * if (resultWithRetry.success) {
   *   console.log('Passed review:', resultWithRetry.data);
   * } else if (resultWithRetry.retried) {
   *   console.log('Failed after retry:', resultWithRetry.reviewResult.issues);
   * } else {
   *   console.log('Failed initial review:', resultWithRetry.reviewResult.issues);
   * }
   * ```
   */
  generateWithReview<T>(
    input: GenerationInput,
    config: GenerateWithReviewConfig
  ): Promise<GenerateWithReviewResult<T>>;
}

// ============================================================================
// Default Retry Input Builder
// ============================================================================

/**
 * Default implementation for building retry input from review feedback
 *
 * Injects the issues and suggested_fixes from the review into the
 * generation input as a critique object.
 */
export function defaultBuildRetryInput(
  originalInput: GenerationInput,
  reviewResult: ReviewResult
): GenerationInput {
  return {
    ...originalInput,
    critique: {
      issues: reviewResult.issues,
      suggestions: reviewResult.suggested_fixes,
    },
  };
}

// ============================================================================
// Error Codes
// ============================================================================

export const GenerateReviewRetryErrorCodes = {
  GENERATION_FAILED: 'GENERATION_FAILED',
  REVIEW_FAILED: 'REVIEW_FAILED',
  RETRY_GENERATION_FAILED: 'RETRY_GENERATION_FAILED',
  RETRY_REVIEW_FAILED: 'RETRY_REVIEW_FAILED',
} as const;

export type GenerateReviewRetryErrorCode =
  (typeof GenerateReviewRetryErrorCodes)[keyof typeof GenerateReviewRetryErrorCodes];
