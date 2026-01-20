import { Injectable } from '@nestjs/common';
import stringify from 'fast-json-stable-stringify';
import { createHash } from 'node:crypto';

@Injectable()
export class InputHasherService {
  computeHash(input: Record<string, unknown>): string {
    const canonical = stringify(input);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  createCacheKey(workflowName: string, stepId: string, input: Record<string, unknown>): string {
    const inputHash = this.computeHash(input);
    return `${workflowName}:${stepId}:${inputHash}`;
  }

  createCacheKeyFromHash(workflowName: string, stepId: string, inputHash: string): string {
    return `${workflowName}:${stepId}:${inputHash}`;
  }
}
