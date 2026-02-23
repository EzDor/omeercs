import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignUpdateAudioWorkflow: WorkflowSpec = {
  workflowName: 'campaign.update_audio',
  version: '1.0.0',
  description: 'Update audio tracks (BGM, SFX) for an existing campaign without full rebuild',
  steps: [
    {
      stepId: 'bgm',
      skillId: 'generate_bgm_track',
      dependsOn: [],
      description: 'Generate new background music track',
      inputSelector: inputSelector({
        style: merge(fromBaseRun('plan', 'data.audio_style'), fromTrigger('audio_overrides.style')),
        duration_sec: fromBaseRun('plan', 'data.duration_sec'),
        mood: merge(fromBaseRun('plan', 'data.mood'), fromTrigger('audio_overrides.mood')),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'sfx',
      skillId: 'generate_sfx_pack',
      dependsOn: [],
      description: 'Generate new sound effects pack',
      inputSelector: inputSelector({
        game_type: fromBaseRun('plan', 'data.game_type'),
        sfx_list: merge(fromBaseRun('plan', 'data.required_sfx'), fromTrigger('audio_overrides.sfx_list')),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'audio_mix',
      skillId: 'mix_audio_for_game',
      dependsOn: ['bgm', 'sfx'],
      description: 'Mix and normalize new audio tracks',
      inputSelector: inputSelector({
        bgm_track: fromStep('bgm', 'outputArtifactIds[0]'),
        sfx_pack: fromStep('sfx', 'outputArtifactIds'),
        target_loudness: constant(-14),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'bundle_game',
      skillId: 'bundle_game_template',
      dependsOn: ['audio_mix'],
      description: 'Rebundle game with new audio assets',
      inputSelector: inputSelector({
        game_config: fromBaseRun('game_config', 'data'),
        audio_assets: fromStep('audio_mix', 'outputArtifactIds'),
        template_id: fromBaseRun('plan', 'data.template_id'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'manifest',
      skillId: 'assemble_campaign_manifest',
      dependsOn: ['bundle_game'],
      description: 'Reassemble campaign manifest with new audio assets',
      inputSelector: inputSelector({
        campaign_id: fromTrigger('campaign_id'),
        intro_image: fromBaseRun('intro_image', 'outputArtifactIds[0]'),
        button_segmentation: fromBaseRun('intro_button_segmentation', 'data'),
        intro_video: fromBaseRun('intro_video', 'outputArtifactIds[0]'),
        game_bundle: fromStep('bundle_game', 'outputArtifactIds[0]'),
        outcome_win: fromBaseRun('outcome_win', 'outputArtifactIds[0]'),
        outcome_lose: fromBaseRun('outcome_lose', 'outputArtifactIds[0]'),
        plan_data: fromBaseRun('plan', 'data'),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      stepId: 'qa_bundle',
      skillId: 'validate_game_bundle',
      dependsOn: ['bundle_game'],
      description: 'Validate updated game bundle',
      inputSelector: inputSelector({
        bundle_url: fromStep('bundle_game', 'outputArtifactIds[0]'),
        validation_rules: constant({
          check_audio: true,
          check_textures: true,
          max_bundle_size_mb: 50,
        }),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
};
