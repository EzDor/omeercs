import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignUpdateIntroWorkflow: WorkflowSpec = {
  workflowName: 'campaign.update_intro',
  version: '1.0.0',
  description: 'Update intro visuals (image, button segmentation, video loop) while preserving other assets',
  steps: [
    {
      stepId: 'intro_image',
      skillId: 'generate_intro_image',
      dependsOn: [],
      description: 'Generate new intro image with style overrides',
      inputSelector: inputSelector({
        style_guide: merge(fromBaseRun('plan', 'data.style_guide'), fromTrigger('intro_overrides.style_guide')),
        brand_assets: fromTrigger('brand_assets'),
        scene_description: merge(fromBaseRun('plan', 'data.intro_scene'), fromTrigger('intro_overrides.scene_description')),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'intro_button_segmentation',
      skillId: 'segment_start_button',
      dependsOn: ['intro_image'],
      description: 'Detect and segment start button in new intro image',
      inputSelector: inputSelector({
        image_url: fromStep('intro_image', 'outputArtifactIds[0]'),
        button_style: merge(fromBaseRun('plan', 'data.ui_style'), fromTrigger('intro_overrides.button_style')),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'intro_video',
      skillId: 'generate_intro_video_loop',
      dependsOn: ['intro_image'],
      description: 'Generate new looping intro video from new intro image',
      inputSelector: inputSelector({
        source_image: fromStep('intro_image', 'outputArtifactIds[0]'),
        animation_style: merge(fromBaseRun('plan', 'data.animation_style'), fromTrigger('intro_overrides.animation_style')),
        duration_sec: fromBaseRun('plan', 'data.intro_duration_sec'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    },
    {
      stepId: 'manifest',
      skillId: 'assemble_campaign_manifest',
      dependsOn: ['intro_button_segmentation', 'intro_video'],
      description: 'Reassemble campaign manifest with new intro visuals',
      inputSelector: inputSelector({
        campaign_id: fromTrigger('campaign_id'),
        intro_image: fromStep('intro_image', 'outputArtifactIds[0]'),
        button_segmentation: fromStep('intro_button_segmentation', 'data'),
        intro_video: fromStep('intro_video', 'outputArtifactIds[0]'),
        game_bundle: fromBaseRun('bundle_game', 'outputArtifactIds[0]'),
        outcome_win: fromBaseRun('outcome_win', 'outputArtifactIds[0]'),
        outcome_lose: fromBaseRun('outcome_lose', 'outputArtifactIds[0]'),
        plan_data: fromBaseRun('plan', 'data'),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      stepId: 'review_smoke',
      skillId: 'review_asset_quality',
      dependsOn: ['manifest'],
      description: 'Optional smoke test review of updated intro',
      inputSelector: inputSelector({
        manifest: fromStep('manifest', 'data'),
        review_criteria: constant({
          check_brand_consistency: true,
          check_technical_quality: true,
        }),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
};
