import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Validation error with field details
 */
export interface SchemaValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Result of schema validation
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

/**
 * Service for validating skill inputs and outputs against JSON Schema.
 * Uses Ajv for JSON Schema validation with caching.
 */
@Injectable()
export class SchemaValidatorService {
  private readonly logger = new Logger(SchemaValidatorService.name);
  private readonly ajv: Ajv;
  private readonly schemaCache: Map<string, ValidateFunction> = new Map();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true, // Report all errors, not just the first
      strict: false, // Allow additional properties by default
      coerceTypes: false, // Don't coerce types
      useDefaults: true, // Apply default values
    });

    // Add format validators (email, uri, date-time, etc.)
    addFormats(this.ajv);
  }

  /**
   * Validate input data against a skill's input schema.
   *
   * @param schema The JSON Schema to validate against
   * @param input The input data to validate
   * @param skillId Optional skill ID for caching
   * @returns Validation result with any errors
   */
  validateInput(schema: Record<string, unknown>, input: unknown, skillId?: string): SchemaValidationResult {
    return this.validate(schema, input, `${skillId || 'unknown'}_input`);
  }

  /**
   * Validate output data against a skill's output schema.
   *
   * @param schema The JSON Schema to validate against
   * @param output The output data to validate
   * @param skillId Optional skill ID for caching
   * @returns Validation result with any errors
   */
  validateOutput(schema: Record<string, unknown>, output: unknown, skillId?: string): SchemaValidationResult {
    return this.validate(schema, output, `${skillId || 'unknown'}_output`);
  }

  /**
   * Core validation logic with caching.
   */
  private validate(schema: Record<string, unknown>, data: unknown, cacheKey: string): SchemaValidationResult {
    try {
      const validator = this.getOrCompileSchema(schema, cacheKey);
      const valid = validator(data);

      if (valid) {
        return { valid: true, errors: [] };
      }

      const errors = this.formatErrors(validator.errors || []);
      return { valid: false, errors };
    } catch (error) {
      this.logger.error(`Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        errors: [
          {
            field: '',
            message: `Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get a cached validator or compile a new one.
   */
  private getOrCompileSchema(schema: Record<string, unknown>, cacheKey: string): ValidateFunction {
    // Check cache first
    const cached = this.schemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Compile and cache
    const validator = this.ajv.compile(schema);
    this.schemaCache.set(cacheKey, validator);
    return validator;
  }

  /**
   * Format Ajv errors into our error structure.
   */
  private formatErrors(ajvErrors: ErrorObject[]): SchemaValidationError[] {
    return ajvErrors.map((error) => {
      // Build field path from instancePath
      const field = error.instancePath ? error.instancePath.replace(/^\//, '').replace(/\//g, '.') : (error.params?.missingProperty as string) || '';

      // Build human-readable message
      let message = error.message || 'Validation failed';

      // Enhance message with additional info
      if (error.keyword === 'required') {
        message = `Missing required field: ${error.params?.missingProperty}`;
      } else if (error.keyword === 'type') {
        message = `Expected ${error.params?.type}`;
      } else if (error.keyword === 'enum') {
        message = `Must be one of: ${(error.params?.allowedValues as string[])?.join(', ')}`;
      } else if (error.keyword === 'minimum') {
        message = `Must be >= ${error.params?.limit}`;
      } else if (error.keyword === 'maximum') {
        message = `Must be <= ${error.params?.limit}`;
      } else if (error.keyword === 'minLength') {
        message = `Must have at least ${error.params?.limit} characters`;
      } else if (error.keyword === 'maxLength') {
        message = `Must have at most ${error.params?.limit} characters`;
      } else if (error.keyword === 'pattern') {
        message = `Must match pattern: ${error.params?.pattern}`;
      } else if (error.keyword === 'format') {
        message = `Must be a valid ${error.params?.format}`;
      }

      return {
        field: field,
        message,
        value: error.data,
      };
    });
  }

  /**
   * Clear the schema cache.
   */
  clearCache(): void {
    this.schemaCache.clear();
  }
}
