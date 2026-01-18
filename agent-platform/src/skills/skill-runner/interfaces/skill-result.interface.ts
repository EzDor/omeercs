/**
 * Re-export the SkillResult types from dto for compatibility
 */
export type { SkillResult, SkillArtifact, SkillDebugInfo as DtoSkillDebugInfo } from '@agentic-template/dto/src/skills/skill-result.interface';
export { skillSuccess as dtoSkillSuccess, skillFailure as dtoSkillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';

/**
 * Extended artifact reference with additional registration metadata
 * Used by the artifact registry for tracking registered artifacts
 */
export interface ArtifactRef {
  /** Unique artifact ID (UUID) */
  id: string;
  /** MIME type or artifact type (e.g., 'audio/wav', 'video/mp4') */
  type: string;
  /** Storage URI (file://, s3://, gs://, https://) */
  uri: string;
  /** SHA-256 hash of content (64 hex chars) */
  contentHash: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Original filename (optional) */
  filename?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Timing breakdown for skill execution phases
 */
export interface SkillTimingInfo {
  /** Time spent validating input (ms) */
  input_validation_ms: number;
  /** Time spent executing handler (ms) */
  execution_ms: number;
  /** Time spent validating output (ms) */
  output_validation_ms: number;
  /** Time spent registering artifacts (ms) */
  artifact_registration_ms: number;
}

/**
 * Enhanced debug information for skill execution
 * Extends the base SkillDebugInfo with additional fields
 */
export interface EnhancedSkillDebugInfo {
  /** Unique run ID for this execution */
  run_id: string;
  /** Skill ID that was executed */
  skill_id: string;
  /** Version of the skill that was executed */
  version: string;
  /** Total execution duration in milliseconds */
  duration_ms: number;
  /** Timing breakdown by phase */
  timing: SkillTimingInfo;
  /** Provider used (if applicable) */
  provider?: string;
  /** Model used (if applicable) */
  model?: string;
  /** Timings in the format expected by dto SkillDebugInfo */
  timings_ms?: { total: number; [step: string]: number };
}

/**
 * Convert EnhancedSkillDebugInfo to dto SkillDebugInfo format
 */
export function toSkillDebugInfo(enhanced: EnhancedSkillDebugInfo): import('@agentic-template/dto/src/skills/skill-result.interface').SkillDebugInfo {
  return {
    timings_ms: {
      total: enhanced.duration_ms,
      input_validation: enhanced.timing.input_validation_ms,
      execution: enhanced.timing.execution_ms,
      output_validation: enhanced.timing.output_validation_ms,
      artifact_registration: enhanced.timing.artifact_registration_ms,
    },
  };
}

/**
 * Convert ArtifactRef to dto SkillArtifact format
 */
export function toSkillArtifact(ref: ArtifactRef): import('@agentic-template/dto/src/skills/skill-result.interface').SkillArtifact {
  return {
    artifact_type: ref.type,
    uri: ref.uri,
    content_hash: ref.contentHash,
    metadata: {
      ...ref.metadata,
      id: ref.id,
      sizeBytes: ref.sizeBytes,
      filename: ref.filename,
    },
  };
}
