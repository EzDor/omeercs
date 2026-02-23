import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignUpdateOutcomeWorkflow: WorkflowSpec = {
  workflowName: 'campaign.update_outcome',
  version: '1.0.0',
  description: 'Update win and/or lose outcome videos for an existing campaign',
  steps: [
    {
      stepId: 'outcome_win',
      skillId: 'generate_outcome_video_win',
      dependsOn: [],
      description: 'Generate new win outcome video',
      inputSelector: inputSelector({
        style_guide: merge(fromBaseRun('plan', 'data.style_guide'), fromTrigger('outcome_overrides.style_guide')),
        outcome_text: merge(fromBaseRun('plan', 'data.win_message'), fromTrigger('outcome_overrides.win_message')),
        brand_assets: fromTrigger('brand_assets'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    },
    {
      stepId: 'outcome_lose',
      skillId: 'generate_outcome_video_lose',
      dependsOn: [],
      description: 'Generate new lose outcome video',
      inputSelector: inputSelector({
        style_guide: merge(fromBaseRun('plan', 'data.style_guide'), fromTrigger('outcome_overrides.style_guide')),
        outcome_text: merge(fromBaseRun('plan', 'data.lose_message'), fromTrigger('outcome_overrides.lose_message')),
        brand_assets: fromTrigger('brand_assets'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    },
    {
      stepId: 'manifest',
      skillId: 'assemble_campaign_manifest',
      dependsOn: ['outcome_win', 'outcome_lose'],
      description: 'Reassemble campaign manifest with new outcome videos',
      inputSelector: inputSelector({
        campaign_id: fromTrigger('campaign_id'),
        intro_image: fromBaseRun('intro_image', 'outputArtifactIds[0]'),
        button_segmentation: fromBaseRun('intro_button_segmentation', 'data'),
        intro_video: fromBaseRun('intro_video', 'outputArtifactIds[0]'),
        game_bundle: fromBaseRun('bundle_game', 'outputArtifactIds[0]'),
        outcome_win: fromStep('outcome_win', 'outputArtifactIds[0]'),
        outcome_lose: fromStep('outcome_lose', 'outputArtifactIds[0]'),
        plan_data: fromBaseRun('plan', 'data'),
      }),
      cachePolicy: { enabled: false, scope: 'run_only' },
      retryPolicy: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      stepId: 'review_smoke',
      skillId: 'review_asset_quality',
      dependsOn: ['manifest'],
      description: 'Optional smoke test review of updated outcomes',
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
