import { Injectable } from '@nestjs/common';
import stringify from 'fast-json-stable-stringify';
import { createHash } from 'node:crypto';

/**
 * Service for computing deterministic hashes of step inputs.
 * Uses canonical JSON serialization (RFC 8785) for consistent hashing.
 */
@Injectable()
export class InputHasherService {
  /**
   * Compute SHA-256 hash of the input object using canonical JSON serialization.
   *
   * @param input The input object to hash
   * @returns 64-character hex string (SHA-256 hash)
   */
  computeHash(input: Record<string, unknown>): string {
    const canonical = stringify(input);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  /**
   * Create a cache key by combining workflow name, step ID, and input hash.
   *
   * @param workflowName Name of the workflow
   * @param stepId Step identifier
   * @param input The input object
   * @returns Cache key in format: {workflowName}:{stepId}:{inputHash}
   */
  createCacheKey(workflowName: string, stepId: string, input: Record<string, unknown>): string {
    const inputHash = this.computeHash(input);
    return `${workflowName}:${stepId}:${inputHash}`;
  }

  /**
   * Create a cache key from a pre-computed input hash.
   *
   * @param workflowName Name of the workflow
   * @param stepId Step identifier
   * @param inputHash Pre-computed SHA-256 hash
   * @returns Cache key in format: {workflowName}:{stepId}:{inputHash}
   */
  createCacheKeyFromHash(workflowName: string, stepId: string, inputHash: string): string {
    return `${workflowName}:${stepId}:${inputHash}`;
  }
}
