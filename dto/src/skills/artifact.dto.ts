import { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID, Min, MaxLength, IsObject, Matches } from 'class-validator';

/**
 * DTO for creating a new artifact
 */
export class CreateArtifactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tenantId: string;

  @IsUUID()
  runId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'skillId must be lowercase alphanumeric with underscores' })
  skillId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  uri: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/, { message: 'contentHash must be 64 hex characters (SHA-256)' })
  contentHash: string;

  @IsNumber()
  @Min(0)
  sizeBytes: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  filename?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

/**
 * DTO for artifact query parameters
 */
export class ArtifactQueryDto {
  @IsUUID()
  @IsOptional()
  runId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  skillId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  type?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number;
}

/**
 * DTO for artifact response (read operations)
 */
export class ArtifactDto {
  id: string;
  tenantId: string;
  runId: string;
  skillId: string;
  type: string;
  uri: string;
  contentHash: string;
  sizeBytes: number;
  filename?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Artifact reference in skill results
 */
export interface ArtifactRefDto {
  id: string;
  type: string;
  uri: string;
  contentHash: string;
  sizeBytes: number;
  filename?: string;
  metadata?: Record<string, unknown>;
}
