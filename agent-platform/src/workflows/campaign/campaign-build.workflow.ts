import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';
import { CAMPAIGN_BUILD } from './campaign-workflow.constants';

@Injectable()
export class CampaignBuildWorkflow {
  static readonly WORKFLOW_NAME = CAMPAIGN_BUILD;
  private readonly logger = new Logger(CampaignBuildWorkflow.name);

  constructor(private readonly skillNode: SkillNodeService) {}

  private shouldContinue(state: CampaignWorkflowStateType) {
    return state.error ? '__end__' : 'continue';
  }

  private stepData(state: CampaignWorkflowStateType, stepId: string): Record<string, any> | undefined {
    return state.stepResults.get(stepId)?.data as Record<string, any> | undefined;
  }

  private stepArtifacts(state: CampaignWorkflowStateType, stepId: string) {
    return state.stepResults.get(stepId)?.artifactIds || [];
  }

  private planVideoPrompt(state: CampaignWorkflowStateType, index: number): Record<string, unknown> | undefined {
    const prompts = this.stepData(state, 'plan')?.video_prompts as Array<Record<string, unknown>> | undefined;
    return prompts?.[index];
  }

  private planNested(state: CampaignWorkflowStateType, field: string): Record<string, unknown> | undefined {
    return this.stepData(state, 'plan')?.[field] as Record<string, unknown> | undefined;
  }

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    this.logger.log('Creating campaign build workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'plan',
        this.skillNode.createNode('plan', 'campaign_plan_from_brief', (s) => ({
          brief: s.triggerPayload.brief,
          brand_assets: s.triggerPayload.brand_assets,
          constraints: s.triggerPayload.constraints,
        })),
      )
      .addNode(
        'intel_plan',
        this.skillNode.createNode('intel_plan', 'intelligence_plan', (s) => ({
          brief: s.triggerPayload.brief,
          constraints: s.triggerPayload.constraints,
        })),
      )
      .addNode(
        'intel_theme_brief',
        this.skillNode.createNode('intel_theme_brief', 'extract_theme_from_brief', (s) => ({
          brief: s.triggerPayload.brief,
        })),
      )
      .addNode(
        'intel_copy',
        this.skillNode.createNode('intel_copy', 'generate_campaign_copy', (s) => ({
          campaign_context: this.stepData(s, 'plan'),
          copy_types: 'headline,subheadline,cta_button,win_message,lose_message,instructions',
          tone: s.triggerPayload.tone,
          variations_count: 3,
        })),
      )
      .addNode(
        'intro_image',
        this.skillNode.createNode(
          'intro_image',
          'generate_intro_image',
          (s) => ({
            prompt: this.planVideoPrompt(s, 0)?.prompt,
            brand_assets: s.triggerPayload.brand_assets,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'intel_theme_image',
        this.skillNode.createNode('intel_theme_image', 'extract_theme_from_image', (s) => ({
          image_uri: this.stepData(s, 'intro_image')?.image_uri,
        })),
      )
      .addNode(
        'intro_button_segmentation',
        this.skillNode.createNode('intro_button_segmentation', 'segment_start_button', (s) => ({
          image_uri: this.stepData(s, 'intro_image')?.image_uri,
          button_hint: this.planNested(s, 'copy')?.cta_text,
        })),
      )
      .addNode(
        'intro_video',
        this.skillNode.createNode(
          'intro_video',
          'generate_intro_video_loop',
          (s) => ({
            image_uri: this.stepData(s, 'intro_image')?.image_uri,
            motion_prompt: this.planVideoPrompt(s, 0)?.style_notes,
          }),
          { maxAttempts: 2, backoffMs: 3000 },
        ),
      )
      .addNode(
        'bgm',
        this.skillNode.createNode(
          'bgm',
          'generate_bgm_track',
          (s) => ({
            style: this.stepData(s, 'plan')?.audio_specs,
            duration_sec: 30,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'sfx',
        this.skillNode.createNode(
          'sfx',
          'generate_sfx_pack',
          (s) => ({
            sfx_list: this.planNested(s, 'audio_specs')?.sfx_list,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'audio_mix',
        this.skillNode.createNode('audio_mix', 'mix_audio_for_game', (s) => ({
          bgm_uri: this.stepData(s, 'bgm')?.audio_uri,
          sfx_manifest: this.stepData(s, 'sfx'),
          loudness_targets: { standard: 'lufs_14', bgm_lufs: -14, sfx_lufs: -12, true_peak_dbfs: -1 },
        })),
      )
      .addNode(
        'game_config',
        this.skillNode.createNode('game_config', 'game_config_from_template', (s) => ({
          template_id: this.planNested(s, 'game_template')?.template_id,
          theme: this.stepData(s, 'plan')?.theme,
          difficulty: this.stepData(s, 'plan')?.difficulty,
        })),
      )
      .addNode(
        'bundle_game',
        this.skillNode.createNode(
          'bundle_game',
          'bundle_game_template',
          (s) => ({
            template_id: this.planNested(s, 'game_template')?.template_id,
            game_config: this.stepData(s, 'game_config'),
            audio_uri: this.stepData(s, 'audio_mix')?.output_dir,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'outcome_win',
        this.skillNode.createNode(
          'outcome_win',
          'generate_outcome_video_win',
          (s) => ({
            win_text: this.planNested(s, 'copy')?.win_message,
            prompt: this.planVideoPrompt(s, 1)?.prompt,
          }),
          { maxAttempts: 2, backoffMs: 3000 },
        ),
      )
      .addNode(
        'outcome_lose',
        this.skillNode.createNode(
          'outcome_lose',
          'generate_outcome_video_lose',
          (s) => ({
            lose_text: this.planNested(s, 'copy')?.lose_message,
            prompt: this.planVideoPrompt(s, 2)?.prompt,
          }),
          { maxAttempts: 2, backoffMs: 3000 },
        ),
      )
      .addNode(
        'manifest',
        this.skillNode.createNode(
          'manifest',
          'assemble_campaign_manifest',
          (s) => ({
            campaign_id: s.triggerPayload.campaign_id,
            campaign_name: s.triggerPayload.campaign_name,
            intro_video_uri: this.stepData(s, 'intro_video')?.video_uri,
            win_video_uri: this.stepData(s, 'outcome_win')?.video_uri,
            lose_video_uri: this.stepData(s, 'outcome_lose')?.video_uri,
            game_bundle_uri: this.stepData(s, 'bundle_game')?.bundle_uri,
            button_bounds: this.stepData(s, 'intro_button_segmentation')?.bounds,
            intro_image: this.stepData(s, 'intro_image')?.image_uri,
            plan_data: this.stepData(s, 'plan'),
            intel_plan_data: this.stepData(s, 'intel_plan'),
            intel_theme_brief_data: this.stepData(s, 'intel_theme_brief'),
            intel_copy_data: this.stepData(s, 'intel_copy'),
            intel_theme_image_data: this.stepData(s, 'intel_theme_image'),
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      )
      .addNode(
        'qa_bundle',
        this.skillNode.createNode(
          'qa_bundle',
          'validate_game_bundle',
          (s) => ({
            bundle_uri: this.stepData(s, 'bundle_game')?.bundle_uri,
            checks: { verify_structure: true, verify_manifest: true, verify_assets: true, verify_config: true },
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      )
      .addNode(
        'review_smoke',
        this.skillNode.createNode(
          'review_smoke',
          'review_asset_quality',
          () => ({
            artifact_refs: [{ uri: 'campaign_manifest', type: 'json', name: 'Campaign Manifest' }],
            rubric_id: 'general',
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      );

    graph
      .addEdge('__start__', 'plan')
      .addEdge('__start__', 'intel_plan')
      .addEdge('__start__', 'intel_theme_brief')
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'intel_copy', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'intro_image', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'bgm', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'sfx', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'game_config', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'outcome_win', __end__: '__end__' })
      .addConditionalEdges('plan', (s) => this.shouldContinue(s), { continue: 'outcome_lose', __end__: '__end__' })
      .addConditionalEdges('intro_image', (s) => this.shouldContinue(s), { continue: 'intel_theme_image', __end__: '__end__' })
      .addConditionalEdges('intro_image', (s) => this.shouldContinue(s), { continue: 'intro_button_segmentation', __end__: '__end__' })
      .addConditionalEdges('intro_image', (s) => this.shouldContinue(s), { continue: 'intro_video', __end__: '__end__' })
      .addConditionalEdges('bgm', (s) => this.shouldContinue(s), { continue: 'audio_mix', __end__: '__end__' })
      .addConditionalEdges('sfx', (s) => this.shouldContinue(s), { continue: 'audio_mix', __end__: '__end__' })
      .addConditionalEdges('audio_mix', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('game_config', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('bundle_game', (s) => this.shouldContinue(s), { continue: 'qa_bundle', __end__: '__end__' })
      .addConditionalEdges('intro_button_segmentation', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intro_video', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('outcome_win', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('outcome_lose', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intel_plan', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intel_theme_brief', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intel_copy', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intel_theme_image', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('bundle_game', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('manifest', (s) => this.shouldContinue(s), { continue: 'review_smoke', __end__: '__end__' })
      .addEdge('qa_bundle', '__end__')
      .addEdge('review_smoke', '__end__');

    this.logger.log('Campaign build workflow graph created with 18 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
