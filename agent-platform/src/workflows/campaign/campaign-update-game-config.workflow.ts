import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignUpdateGameConfigWorkflow {
  private readonly logger = new Logger(CampaignUpdateGameConfigWorkflow.name);

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
    this.logger.log('Creating campaign update game config workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'game_config',
        this.skillNode.createNode('game_config', 'game_config_from_template', (s) => ({
          game_type: this.baseRunData(s, 'plan')?.game_type,
          difficulty: { ...this.baseRunData(s, 'game_config')?.difficulty, ...(s.triggerPayload.game_overrides as Record<string, any>)?.difficulty },
          parameters: { ...this.baseRunData(s, 'plan')?.game_parameters, ...(s.triggerPayload.game_overrides as Record<string, any>)?.parameters },
        })),
      )
      .addNode(
        'bundle_game',
        this.skillNode.createNode(
          'bundle_game',
          'bundle_game_template',
          (s) => ({
            game_config: this.stepData(s, 'game_config'),
            audio_assets: this.baseRunData(s, 'audio_mix')?.outputArtifactIds as string[] | undefined,
            template_id: this.baseRunData(s, 'plan')?.template_id,
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
            validation_rules: { check_audio: true, check_textures: true, max_bundle_size_mb: 50 },
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      );

    graph
      .addEdge('__start__', 'game_config')
      .addConditionalEdges('game_config', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges(
        'bundle_game',
        (s) => (s.error ? [] : ['manifest', 'qa_bundle']),
        ['manifest', 'qa_bundle'],
      )
      .addEdge('manifest', '__end__')
      .addEdge('qa_bundle', '__end__');

    this.logger.log('Campaign update game config workflow graph created with 4 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
