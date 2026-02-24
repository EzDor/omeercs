export const CAMPAIGN_BUILD = 'campaign.build';
export const CAMPAIGN_BUILD_MINIMAL = 'campaign.build.minimal';
export const CAMPAIGN_UPDATE_INTRO = 'campaign.update_intro';
export const CAMPAIGN_UPDATE_AUDIO = 'campaign.update_audio';
export const CAMPAIGN_UPDATE_OUTCOME = 'campaign.update_outcome';
export const CAMPAIGN_UPDATE_GAME_CONFIG = 'campaign.update_game_config';
export const CAMPAIGN_REPLACE_3D_ASSET = 'campaign.replace_3d_asset';

export const ALL_CAMPAIGN_WORKFLOW_TYPES = [
  CAMPAIGN_BUILD,
  CAMPAIGN_BUILD_MINIMAL,
  CAMPAIGN_UPDATE_INTRO,
  CAMPAIGN_UPDATE_AUDIO,
  CAMPAIGN_UPDATE_OUTCOME,
  CAMPAIGN_UPDATE_GAME_CONFIG,
  CAMPAIGN_REPLACE_3D_ASSET,
] as const;

export type CampaignWorkflowType = (typeof ALL_CAMPAIGN_WORKFLOW_TYPES)[number];
