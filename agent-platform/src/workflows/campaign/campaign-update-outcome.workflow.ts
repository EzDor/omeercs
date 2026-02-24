import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignUpdateOutcomeWorkflow {
  private readonly logger = new Logger(CampaignUpdateOutcomeWorkflow.name);

  constructor(private readonly skillNode: SkillNodeService) {}

  private shouldContinue(state: CampaignWorkflowStateType) {
    return state.error ? '__end__' : 'continue';
  }

  private stepData(state: CampaignWorkflowStateType, stepId: string): Record<string, any> | undefined {
    return state.stepResults[stepId]?.data as Record<string, any> | undefined;
  }

  private stepArtifacts(state: CampaignWorkflowStateType, stepId: string) {
    return state.stepResults[stepId]?.artifactIds || [];
  }

  private baseRunData(state: CampaignWorkflowStateType, stepId: string): Record<string, any> | undefined {
    return state.baseRunOutputs[stepId] as Record<string, any> | undefined;
  }

  private baseRunArtifactId(state: CampaignWorkflowStateType, stepId: string, index = 0): string | undefined {
    const ids = this.baseRunData(state, stepId)?.outputArtifactIds as string[] | undefined;
    return ids?.[index];
  }

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    this.logger.log('Creating campaign update outcome workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'outcome_win',
        this.skillNode.createNode(
          'outcome_win',
          'generate_outcome_video_win',
          (s) => ({
            style_guide: { ...this.baseRunData(s, 'plan')?.style_guide, ...(s.triggerPayload.outcome_overrides as Record<string, any>)?.style_guide },
            outcome_text: { ...this.baseRunData(s, 'plan')?.win_message, ...(s.triggerPayload.outcome_overrides as Record<string, any>)?.win_message },
            brand_assets: s.triggerPayload.brand_assets,
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
            style_guide: { ...this.baseRunData(s, 'plan')?.style_guide, ...(s.triggerPayload.outcome_overrides as Record<string, any>)?.style_guide },
            outcome_text: { ...this.baseRunData(s, 'plan')?.lose_message, ...(s.triggerPayload.outcome_overrides as Record<string, any>)?.lose_message },
            brand_assets: s.triggerPayload.brand_assets,
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
            intro_image: this.baseRunArtifactId(s, 'intro_image'),
            button_segmentation: this.baseRunData(s, 'intro_button_segmentation')?.data,
            intro_video: this.baseRunArtifactId(s, 'intro_video'),
            game_bundle: this.baseRunArtifactId(s, 'bundle_game'),
            outcome_win: this.stepArtifacts(s, 'outcome_win')[0],
            outcome_lose: this.stepArtifacts(s, 'outcome_lose')[0],
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
      .addEdge('__start__', 'outcome_win')
      .addEdge('__start__', 'outcome_lose')
      .addConditionalEdges('outcome_win', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('outcome_lose', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addConditionalEdges('manifest', (s) => this.shouldContinue(s), { continue: 'review_smoke', __end__: '__end__' })
      .addEdge('review_smoke', '__end__');

    this.logger.log('Campaign update outcome workflow graph created with 4 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
