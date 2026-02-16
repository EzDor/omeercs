import { IsString, IsOptional, IsUUID, IsNumber, Min, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BudgetRangeDto {
  @IsNumber()
  @Min(0)
  min: number;

  @IsNumber()
  @Min(0)
  max: number;
}

export class PlanConstraintsDto {
  @IsOptional()
  @IsString()
  template_preference?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetRangeDto)
  budget_range?: BudgetRangeDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  target_audience?: string;
}

export class GeneratePlanRequest {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  brief: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlanConstraintsDto)
  constraints?: PlanConstraintsDto;

  @IsOptional()
  @IsUUID()
  campaign_id?: string;
}

export class AcceptPlanRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  campaign_name?: string;
}

export class RecommendedTemplate {
  template_id: string;
  template_name: string;
  reasoning: string;
  confidence: number;
}

export class PlanTheme {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  mood: string;
}

export class PrizeTier {
  tier: 'grand' | 'secondary' | 'consolation';
  suggestion: string;
  probability: number;
  estimated_cost?: string;
}

export class AssetRequirement {
  type: string;
  purpose: string;
  generation_prompt?: string;
}

export class PlanOutput {
  summary: string;
  recommended_template: RecommendedTemplate;
  theme: PlanTheme;
  prize_tiers: PrizeTier[];
  estimated_engagement: 'high' | 'medium' | 'low';
  asset_requirements: AssetRequirement[];
  warnings?: string[];
}

export class GeneratePlanResponse {
  generation_id: string;
  plan: PlanOutput;
  duration_ms: number;
}

export class AcceptPlanResponse {
  campaign_id: string;
  campaign_name: string;
  status: 'draft';
  template_id: string;
  config: Record<string, unknown>;
}
