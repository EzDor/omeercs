import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported artifact types for review
 */
export type ReviewArtifactType = 'image' | 'video' | 'audio' | '3d_model' | 'json';

/**
 * Quality rubric IDs
 */
export type QualityRubricId = 'brand_consistency' | 'technical_quality' | 'accessibility' | 'performance' | 'general';

/**
 * Artifact reference for quality review
 */
export class ReviewArtifactRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsEnum(['image', 'video', 'audio', '3d_model', 'json'])
  type: ReviewArtifactType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

/**
 * Review context
 */
export class ReviewContext {
  @IsString()
  @IsOptional()
  brand_guidelines?: string;

  @IsString()
  @IsEnum(['web', 'mobile', 'desktop', 'all'])
  @IsOptional()
  target_platform?: 'web' | 'mobile' | 'desktop' | 'all';

  @IsString()
  @IsEnum(['strict', 'standard', 'lenient'])
  @IsOptional()
  quality_threshold?: 'strict' | 'standard' | 'lenient';
}

/**
 * Input DTO for review_asset_quality skill
 */
export class ReviewAssetQualityInput {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewArtifactRef)
  artifact_refs: ReviewArtifactRef[];

  @IsString()
  @IsEnum(['brand_consistency', 'technical_quality', 'accessibility', 'performance', 'general'])
  rubric_id: QualityRubricId;

  @ValidateNested()
  @Type(() => ReviewContext)
  @IsOptional()
  context?: ReviewContext;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Issue severity levels
 */
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'info';

/**
 * Issue found during review
 */
export interface ReviewIssue {
  severity: IssueSeverity;
  category: string;
  description: string;
  location?: string;
}

/**
 * Suggested fix for an issue
 */
export interface SuggestedFix {
  issue_index: number;
  suggestion: string;
  effort?: 'trivial' | 'minor' | 'moderate' | 'major';
  automated?: boolean;
}

/**
 * Individual artifact review result
 */
export interface ArtifactReview {
  artifact_uri: string;
  artifact_name?: string;
  pass: boolean;
  score: number;
  issues: ReviewIssue[];
  suggested_fixes: SuggestedFix[];
}

/**
 * Output DTO for review_asset_quality skill
 */
export interface ReviewAssetQualityOutput {
  pass: boolean;
  overall_score: number;
  reviews: ArtifactReview[];
  summary: string;
}
