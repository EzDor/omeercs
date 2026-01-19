import { IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported change request types for partial rebuilds
 */
export type ChangeRequestType = 'audio.update' | 'intro.update' | 'outcome.update' | 'game_config.update' | 'asset3d.replace' | 'full_rebuild';

/**
 * Change request for triggering partial rebuilds
 */
export class ChangeRequest {
  @IsEnum(['audio.update', 'intro.update', 'outcome.update', 'game_config.update', 'asset3d.replace', 'full_rebuild'])
  type: ChangeRequestType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

/**
 * Request to trigger an update run (partial rebuild)
 */
export class TriggerUpdateRequest {
  @ValidateNested()
  @Type(() => ChangeRequest)
  changeRequest: ChangeRequest;
}
