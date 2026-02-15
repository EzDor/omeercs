import { IsString, IsOptional, IsInt, IsArray, IsUUID, IsObject, IsUrl, MaxLength, ArrayMaxSize, ValidateNested, IsEnum, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import type { CampaignConfig, ThemeConfig } from './campaign-config.interface';

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^rgb\(\d{1,3},\s?\d{1,3},\s?\d{1,3}\)$/;

export class BackgroundConfigDto {
  @IsEnum(['solid', 'gradient', 'image'])
  type: 'solid' | 'gradient' | 'image';

  @IsString()
  value: string;
}

export class ThemeConfigDto {
  @IsString()
  @Matches(COLOR_PATTERN, { message: 'primaryColor must be a hex (#fff or #ffffff) or rgb(r,g,b) color' })
  primaryColor: string;

  @IsString()
  @Matches(COLOR_PATTERN, { message: 'secondaryColor must be a hex (#fff or #ffffff) or rgb(r,g,b) color' })
  secondaryColor: string;

  @IsString()
  @Matches(COLOR_PATTERN, { message: 'accentColor must be a hex (#fff or #ffffff) or rgb(r,g,b) color' })
  accentColor: string;

  @IsString()
  @MaxLength(100)
  fontFamily: string;

  @ValidateNested()
  @Type(() => BackgroundConfigDto)
  background: BackgroundConfigDto;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}

export class CampaignAssetSlotDto {
  @IsString()
  slotId: string;

  @IsOptional()
  @IsString()
  artifactId?: string;

  @IsOptional()
  @IsUrl()
  url?: string;
}

export class CampaignConfigDto {
  @ValidateNested()
  @Type(() => ThemeConfigDto)
  theme: ThemeConfigDto;

  @IsObject()
  game: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignAssetSlotDto)
  assets: CampaignAssetSlotDto[];
}

export class CreateCampaignRequest {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  templateId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignConfigDto)
  config?: CampaignConfig;
}

export class UpdateCampaignRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignConfigDto)
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
