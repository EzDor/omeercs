import { Injectable } from '@nestjs/common';
import { SensitiveDataPatternInterface } from '../interfaces/sensitive-data-pattern.interface';

@Injectable()
export class DataSanitizationService {
  private readonly defaultPatterns: SensitiveDataPatternInterface[] = [
    { pattern: /api[_-]?key/i, replacementValue: '[MASKED_API_KEY]' },
    { pattern: /secret/i, replacementValue: '[MASKED_SECRET]' },
    { pattern: /token/i, replacementValue: '[MASKED_TOKEN]' },
    { pattern: /password/i, replacementValue: '[MASKED_PASSWORD]' },
    { pattern: /authorization/i, replacementValue: '[MASKED_AUTH]' },
    { pattern: /bearer/i, replacementValue: '[MASKED_BEARER]' },
    { pattern: /credential/i, replacementValue: '[MASKED_CREDENTIAL]' },
  ];

  getDefaultPatterns(): SensitiveDataPatternInterface[] {
    return this.defaultPatterns;
  }

  maskSensitiveFields(data: Record<string, unknown>, customPatterns?: SensitiveDataPatternInterface[]): Record<string, unknown> {
    const patterns = customPatterns || this.defaultPatterns;
    return this.recursiveMask(data, patterns) as Record<string, unknown>;
  }

  private recursiveMask(obj: unknown, patterns: SensitiveDataPatternInterface[]): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.recursiveMask(item, patterns));
    }

    if (obj instanceof Date || obj instanceof RegExp) {
      return obj;
    }

    if (typeof obj === 'object') {
      const maskedObject: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const matchingPattern = patterns.find((p) => p.pattern.test(key));
        if (matchingPattern) {
          maskedObject[key] = matchingPattern.replacementValue;
        } else if (typeof value === 'object') {
          maskedObject[key] = this.recursiveMask(value, patterns);
        } else {
          maskedObject[key] = value;
        }
      }
      return maskedObject;
    }

    return obj;
  }

  isSensitiveKey(key: string, customPatterns?: SensitiveDataPatternInterface[]): boolean {
    const patterns = customPatterns || this.defaultPatterns;
    return patterns.some((p) => p.pattern.test(key));
  }
}
