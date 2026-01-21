/**
 * Prompt Registry Service API Contracts
 *
 * This file defines the TypeScript interfaces for the PromptRegistryService.
 * These are internal service contracts (not HTTP API) since the registry
 * is consumed directly by skills within the agent-platform.
 *
 * @module PromptRegistryContracts
 * @version 1.0.0
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * JSON Schema type alias for clarity
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Model configuration defaults for LLM calls
 */
export interface ModelDefaults {
  /** Model identifier (e.g., "gemini/gemini-2.0-flash", "gpt-4o") */
  model?: string;
  /** Temperature for response generation (0-2) */
  temperature?: number;
  /** Maximum tokens in response */
  max_tokens?: number;
}

// ============================================================================
// Prompt Template Types
// ============================================================================

/**
 * Loaded prompt template with all metadata
 */
export interface PromptTemplate {
  /** Unique identifier for the prompt */
  promptId: string;
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  /** Human-readable description */
  description: string;
  /** Raw template string with {{variable}} placeholders */
  template: string;
  /** JSON Schema for validating input variables */
  varsSchema: JSONSchema;
  /** Optional LLM configuration defaults */
  modelDefaults?: ModelDefaults;
  /** Optional JSON Schema for expected output validation */
  outputSchema?: JSONSchema;
}

/**
 * Result of rendering a prompt template
 */
export interface RenderedPrompt {
  /** The fully resolved prompt text */
  content: string;
  /** Prompt identifier for tracing */
  promptId: string;
  /** Version used */
  version: string;
  /** Model defaults if specified in template */
  modelDefaults?: ModelDefaults;
  /** Output schema if specified in template */
  outputSchema?: JSONSchema;
  /** Variables that were applied */
  varsApplied: Record<string, unknown>;
}

// ============================================================================
// Config Template Types
// ============================================================================

/**
 * Loaded config template
 */
export interface ConfigTemplate {
  /** Unique identifier for the config */
  configId: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Template object with {{variable}} placeholders in string values */
  template: Record<string, unknown>;
  /** JSON Schema for validating input variables */
  varsSchema: JSONSchema;
}

/**
 * Result of rendering a config template
 */
export interface RenderedConfig {
  /** The fully resolved configuration object */
  config: Record<string, unknown>;
  /** Config identifier for tracing */
  configId: string;
  /** Version used */
  version: string;
  /** Variables that were applied */
  varsApplied: Record<string, unknown>;
}

// ============================================================================
// Review Rubric Types
// ============================================================================

/**
 * Single criterion in a review rubric
 */
export interface RubricCriterion {
  /** Criterion identifier (e.g., "visual_clarity") */
  name: string;
  /** What is being evaluated */
  description: string;
  /** Guidance on how to score (e.g., "1=poor, 5=excellent") */
  scoringGuidance: string;
  /** Relative importance (0-1), defaults to equal weight if omitted */
  weight?: number;
}

/**
 * Loaded review rubric
 */
export interface ReviewRubric {
  /** Unique identifier for the rubric */
  rubricId: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Evaluation criteria */
  criteria: RubricCriterion[];
  /** JSON Schema for expected critique output */
  outputSchema: JSONSchema;
}

// ============================================================================
// Service Result Types
// ============================================================================

/**
 * Successful result wrapper
 */
export interface RegistrySuccessResult<T> {
  ok: true;
  data: T;
}

/**
 * Error codes for registry operations
 */
export type RegistryErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RENDER_ERROR'
  | 'LOAD_ERROR';

/**
 * Error result wrapper
 */
export interface RegistryErrorResult {
  ok: false;
  error: string;
  errorCode: RegistryErrorCode;
  details?: {
    /** For VALIDATION_ERROR: list of validation issues */
    validationErrors?: Array<{
      field: string;
      message: string;
      value?: unknown;
    }>;
    /** For VERSION_NOT_FOUND: available versions */
    availableVersions?: string[];
  };
}

/**
 * Union result type for all registry operations
 */
export type RegistryResult<T> = RegistrySuccessResult<T> | RegistryErrorResult;

// ============================================================================
// Service Interface
// ============================================================================

/**
 * PromptRegistryService public API
 *
 * @example
 * ```typescript
 * // Get a specific version
 * const result = await registry.getPrompt('campaign_plan', '1.0.0');
 * if (result.ok) {
 *   console.log(result.data.template);
 * }
 *
 * // Get latest version
 * const latest = await registry.getPrompt('campaign_plan');
 *
 * // Render with variables
 * const rendered = await registry.renderPrompt('campaign_plan', '1.0.0', {
 *   brand_name: 'Acme',
 *   campaign_goal: 'awareness'
 * });
 * if (rendered.ok) {
 *   console.log(rendered.data.content);
 * }
 * ```
 */
export interface IPromptRegistryService {
  // ─────────────────────────────────────────────────────────────────────────
  // Prompt Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a prompt template by ID and optional version
   * @param promptId - Unique prompt identifier
   * @param version - Optional semver version (latest if omitted)
   */
  getPrompt(promptId: string, version?: string): RegistryResult<PromptTemplate>;

  /**
   * Render a prompt template with variable substitution
   * @param promptId - Unique prompt identifier
   * @param version - Semver version
   * @param vars - Variables to substitute in template
   */
  renderPrompt(
    promptId: string,
    version: string,
    vars: Record<string, unknown>,
  ): RegistryResult<RenderedPrompt>;

  /**
   * List all available prompt IDs
   */
  listPrompts(): string[];

  /**
   * List available versions for a prompt
   * @param promptId - Unique prompt identifier
   */
  listPromptVersions(promptId: string): string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Config Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a config template by ID and optional version
   * @param configId - Unique config identifier
   * @param version - Optional semver version (latest if omitted)
   */
  getConfig(configId: string, version?: string): RegistryResult<ConfigTemplate>;

  /**
   * Render a config template with variable substitution
   * @param configId - Unique config identifier
   * @param version - Semver version
   * @param vars - Variables to substitute in template
   */
  renderConfig(
    configId: string,
    version: string,
    vars: Record<string, unknown>,
  ): RegistryResult<RenderedConfig>;

  /**
   * List all available config IDs
   */
  listConfigs(): string[];

  /**
   * List available versions for a config
   * @param configId - Unique config identifier
   */
  listConfigVersions(configId: string): string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Rubric Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a review rubric by ID and optional version
   * @param rubricId - Unique rubric identifier
   * @param version - Optional semver version (latest if omitted)
   */
  getRubric(rubricId: string, version?: string): RegistryResult<ReviewRubric>;

  /**
   * List all available rubric IDs
   */
  listRubrics(): string[];

  /**
   * List available versions for a rubric
   * @param rubricId - Unique rubric identifier
   */
  listRubricVersions(rubricId: string): string[];
}

// ============================================================================
// Debug Recording Types (for integration with run_steps)
// ============================================================================

/**
 * Registry prompt debug data to be stored in run_steps.debug
 */
export interface RegistryPromptDebug {
  /** Prompt identifier */
  promptId: string;
  /** Version used */
  promptVersion: string;
  /** Variables provided by the skill */
  varsProvided: Record<string, unknown>;
  /** Full resolved prompt text (if under 10KB) */
  resolvedPrompt?: string;
  /** SHA-256 hash of resolved prompt (if full text omitted) */
  resolvedPromptHash?: string;
}

/**
 * Extended provider call structure with registry integration
 */
export interface ProviderCallWithRegistry {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  /** Registry prompt debug data */
  registryPrompt?: RegistryPromptDebug;
}
