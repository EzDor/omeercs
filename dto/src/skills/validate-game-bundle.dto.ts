import { IsString, IsNotEmpty, IsArray, IsOptional, IsBoolean } from 'class-validator';

/**
 * Severity levels for validation issues
 */
export type ValidationIssueSeverity = 'error' | 'warning' | 'info';

/**
 * Categories of validation checks
 */
export type ValidationCategory = 'structure' | 'manifest' | 'assets' | 'config' | 'performance' | 'compatibility' | 'security';

/**
 * Validation checks to perform
 */
export class ValidationChecks {
  @IsBoolean()
  @IsOptional()
  verify_structure?: boolean;

  @IsBoolean()
  @IsOptional()
  verify_manifest?: boolean;

  @IsBoolean()
  @IsOptional()
  verify_assets?: boolean;

  @IsBoolean()
  @IsOptional()
  verify_config?: boolean;

  @IsBoolean()
  @IsOptional()
  verify_checksums?: boolean;

  @IsBoolean()
  @IsOptional()
  check_performance?: boolean;

  @IsBoolean()
  @IsOptional()
  check_compatibility?: boolean;

  @IsBoolean()
  @IsOptional()
  check_security?: boolean;
}

/**
 * Input DTO for validate_game_bundle skill
 */
export class ValidateGameBundleInput {
  @IsString()
  @IsNotEmpty()
  bundle_uri: string;

  @IsOptional()
  checks?: ValidationChecks;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  target_platforms?: ('web' | 'mobile' | 'desktop')[];

  @IsBoolean()
  @IsOptional()
  strict_mode?: boolean;
}

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationIssueSeverity;
  category: ValidationCategory;
  file?: string;
  line?: number;
  suggestion?: string;
}

/**
 * Summary of validation results by category
 */
export interface ValidationSummary {
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  warnings: number;
  errors: number;
  by_category: Record<ValidationCategory, { passed: number; failed: number; warnings: number }>;
}

/**
 * Performance metrics from validation
 */
export interface BundlePerformanceMetrics {
  total_size_bytes: number;
  largest_file: { path: string; size_bytes: number };
  asset_breakdown: {
    images_bytes: number;
    audio_bytes: number;
    video_bytes: number;
    models_bytes: number;
    code_bytes: number;
    other_bytes: number;
  };
  estimated_load_time_ms: number;
  compression_ratio?: number;
}

/**
 * Output DTO for validate_game_bundle skill
 */
export interface ValidateGameBundleOutput {
  pass: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  bundle_info: {
    bundle_id?: string;
    template_id?: string;
    version?: string;
    entry_point?: string;
    file_count: number;
  };
  performance?: BundlePerformanceMetrics;
  compatibility?: {
    web: boolean;
    mobile: boolean;
    desktop: boolean;
    issues_by_platform?: Record<string, ValidationIssue[]>;
  };
}
