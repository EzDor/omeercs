import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignUpdateGameConfigWorkflow: WorkflowSpec = {
  workflowName: 'campaign.update_game_config',
  version: '1.0.0',
  description: 'Update game parameters (difficulty, speed, target score, theme) without regenerating media assets',
  steps: [
    {
      stepId: 'game_config',
      skillId: 'game_config_from_template',
      dependsOn: [],
      description: 'Generate new game configuration with parameter overrides',
      inputSelector: inputSelector({
        game_type: fromBaseRun('plan', 'data.game_type'),
        difficulty: merge(fromBaseRun('game_config', 'data.difficulty'), fromTrigger('game_overrides.difficulty')),
        parameters: merge(fromBaseRun('plan', 'data.game_parameters'), fromTrigger('game_overrides.parameters')),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'bundle_game',
      skillId: 'bundle_game_template',
      dependsOn: ['game_config'],
      description: 'Rebundle game with new configuration',
      inputSelector: inputSelector({
        game_config: fromStep('game_config', 'data'),
        audio_assets: fromBaseRun('audio_mix', 'outputArtifactIds'),
        template_id: fromBaseRun('plan', 'data.template_id'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'manifest',
      skillId: 'assemble_campaign_manifest',
      dependsOn: ['bundle_game'],
      description: 'Reassemble campaign manifest with new game bundle',
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
