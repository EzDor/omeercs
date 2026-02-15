import { IsString, IsOptional, IsInt, IsArray, IsUUID, MaxLength, ArrayMaxSize, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import type { CampaignConfig, ThemeConfig } from './campaign-config.interface';

export class CreateCampaignRequest {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  templateId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  config?: CampaignConfig;
}

export class UpdateCampaignRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  config?: Partial<CampaignConfig>;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

export class CampaignResponse {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  templateId: string;
  status: string;
  config: CampaignConfig | null;
  bundleUrl: string | null;
  thumbnailUrl: string | null;
  latestRunId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class GenerateResponse {
  campaignId: string;
  runId: string;
  status: 'generating';
}

export class BulkCampaignRequest {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  campaignIds: string[];
}

export class BulkOperationResponse {
  archived?: number;
  deleted?: number;
  skipped: number;
  errors: { id: string; reason: string }[];
}

export class CampaignRunsQuery {
  @IsOptional()
  @IsEnum(['queued', 'running', 'completed', 'failed', 'cancelled'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number = 0;
}

export class PublicCampaignResponse {
  campaignId: string;
  name: string;
  templateId: string;
  bundleUrl: string;
  config: {
    theme: ThemeConfig;
    game: Record<string, unknown>;
  };
}

export class CampaignListResponse {
  campaigns: CampaignResponse[];
  total: number;
  limit: number;
  offset: number;
}
