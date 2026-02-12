import { randomUUID } from 'crypto';

export type WorkflowName =
  | 'campaign.build'
  | 'campaign.build.minimal'
  | 'campaign.update_audio'
  | 'campaign.update_game_config'
  | 'campaign.update_intro'
  | 'campaign.update_outcome'
  | 'campaign.replace_3d_asset';

export const VALID_WORKFLOWS: WorkflowName[] = [
  'campaign.build',
  'campaign.build.minimal',
  'campaign.update_audio',
  'campaign.update_game_config',
  'campaign.update_intro',
  'campaign.update_outcome',
  'campaign.replace_3d_asset',
];

export const VALID_TEMPLATES = ['spin_wheel', 'scratch_card', 'slot_machine', 'memory_match', 'catch_game', 'quiz'] as const;
export type TemplateName = (typeof VALID_TEMPLATES)[number];

export interface PayloadOptions {
  campaignName?: string;
  templateId?: TemplateName;
  baseRunId?: string;
}

export function buildPayload(workflowName: WorkflowName, options: PayloadOptions): Record<string, unknown> {
  const { campaignName = 'Test Campaign', templateId = 'spin_wheel', baseRunId } = options;

  switch (workflowName) {
    case 'campaign.build':
      return buildCampaignBuildPayload(campaignName);

    case 'campaign.build.minimal':
      return buildCampaignBuildMinimalPayload(campaignName, templateId);

    case 'campaign.update_audio':
      return buildUpdateAudioPayload(baseRunId);

    case 'campaign.update_game_config':
      return buildUpdateGameConfigPayload(baseRunId);

    case 'campaign.update_intro':
      return buildUpdateIntroPayload(baseRunId);

    case 'campaign.update_outcome':
      return buildUpdateOutcomePayload(baseRunId);

    case 'campaign.replace_3d_asset':
      return buildReplace3dAssetPayload(baseRunId);

    default:
      throw new Error(`Unknown workflow: ${workflowName}`);
  }
}

function buildCampaignBuildPayload(campaignName: string): Record<string, unknown> {
  return {
    campaign_id: randomUUID(),
    brief: {
      campaign_name: campaignName,
      brand_name: 'Test Brand',
      objective: 'Engage users with an interactive game experience',
      target_audience: 'Adults 18-45',
      tone: 'Fun and exciting',
      key_messages: ['Win big prizes', 'Easy to play'],
    },
    brand_assets: {
      logo_url: 'https://example.com/logo.png',
      primary_color: '#FF5733',
      secondary_color: '#33FF57',
      font_family: 'Arial',
    },
    constraints: {
      duration_sec: 30,
      intro_duration_sec: 5,
      difficulty: 'medium',
      max_bundle_size_mb: 50,
    },
  };
}

function buildCampaignBuildMinimalPayload(campaignName: string, templateId: TemplateName): Record<string, unknown> {
  return {
    campaign_id: randomUUID(),
    campaign_name: campaignName,
    template_id: templateId,
    theme: 'modern vibrant',
    difficulty: {
      level: 'medium',
      win_probability: 0.3,
    },
    color_scheme: {
      primary: '#FF5733',
      secondary: '#33FF57',
      background: '#FFFFFF',
    },
    copy: {
      title: campaignName,
      instructions: 'Spin the wheel to win prizes!',
    },
    audio: {
      style: {
        genre: 'upbeat',
        mood: 'happy',
        energy_level: 0.8,
      },
      duration_sec: 30,
      prompt: 'Exciting game music with electronic beats',
    },
    intro_video_uri: null,
    outcome_videos: {
      win: null,
      lose: null,
    },
    button_config: {
      text: 'PLAY NOW',
      position: 'center',
    },
    rules: {
      max_plays: 3,
      win_probability: 0.3,
    },
    branding: {
      logo_url: 'https://example.com/logo.png',
      company_name: 'Test Company',
    },
  };
}

function buildUpdateAudioPayload(baseRunId?: string): Record<string, unknown> {
  if (!baseRunId) {
    throw new Error('base_run_id is required for campaign.update_audio workflow');
  }
  return {
    campaign_id: randomUUID(),
    base_run_id: baseRunId,
    audio_overrides: {
      style: 'energetic',
      mood: 'exciting',
      sfx_list: ['win_chime', 'spin_click', 'celebration'],
    },
  };
}

function buildUpdateGameConfigPayload(baseRunId?: string): Record<string, unknown> {
  if (!baseRunId) {
    throw new Error('base_run_id is required for campaign.update_game_config workflow');
  }
  return {
    campaign_id: randomUUID(),
    base_run_id: baseRunId,
    game_overrides: {
      difficulty: 'hard',
      parameters: {
        spin_speed: 1.5,
        prize_distribution: [0.1, 0.2, 0.3, 0.4],
      },
    },
  };
}

function buildUpdateIntroPayload(baseRunId?: string): Record<string, unknown> {
  if (!baseRunId) {
    throw new Error('base_run_id is required for campaign.update_intro workflow');
  }
  return {
    campaign_id: randomUUID(),
    base_run_id: baseRunId,
    brand_assets: {
      logo_url: 'https://example.com/logo.png',
      primary_color: '#FF5733',
    },
    intro_overrides: {
      style_guide: {
        theme: 'vibrant',
        lighting: 'bright',
      },
      scene_description: 'A colorful game show stage with spotlights',
      button_style: {
        shape: 'rounded',
        glow: true,
      },
      animation_style: 'bounce',
    },
  };
}

function buildUpdateOutcomePayload(baseRunId?: string): Record<string, unknown> {
  if (!baseRunId) {
    throw new Error('base_run_id is required for campaign.update_outcome workflow');
  }
  return {
    campaign_id: randomUUID(),
    base_run_id: baseRunId,
    brand_assets: {
      logo_url: 'https://example.com/logo.png',
      primary_color: '#FF5733',
    },
    outcome_overrides: {
      style_guide: {
        theme: 'celebration',
      },
      win_message: 'Congratulations! You won!',
      lose_message: 'Better luck next time!',
    },
  };
}

function buildReplace3dAssetPayload(baseRunId?: string): Record<string, unknown> {
  if (!baseRunId) {
    throw new Error('base_run_id is required for campaign.replace_3d_asset workflow');
  }
  return {
    campaign_id: randomUUID(),
    base_run_id: baseRunId,
    asset_prompt: 'A shiny golden trophy with a star on top',
    asset_slot: 'prize_display',
    asset_constraints: {
      max_poly_count: 10000,
      texture_resolution: 1024,
    },
    optimization_params: {
      generate_lod: true,
      compress_textures: true,
    },
  };
}

export function requiresBaseRun(workflowName: WorkflowName): boolean {
  return workflowName !== 'campaign.build' && workflowName !== 'campaign.build.minimal';
}
