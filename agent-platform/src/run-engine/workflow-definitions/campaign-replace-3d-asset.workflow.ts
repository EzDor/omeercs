import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignReplace3dAssetWorkflow: WorkflowSpec = {
  workflowName: 'campaign.replace_3d_asset',
  version: '1.0.0',
  description: 'Replace a 3D asset in an existing campaign with a newly generated and optimized model',
  steps: [
    {
      stepId: 'generate_3d_asset',
      skillId: 'generate_3d_asset',
      dependsOn: [],
      description: 'Generate new 3D asset from prompt and constraints',
      inputSelector: inputSelector({
        prompt: fromTrigger('asset_prompt'),
        constraints: merge(fromBaseRun('plan', 'data.asset_constraints'), fromTrigger('asset_constraints')),
        style_guide: fromBaseRun('plan', 'data.style_guide'),
        asset_slot: fromTrigger('asset_slot'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    },
    {
      stepId: 'optimize_3d_asset',
      skillId: 'optimize_3d_asset',
      dependsOn: ['generate_3d_asset'],
      description: 'Optimize 3D asset for game engine (poly count, textures, LOD)',
      inputSelector: inputSelector({
        asset_url: fromStep('generate_3d_asset', 'outputArtifactIds[0]'),
        optimization_params: merge(fromBaseRun('plan', 'data.optimization_defaults'), fromTrigger('optimization_params')),
        target_platform: fromBaseRun('plan', 'data.target_platform'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'bundle_game',
      skillId: 'bundle_game_template',
      dependsOn: ['optimize_3d_asset'],
      description: 'Rebundle game with replaced 3D asset',
      inputSelector: inputSelector({
        game_config: fromBaseRun('game_config', 'data'),
        audio_assets: fromBaseRun('audio_mix', 'outputArtifactIds'),
        template_id: fromBaseRun('plan', 'data.template_id'),
        replacement_assets: fromStep('optimize_3d_asset', 'outputArtifactIds'),
        asset_slot: fromTrigger('asset_slot'),
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
      description: 'Validate updated game bundle with new 3D asset',
      inputSelector: inputSelector({
        bundle_url: fromStep('bundle_game', 'outputArtifactIds[0]'),
        validation_rules: constant({
          check_audio: true,
          check_textures: true,
          check_3d_assets: true,
          max_bundle_size_mb: 50,
        }),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
};
