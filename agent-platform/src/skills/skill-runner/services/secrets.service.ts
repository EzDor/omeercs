import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsAccessor } from '../interfaces/skill-policy.interface';

/**
 * Service for providing secrets access to skill handlers.
 * Wraps ConfigService to provide a controlled interface for accessing secrets.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  /** Prefix for skill-specific secrets in environment */
  private readonly secretPrefix: string;

  /** List of allowed secret keys (whitelist) */
  private readonly allowedSecrets: Set<string>;

  constructor(private readonly configService: ConfigService) {
    this.secretPrefix = configService.get<string>('SKILLS_SECRET_PREFIX') || 'SKILL_SECRET_';

    // Common API keys that skills might need
    const defaultAllowedSecrets = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'LITELLM_MASTER_KEY', 'LITELLM_BASE_URL'];

    const configuredSecrets = configService.get<string>('SKILLS_ALLOWED_SECRETS')?.split(',') || [];

    this.allowedSecrets = new Set([...defaultAllowedSecrets, ...configuredSecrets]);
  }

  /**
   * Create a SecretsAccessor for a skill execution.
   * The accessor provides controlled access to environment secrets.
   *
   * @param skillId The skill identifier (for logging/auditing)
   * @param allowedProviders Optional list of providers this skill is allowed to use
   * @returns A SecretsAccessor instance
   */
  createAccessor(skillId: string, allowedProviders?: string[]): SecretsAccessor {
    return {
      /**
       * Get a secret value by key.
       * Returns undefined if the key is not in the allowed list.
       */
      get: (key: string): string | undefined => {
        if (!this.isAllowed(key, allowedProviders)) {
          this.logger.warn(`Skill ${skillId} attempted to access unauthorized secret: ${key}`);
          return undefined;
        }

        // Check for prefixed version first
        const prefixedKey = `${this.secretPrefix}${key}`;
        const prefixedValue = this.configService.get<string>(prefixedKey);
        if (prefixedValue) {
          return prefixedValue;
        }

        // Fall back to direct key access
        return this.configService.get<string>(key);
      },

      /**
       * Check if a secret exists.
       */
      has: (key: string): boolean => {
        if (!this.isAllowed(key, allowedProviders)) {
          return false;
        }

        const prefixedKey = `${this.secretPrefix}${key}`;
        return this.configService.get<string>(prefixedKey) !== undefined || this.configService.get<string>(key) !== undefined;
      },

      /**
       * List all available (allowed) secret keys.
       * Only returns keys that actually have values configured.
       */
      keys: (): string[] => {
        return Array.from(this.allowedSecrets).filter((key) => {
          if (!this.isAllowed(key, allowedProviders)) return false;
          const prefixedKey = `${this.secretPrefix}${key}`;
          return this.configService.get<string>(prefixedKey) !== undefined || this.configService.get<string>(key) !== undefined;
        });
      },
    };
  }

  /**
   * Check if a secret key is allowed to be accessed.
   */
  private isAllowed(key: string, allowedProviders?: string[]): boolean {
    // Check if key is in the global allowed list
    if (!this.allowedSecrets.has(key)) {
      return false;
    }

    // If skill has provider restrictions, check if the key is for an allowed provider
    if (allowedProviders && allowedProviders.length > 0) {
      // Provider-specific keys follow pattern: <PROVIDER>_API_KEY
      const providerMatch = key.match(/^([A-Z]+)_API_KEY$/);
      if (providerMatch) {
        const provider = providerMatch[1].toLowerCase();
        return allowedProviders.some((p) => p.toLowerCase() === provider);
      }
    }

    return true;
  }
}
