import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';
import { CAMPAIGN_UPDATE_INTRO } from './campaign-workflow.constants';

@Injectable()
export class CampaignUpdateIntroWorkflow {
  static readonly WORKFLOW_NAME = CAMPAIGN_UPDATE_INTRO;
  private readonly logger = new Logger(CampaignUpdateIntroWorkflow.name);

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

  private baseRunData(state: CampaignWorkflowStateType, stepId: string): Record<string, any> | undefined {
    return (state.triggerPayload.baseRunOutputs as Record<string, Record<string, any>> | undefined)?.[stepId];
  }

  private baseRunArtifactId(state: CampaignWorkflowStateType, stepId: string, index = 0): string | undefined {
    const ids = this.baseRunData(state, stepId)?.outputArtifactIds as string[] | undefined;
    return ids?.[index];
  }

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    this.logger.log('Creating campaign update intro workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'intro_image',
        this.skillNode.createNode(
          'intro_image',
          'generate_intro_image',
          (s) => ({
            style_guide: { ...this.baseRunData(s, 'plan')?.style_guide, ...(s.triggerPayload.intro_overrides as Record<string, any>)?.style_guide },
            brand_assets: s.triggerPayload.brand_assets,
            scene_description: { ...this.baseRunData(s, 'plan')?.intro_scene, ...(s.triggerPayload.intro_overrides as Record<string, any>)?.scene_description },
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'intro_button_segmentation',
        this.skillNode.createNode('intro_button_segmentation', 'segment_start_button', (s) => ({
          image_url: this.stepArtifacts(s, 'intro_image')[0],
          button_style: { ...this.baseRunData(s, 'plan')?.ui_style, ...(s.triggerPayload.intro_overrides as Record<string, any>)?.button_style },
        })),
      )
      .addNode(
        'intro_video',
        this.skillNode.createNode(
          'intro_video',
          'generate_intro_video_loop',
          (s) => ({
            source_image: this.stepArtifacts(s, 'intro_image')[0],
            animation_style: { ...this.baseRunData(s, 'plan')?.animation_style, ...(s.triggerPayload.intro_overrides as Record<string, any>)?.animation_style },
            duration_sec: this.baseRunData(s, 'plan')?.intro_duration_sec,
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
            intro_image: this.stepArtifacts(s, 'intro_image')[0],
            button_segmentation: this.stepData(s, 'intro_button_segmentation'),
            intro_video: this.stepArtifacts(s, 'intro_video')[0],
            game_bundle: this.baseRunArtifactId(s, 'bundle_game'),
            outcome_win: this.baseRunArtifactId(s, 'outcome_win'),
            outcome_lose: this.baseRunArtifactId(s, 'outcome_lose'),
            plan_data: this.baseRunData(s, 'plan')?.data,
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      )
      .addNode(
        'review_smoke',
        this.skillNode.createNode(
          'review_smoke',
          'review_asset_quality',
          (s) => ({
            manifest: this.stepData(s, 'manifest'),
            review_criteria: { check_brand_consistency: true, check_technical_quality: true },
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      );

    graph
      .addEdge('__start__', 'intro_image')
      .addConditionalEdges('intro_image', (s) => this.shouldContinue(s), { continue: 'intro_button_segmentation', __end__: '__end__' })
      .addConditionalEdges('intro_image', (s) => this.shouldContinue(s), { continue: 'intro_video', __end__: '__end__' })
      .addConditionalEdges('intro_button_segmentation', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('intro_video', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('manifest', (s) => this.shouldContinue(s), { continue: 'review_smoke', __end__: '__end__' })
      .addEdge('review_smoke', '__end__');

    this.logger.log('Campaign update intro workflow graph created with 5 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
