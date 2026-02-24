import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignReplace3dAssetWorkflow {
  private readonly logger = new Logger(CampaignReplace3dAssetWorkflow.name);

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
    this.logger.log('Creating campaign replace 3D asset workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'generate_3d_asset',
        this.skillNode.createNode(
          'generate_3d_asset',
          'generate_3d_asset',
          (s) => ({
            prompt: s.triggerPayload.asset_prompt,
            constraints: { ...this.baseRunData(s, 'plan')?.asset_constraints, ...(s.triggerPayload.asset_constraints as Record<string, any>) },
            style_guide: this.baseRunData(s, 'plan')?.style_guide,
            asset_slot: s.triggerPayload.asset_slot,
          }),
          { maxAttempts: 2, backoffMs: 3000 },
        ),
      )
      .addNode(
        'optimize_3d_asset',
        this.skillNode.createNode(
          'optimize_3d_asset',
          'optimize_3d_asset',
          (s) => ({
            asset_url: this.stepArtifacts(s, 'generate_3d_asset')[0],
            optimization_params: { ...this.baseRunData(s, 'plan')?.optimization_defaults, ...(s.triggerPayload.optimization_params as Record<string, any>) },
            target_platform: this.baseRunData(s, 'plan')?.target_platform,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'bundle_game',
        this.skillNode.createNode(
          'bundle_game',
          'bundle_game_template',
          (s) => ({
            game_config: this.baseRunData(s, 'game_config')?.data,
            audio_assets: this.baseRunData(s, 'audio_mix')?.outputArtifactIds as string[] | undefined,
            template_id: this.baseRunData(s, 'plan')?.template_id,
            replacement_assets: this.stepArtifacts(s, 'optimize_3d_asset'),
            asset_slot: s.triggerPayload.asset_slot,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
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
            game_bundle: this.stepArtifacts(s, 'bundle_game')[0],
            outcome_win: this.baseRunArtifactId(s, 'outcome_win'),
            outcome_lose: this.baseRunArtifactId(s, 'outcome_lose'),
            plan_data: this.baseRunData(s, 'plan')?.data,
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
            bundle_url: this.stepArtifacts(s, 'bundle_game')[0],
            validation_rules: { check_audio: true, check_textures: true, check_3d_assets: true, max_bundle_size_mb: 50 },
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      );

    graph
      .addEdge('__start__', 'generate_3d_asset')
      .addConditionalEdges('generate_3d_asset', (s) => this.shouldContinue(s), { continue: 'optimize_3d_asset', __end__: '__end__' })
      .addConditionalEdges('optimize_3d_asset', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges(
        'bundle_game',
        (s) => (s.error ? [] : ['manifest', 'qa_bundle']),
        ['manifest', 'qa_bundle'],
      )
      .addEdge('manifest', '__end__')
      .addEdge('qa_bundle', '__end__');

    this.logger.log('Campaign replace 3D asset workflow graph created with 5 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
