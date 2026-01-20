import { IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type ChangeRequestType = 'audio.update' | 'intro.update' | 'outcome.update' | 'game_config.update' | 'asset3d.replace' | 'full_rebuild';

export class ChangeRequest {
  @IsEnum(['audio.update', 'intro.update', 'outcome.update', 'game_config.update', 'asset3d.replace', 'full_rebuild'])
  type: ChangeRequestType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class TriggerUpdateRequest {
  @ValidateNested()
  @Type(() => ChangeRequest)
  changeRequest: ChangeRequest;
}
