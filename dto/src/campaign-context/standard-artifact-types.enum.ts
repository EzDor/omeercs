export const StandardArtifactTypes = {
  PLAN: 'plan',
  INTRO_IMAGE: 'intro_image',
  INTRO_VIDEO: 'intro_video',
  BUTTON_SEGMENTATION: 'button_segmentation',
  BGM: 'bgm',
  SFX: 'sfx',
  AUDIO_MANIFEST: 'audio_manifest',
  GAME_CONFIG: 'game_config',
  GAME_BUNDLE: 'game_bundle',
  OUTCOME_WIN_VIDEO: 'outcome_win_video',
  OUTCOME_LOSE_VIDEO: 'outcome_lose_video',
  CAMPAIGN_MANIFEST: 'campaign_manifest',
  MODEL_3D: 'model_3d',
  TEXTURE: 'texture',
  ENVIRONMENT_MAP: 'environment_map',
} as const;

export type StandardArtifactType = (typeof StandardArtifactTypes)[keyof typeof StandardArtifactTypes];
