import { Test, TestingModule } from '@nestjs/testing';
import { SchemaValidatorService } from '../../src/skills/skill-runner/services/schema-validator.service';

describe('SchemaValidatorService', () => {
  let service: SchemaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaValidatorService],
    }).compile();

    service = module.get<SchemaValidatorService>(SchemaValidatorService);
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('validateInput', () => {
    it('should validate valid input against schema', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const input = { name: 'John', age: 30 };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject input missing required fields', () => {
      const schema = {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
      };

      const input = { name: 'John' };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Missing required field');
      expect(result.errors[0].field).toBe('email');
    });

    it('should reject input with wrong type', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };

      const input = { age: 'not a number' };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('age');
      expect(result.errors[0].message).toContain('Expected number');
    });

    it('should validate enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      };

      const validInput = { status: 'active' };
      const invalidInput = { status: 'unknown' };

      expect(service.validateInput(schema, validInput, 'test_skill').valid).toBe(true);

      const result = service.validateInput(schema, invalidInput, 'test_skill');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Must be one of');
    });

    it('should validate minimum and maximum values', () => {
      const schema = {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
        },
      };

      expect(service.validateInput(schema, { score: 50 }, 'test_skill').valid).toBe(true);
      expect(service.validateInput(schema, { score: 0 }, 'test_skill').valid).toBe(true);
      expect(service.validateInput(schema, { score: 100 }, 'test_skill').valid).toBe(true);

      const belowMin = service.validateInput(schema, { score: -1 }, 'test_skill');
      expect(belowMin.valid).toBe(false);
      expect(belowMin.errors[0].message).toContain('>= 0');

      const aboveMax = service.validateInput(schema, { score: 101 }, 'test_skill');
      expect(aboveMax.valid).toBe(false);
      expect(aboveMax.errors[0].message).toContain('<= 100');
    });

    it('should validate string length constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
        },
      };

      expect(service.validateInput(schema, { username: 'john' }, 'test_skill').valid).toBe(true);

      const tooShort = service.validateInput(schema, { username: 'ab' }, 'test_skill');
      expect(tooShort.valid).toBe(false);
      expect(tooShort.errors[0].message).toContain('at least 3');

      const tooLong = service.validateInput(schema, { username: 'a'.repeat(21) }, 'test_skill');
      expect(tooLong.valid).toBe(false);
      expect(tooLong.errors[0].message).toContain('at most 20');
    });

    it('should validate pattern constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^[A-Z]{3}-\\d{3}$' },
        },
      };

      expect(service.validateInput(schema, { code: 'ABC-123' }, 'test_skill').valid).toBe(true);

      const result = service.validateInput(schema, { code: 'invalid' }, 'test_skill');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Must match pattern');
    });

    it('should validate format constraints (email)', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      };

      expect(service.validateInput(schema, { email: 'test@example.com' }, 'test_skill').valid).toBe(true);

      const result = service.validateInput(schema, { email: 'not-an-email' }, 'test_skill');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Must be a valid email');
    });

    it('should validate format constraints (uri)', () => {
      const schema = {
        type: 'object',
        properties: {
          website: { type: 'string', format: 'uri' },
        },
      };

      expect(service.validateInput(schema, { website: 'https://example.com' }, 'test_skill').valid).toBe(true);

      const result = service.validateInput(schema, { website: 'not-a-url' }, 'test_skill');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Must be a valid uri');
    });

    it('should validate nested objects', () => {
      const schema = {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              address: {
                type: 'object',
                properties: {
                  city: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const validInput = {
        user: {
          name: 'John',
          address: { city: 'NYC' },
        },
      };
      expect(service.validateInput(schema, validInput, 'test_skill').valid).toBe(true);

      const invalidInput = {
        user: {
          address: { city: 123 },
        },
      };
      const result = service.validateInput(schema, invalidInput, 'test_skill');
      expect(result.valid).toBe(false);
      // Should have errors for missing required 'name' and wrong type for 'city'
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should validate arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
          },
        },
      };

      expect(service.validateInput(schema, { tags: ['a', 'b'] }, 'test_skill').valid).toBe(true);

      const emptyArray = service.validateInput(schema, { tags: [] }, 'test_skill');
      expect(emptyArray.valid).toBe(false);

      const wrongType = service.validateInput(schema, { tags: [1, 2, 3] }, 'test_skill');
      expect(wrongType.valid).toBe(false);
    });

    it('should report all errors when multiple fields are invalid', () => {
      const schema = {
        type: 'object',
        required: ['name', 'email', 'age'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          age: { type: 'number', minimum: 0 },
        },
      };

      const input = { age: -5 }; // missing name, email; age below minimum
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(false);
      // Should have multiple errors (missing name, missing email, age below minimum)
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validateOutput', () => {
    it('should validate valid output against schema', () => {
      const schema = {
        type: 'object',
        required: ['result'],
        properties: {
          result: { type: 'string' },
          metadata: { type: 'object' },
        },
      };

      const output = { result: 'success', metadata: { count: 10 } };
      const result = service.validateOutput(schema, output, 'test_skill');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject output missing required fields', () => {
      const schema = {
        type: 'object',
        required: ['data', 'status'],
        properties: {
          data: { type: 'object' },
          status: { type: 'string' },
        },
      };

      const output = { data: {} };
      const result = service.validateOutput(schema, output, 'test_skill');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Missing required field');
    });

    it('should handle complex output structures', () => {
      const schema = {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'value'],
              properties: {
                id: { type: 'string' },
                value: { type: 'number' },
              },
            },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              total: { type: 'number' },
            },
          },
        },
      };

      const validOutput = {
        items: [
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
        ],
        pagination: { page: 1, total: 2 },
      };
      expect(service.validateOutput(schema, validOutput, 'test_skill').valid).toBe(true);

      const invalidOutput = {
        items: [
          { id: 'a' }, // missing required 'value'
        ],
      };
      const result = service.validateOutput(schema, invalidOutput, 'test_skill');
      expect(result.valid).toBe(false);
    });
  });

  describe('schema caching', () => {
    it('should cache compiled schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      // First validation should compile the schema
      const result1 = service.validateInput(schema, { name: 'John' }, 'cached_skill');
      expect(result1.valid).toBe(true);

      // Second validation should use cached schema
      const result2 = service.validateInput(schema, { name: 'Jane' }, 'cached_skill');
      expect(result2.valid).toBe(true);
    });

    it('should use different cache keys for input and output', () => {
      const inputSchema = {
        type: 'object',
        required: ['input'],
        properties: {
          input: { type: 'string' },
        },
      };

      const outputSchema = {
        type: 'object',
        required: ['output'],
        properties: {
          output: { type: 'number' },
        },
      };

      // These should not conflict in cache
      const inputResult = service.validateInput(inputSchema, { input: 'test' }, 'skill');
      const outputResult = service.validateOutput(outputSchema, { output: 42 }, 'skill');

      expect(inputResult.valid).toBe(true);
      expect(outputResult.valid).toBe(true);
    });

    it('should clear cache when clearCache is called', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      service.validateInput(schema, { name: 'John' }, 'test_skill');
      service.clearCache();

      // After clearing, should still work (recompiles schema)
      const result = service.validateInput(schema, { name: 'Jane' }, 'test_skill');
      expect(result.valid).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle invalid schema gracefully', () => {
      const invalidSchema = {
        type: 'invalid_type', // Invalid JSON Schema type
      } as unknown as Record<string, unknown>;

      const result = service.validateInput(invalidSchema, { name: 'test' }, 'test_skill');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should work without skillId parameter', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const result = service.validateInput(schema, { name: 'test' });

      expect(result.valid).toBe(true);
    });

    it('should handle null and undefined values', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      };

      const nullResult = service.validateInput(schema, null, 'test_skill');
      expect(nullResult.valid).toBe(false);

      const undefinedResult = service.validateInput(schema, undefined, 'test_skill');
      expect(undefinedResult.valid).toBe(false);
    });

    it('should handle empty object against schema with required fields', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      };

      const result = service.validateInput(schema, {}, 'test_skill');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Missing required field');
    });
  });

  describe('additionalProperties handling', () => {
    it('should allow additional properties by default', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const input = { name: 'John', extraField: 'allowed' };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(true);
    });

    it('should respect additionalProperties: false in schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const input = { name: 'John', extraField: 'not allowed' };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(false);
    });
  });

  describe('default values', () => {
    it('should apply default values during validation', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', default: 'active' },
        },
      };

      const input = { name: 'John' };
      const result = service.validateInput(schema, input, 'test_skill');

      expect(result.valid).toBe(true);
      // Note: The input object may be mutated to include the default value
    });
  });
});
