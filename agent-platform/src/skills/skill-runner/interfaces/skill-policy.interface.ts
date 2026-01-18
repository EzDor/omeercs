/**
 * Accessor for skill secrets (API keys, credentials)
 */
export interface SecretsAccessor {
  /**
   * Get a secret value by key
   * @param key Secret key (e.g., 'OPENAI_API_KEY')
   * @returns Secret value or undefined if not found
   */
  get(key: string): string | undefined;

  /**
   * Check if a secret exists
   * @param key Secret key
   * @returns true if the secret exists
   */
  has(key: string): boolean;

  /**
   * List all available secret keys
   * @returns Array of secret key names
   */
  keys(): string[];
}

/**
 * Filesystem access level for skills
 */
export type FilesystemAccess = 'workspace' | 'readonly' | 'none';

/**
 * Policy constraints from skill descriptor
 */
export interface SkillPolicy {
  /** Execution timeout in milliseconds (default: 60000) */
  timeout_ms: number;
  /** Maximum retry attempts (default: 0) */
  max_retries?: number;
  /** Allowed providers for this skill */
  allowed_providers?: string[];
  /** Whether network access is permitted (default: true) */
  network_access?: boolean;
  /** Filesystem access level (default: 'workspace') */
  filesystem_access?: FilesystemAccess;
}

/**
 * Default policy values
 */
export const DEFAULT_SKILL_POLICY: SkillPolicy = {
  timeout_ms: 60000,
  max_retries: 0,
  network_access: true,
  filesystem_access: 'workspace',
};
