import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, constant } from './input-helpers';

export const campaignBuildMinimalWorkflow: WorkflowSpec = {
  workflowName: 'campaign.build.minimal',
  version: '1.0.0',
  description: 'Minimal campaign build for reference implementation testing - 4 steps',
  steps: [
    {
      stepId: 'game_config',
      skillId: 'game_config_from_template',
      dependsOn: [],
      description: 'Generate game configuration from template',
      inputSelector: inputSelector({
        template_id: fromTrigger('template_id'),
        theme: fromTrigger('theme'),
        difficulty: fromTrigger('difficulty'),
        color_scheme: fromTrigger('color_scheme'),
        copy: fromTrigger('copy'),
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'bgm',
      skillId: 'generate_bgm_track',
      dependsOn: [],
      description: 'Generate background music track',
      inputSelector: inputSelector({
        style: fromTrigger('audio.style'),
        duration_sec: fromTrigger('audio.duration_sec'),
        custom_prompt: fromTrigger('audio.prompt'),
        loopable: constant(true),
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'bundle_game',
      skillId: 'bundle_game_template',
      dependsOn: ['game_config', 'bgm'],
      description: 'Bundle game template with assets',
      inputSelector: inputSelector({
        game_config: fromStep('game_config', 'data'),
        audio_uri: fromStep('bgm', 'audio_uri'),
        template_id: fromTrigger('template_id'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'manifest',
      skillId: 'assemble_campaign_manifest',
      dependsOn: ['bundle_game'],
      description: 'Assemble final campaign manifest with all assets',
      inputSelector: inputSelector({
        campaign_id: fromTrigger('campaign_id'),
        campaign_name: fromTrigger('campaign_name'),
        intro_video_uri: fromTrigger('intro_video_uri'),
        outcome_videos: fromTrigger('outcome_videos'),
        game_bundle_uri: fromStep('bundle_game', 'data.bundle_uri'),
        button_config: fromTrigger('button_config'),
        rules: fromTrigger('rules'),
        branding: fromTrigger('branding'),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
};
