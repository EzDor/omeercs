# Research: Skill Runner

**Feature**: Skill Runner | **Date**: 2026-01-18

## Summary

This document captures research findings and technology decisions for the Skill Runner implementation. All "NEEDS CLARIFICATION" items from the technical context have been resolved through codebase exploration and best practices research.

---

## 1. JSON Schema Validation Library

**Decision**: Use **Ajv** (Another JSON Validator) for JSON Schema validation

**Rationale**:
- Industry standard for JSON Schema validation in JavaScript/TypeScript
- Supports JSON Schema draft-07 (commonly used in YAML skill descriptors)
- Excellent performance with schema compilation and caching
- Already a transitive dependency in the ecosystem (LangChain uses it)
- Supports custom error messages and detailed validation errors
- TypeScript types available via @types/ajv (built-in since v8)

**Alternatives Considered**:
- **class-validator**: Good for DTOs, but doesn't support JSON Schema format used in YAML descriptors
- **Zod**: Great TypeScript-first library, but requires schema rewrite from JSON Schema
- **joi**: Popular but doesn't directly support JSON Schema format

**Implementation Notes**:
```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Compile schema once, reuse for validation
const validate = ajv.compile(inputSchema);
const valid = validate(input);
if (!valid) {
  // validate.errors contains detailed error info
}
```

---

## 2. Workspace Isolation Strategy

**Decision**: Use **temporary directories** with automatic cleanup

**Rationale**:
- Node.js `fs.mkdtemp()` provides secure temp directory creation
- Each execution gets unique workspace under configurable base path
- Cleanup on execution completion (success or failure)
- No process-level sandboxing per spec clarification (trust registered skills)
- Aligns with existing `workspace_dir` pattern in SkillExecutionContext

**Alternatives Considered**:
- **Docker containers per execution**: Overhead too high for MVP, adds complexity
- **VM isolation**: Excessive for trusted skill execution
- **chroot/namespace isolation**: OS-specific, not portable

**Implementation Notes**:
```typescript
// Workspace service
const baseDir = configService.get('SKILLS_WORKSPACE_DIR') || '/tmp/skill-workspaces';
const workspaceDir = await fs.promises.mkdtemp(path.join(baseDir, `run-${runId}-`));
// Automatic cleanup on context disposal
```

---

## 3. Timeout Mechanism

**Decision**: Use **AbortController** with Promise.race pattern

**Rationale**:
- Native JavaScript API, no external dependencies
- Works with async/await and Promise-based skill execution
- Can propagate cancellation signal to nested operations
- Skill descriptors define `timeout_ms` in policy section
- Default 60 seconds per spec clarification

**Alternatives Considered**:
- **setTimeout with Promise wrapper**: Less clean, no cancellation signal
- **p-timeout library**: External dependency for simple functionality
- **Worker threads with termination**: Overhead for in-process execution

**Implementation Notes**:
```typescript
const timeout = descriptor.policy?.timeout_ms ?? 60000;
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);

try {
  const result = await Promise.race([
    handler.execute(input, { ...context, signal: controller.signal }),
    new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new SkillTimeoutError(`Skill ${skillId} timed out after ${timeout}ms`))
      );
    })
  ]);
  return result;
} finally {
  clearTimeout(timeoutId);
}
```

---

## 4. Artifact Content Hashing

**Decision**: Use **SHA-256** via Node.js crypto module

**Rationale**:
- Built-in Node.js module, no external dependency
- SHA-256 is cryptographically secure and widely accepted
- Fast enough for file hashing in artifact registration
- Consistent with content-addressable storage patterns

**Alternatives Considered**:
- **MD5**: Faster but cryptographically broken, not recommended
- **SHA-1**: Also considered insecure for modern applications
- **xxHash**: Faster but non-cryptographic, overkill for integrity checking

**Implementation Notes**:
```typescript
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

async function computeContentHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

---

## 5. Artifact Storage Strategy

**Decision**: **Local filesystem** for MVP with URI abstraction for future cloud storage

**Rationale**:
- Per spec assumptions: "defaults to local filesystem for development"
- URI scheme allows future migration to S3/GCS without interface changes
- Configurable base path via environment variable
- Artifact entity stores URI, not absolute path

**Alternatives Considered**:
- **S3 from start**: Over-engineering for MVP
- **MinIO for local S3-compatible**: Additional infrastructure complexity
- **Database BLOB storage**: Performance issues for large files

**Implementation Notes**:
```typescript
// Local storage with file:// URI scheme
const artifactUri = `file://${artifactPath}`;

// Future cloud storage
const artifactUri = `s3://bucket/artifacts/${tenantId}/${runId}/${filename}`;
const artifactUri = `gs://bucket/artifacts/${tenantId}/${runId}/${filename}`;

// Registry stores URI, retrieval layer interprets scheme
```

---

## 6. Execution Context Design

**Decision**: Extend existing `SkillExecutionContext` interface

**Rationale**:
- Existing interface has `tenantId`, `executionId`, `skillId`, `provider`
- Add `runId` (unique execution identifier), `workspaceDir`, `logger`, `secrets`, `policy`
- Maintains backward compatibility with existing handlers
- Logger uses NestJS Logger scoped to execution

**Existing Interface** (to extend):
```typescript
export interface SkillExecutionContext {
  tenantId: string;
  executionId: string;
  skillId: string;
  provider?: string;
}
```

**Enhanced Interface**:
```typescript
export interface EnhancedSkillExecutionContext extends SkillExecutionContext {
  runId: string;           // Unique run identifier (UUID)
  workspaceDir: string;    // Dedicated workspace path
  artifactBaseUri: string; // Base URI for artifact storage
  logger: Logger;          // Scoped NestJS logger
  secrets: SkillSecrets;   // API keys and credentials
  policy: SkillPolicy;     // Execution constraints from descriptor
  signal?: AbortSignal;    // Cancellation signal for timeouts
}

export interface SkillSecrets {
  get(key: string): string | undefined;
  has(key: string): boolean;
}

export interface SkillPolicy {
  timeout_ms: number;
  max_retries?: number;
  allowed_providers?: string[];
  // ... other policy fields from descriptor
}
```

---

## 7. Error Categorization

**Decision**: Four exception types per spec, all extending base `SkillException`

**Rationale**:
- Matches FR-008: input validation, execution, output validation, policy violation
- All extend common base for consistent handling
- Include error_code for programmatic handling
- Include field-level details for validation errors

**Implementation Notes**:
```typescript
export abstract class SkillException extends Error {
  constructor(
    public readonly errorType: SkillErrorType,
    public readonly errorCode: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export enum SkillErrorType {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  EXECUTION = 'EXECUTION',
  OUTPUT_VALIDATION = 'OUTPUT_VALIDATION',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  TIMEOUT = 'TIMEOUT',
}

export class SkillInputValidationException extends SkillException {
  constructor(
    public readonly fieldErrors: ValidationFieldError[],
    message?: string,
  ) {
    super(
      SkillErrorType.INPUT_VALIDATION,
      'SKILL_INPUT_INVALID',
      message || 'Input validation failed',
      { fieldErrors },
    );
  }
}
```

---

## 8. Logging and Observability

**Decision**: Use NestJS Logger with structured metadata

**Rationale**:
- Consistent with existing codebase patterns
- Logger injected into execution context
- All logs tagged with runId for correlation
- Existing observability config in skill descriptors (log_level, metrics_emit)

**Implementation Notes**:
```typescript
// Create scoped logger for each execution
const logger = new Logger(`SkillRunner:${skillId}:${runId}`);

// Structured logging
logger.log({
  message: 'Skill execution started',
  skillId,
  runId,
  tenantId,
  inputHash: computeInputHash(input),
});

// Metric emission (future: integrate with observability stack)
const metrics = {
  skill_execution_duration_ms: executionTime,
  skill_validation_duration_ms: validationTime,
  skill_artifacts_count: artifacts.length,
};
```

---

## 9. Concurrency Handling

**Decision**: **Stateless service** with isolated workspaces per execution

**Rationale**:
- Per spec clarification: "Each execution receives an isolated workspace and context"
- No shared mutable state in SkillRunnerService
- Each execution creates its own context, workspace, logger
- Database artifact registry handles concurrent writes via TypeORM

**Alternatives Considered**:
- **Execution queue**: Adds complexity, limits throughput
- **Semaphore-based limiting**: Premature optimization

**Implementation Notes**:
- SkillRunnerService is stateless (no instance variables tracking executions)
- Workspace service creates unique directories per runId
- Artifact registry uses database transactions for consistency

---

## 10. Skill Version Resolution

**Decision**: Latest version by default, exact version when specified

**Rationale**:
- Per spec: "latest version executed when no version specified"
- Catalog already supports `getSkill(skill_id, version?)`
- Semantic versioning for ordering (major.minor.patch)

**Implementation Notes**:
```typescript
// SkillCatalogService already implements this
async getSkill(skillId: string, version?: string): Promise<SkillDescriptor> {
  const descriptors = this.descriptors.get(skillId);
  if (!descriptors) throw new SkillNotFoundError(skillId);

  if (version) {
    const exact = descriptors.find(d => d.version === version);
    if (!exact) throw new SkillVersionNotFoundError(skillId, version);
    return exact;
  }

  // Return latest by semver
  return descriptors.sort(semverCompare).at(-1)!;
}
```

---

## Dependencies Summary

| Package | Purpose | Version | Status |
|---------|---------|---------|--------|
| ajv | JSON Schema validation | ^8.x | New dependency |
| ajv-formats | Format validation (email, uri, etc.) | ^3.x | New dependency |
| uuid | Run ID generation | ^9.x | Existing |
| crypto | Content hashing | Built-in | No install needed |
| fs/promises | Workspace management | Built-in | No install needed |

---

## References

- [Ajv Documentation](https://ajv.js.org/)
- [JSON Schema Draft-07](https://json-schema.org/specification-links.html#draft-7)
- [NestJS Modules](https://docs.nestjs.com/modules)
- [Node.js Crypto](https://nodejs.org/api/crypto.html)
- [AbortController MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
