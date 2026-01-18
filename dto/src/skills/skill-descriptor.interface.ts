/**
 * SkillDescriptor - Defines the contract for a skill in the catalog
 * Based on spec-01-skills-catalog.md
 */

export type SkillImplementationType = 'ts_function' | 'http_call' | 'cli_command';

export interface SkillImplementation {
  /** Implementation type */
  type: SkillImplementationType;
  /** Module path for ts_function, URL for http_call, command template for cli_command */
  handler: string;
}

export interface SkillArtifactDescriptor {
  /** Artifact type (e.g., 'audio/wav', 'video/mp4', 'model/gltf', 'json/config') */
  artifact_type: string;
  /** Description of the artifact */
  description?: string;
}

export interface SkillPolicy {
  /** Maximum runtime in seconds */
  max_runtime_sec: number;
  /** Network access policy */
  network: 'none' | 'allowlist';
  /** Allowed network hosts (when network is 'allowlist') */
  allowed_hosts?: string[];
  /** Filesystem access - allowed read/write prefixes */
  fs?: {
    read_prefixes?: string[];
    write_prefixes?: string[];
  };
}

export interface SkillObservability {
  /** Default log level */
  log_level_default: 'debug' | 'info' | 'warn' | 'error';
  /** Whether to emit metrics */
  emit_metrics: boolean;
}

export interface SkillDescriptor {
  /** Stable unique identifier */
  skill_id: string;
  /** Semantic version string */
  version: string;
  /** Short display name */
  title: string;
  /** Detailed description */
  description: string;
  /** Categorization tags */
  tags: string[];
  /** JSON Schema for input validation */
  input_schema: Record<string, unknown>;
  /** JSON Schema for output validation */
  output_schema: Record<string, unknown>;
  /** Implementation details */
  implementation: SkillImplementation;
  /** List of artifacts this skill produces */
  produces_artifacts: SkillArtifactDescriptor[];
  /** Execution policy */
  policy: SkillPolicy;
  /** Observability configuration */
  observability: SkillObservability;
}
