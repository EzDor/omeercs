/**
 * SkillResult - Standard output envelope for skill execution
 * Based on spec-01-skills-catalog.md
 */

export interface SkillArtifact {
  /** Artifact type (e.g., 'audio/wav', 'video/mp4', 'model/gltf', 'json/config') */
  artifact_type: string;
  /** Object storage path or local path depending on environment */
  uri: string;
  /** Content hash for cache validation (best-effort) */
  content_hash?: string;
  /** Additional metadata (provider/model, duration, resolution, etc.) */
  metadata?: Record<string, unknown>;
}

export interface SkillProviderCall {
  /** Provider name (e.g., 'claude', 'openai', 'replicate') */
  provider: string;
  /** Model used */
  model?: string;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Token counts if applicable */
  tokens?: {
    input: number;
    output: number;
  };
  /** Cost if available */
  cost_usd?: number;
}

export interface SkillDebugInfo {
  /** URI to detailed logs */
  logs_uri?: string;
  /** Timing breakdown in milliseconds */
  timings_ms: {
    total: number;
    [step: string]: number;
  };
  /** Provider calls made during execution */
  provider_calls?: SkillProviderCall[];
  /** Number of retry attempts (for retryable operations) */
  attempts?: number;
}

export interface SkillResult<T = unknown> {
  /** Whether the skill executed successfully */
  ok: boolean;
  /** Output data matching the skill's output_schema (when ok is true) */
  data?: T;
  /** Error message (when ok is false) */
  error?: string;
  /** Error code for programmatic handling */
  error_code?: string;
  /** Produced artifacts */
  artifacts: SkillArtifact[];
  /** Debug information */
  debug: SkillDebugInfo;
}

/**
 * Helper to create a successful SkillResult
 */
export function skillSuccess<T>(data: T, artifacts: SkillArtifact[] = [], debug: SkillDebugInfo): SkillResult<T> {
  return {
    ok: true,
    data,
    artifacts,
    debug,
  };
}

/**
 * Helper to create a failed SkillResult
 */
export function skillFailure(error: string, error_code?: string, debug?: Partial<SkillDebugInfo>): SkillResult<never> {
  return {
    ok: false,
    error,
    error_code,
    artifacts: [],
    debug: {
      timings_ms: { total: 0 },
      ...debug,
    },
  };
}
