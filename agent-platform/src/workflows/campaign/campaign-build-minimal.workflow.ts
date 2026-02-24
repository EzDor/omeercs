import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignBuildMinimalWorkflow {
  private readonly logger = new Logger(CampaignBuildMinimalWorkflow.name);

  constructor(private readonly skillNode: SkillNodeService) {}

  private shouldContinue(state: CampaignWorkflowStateType) {
    return state.error ? '__end__' : 'continue';
  }

  private stepData(state: CampaignWorkflowStateType, stepId: string): Record<string, any> | undefined {
    return state.stepResults[stepId]?.data as Record<string, any> | undefined;
  }

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    this.logger.log('Creating campaign build minimal workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'game_config',
        this.skillNode.createNode('game_config', 'game_config_from_template', (s) => ({
          template_id: s.triggerPayload.template_id,
          theme: s.triggerPayload.theme,
          difficulty: s.triggerPayload.difficulty,
          color_scheme: s.triggerPayload.color_scheme,
          copy: s.triggerPayload.copy,
        })),
      )
      .addNode(
        'bgm',
        this.skillNode.createNode(
          'bgm',
          'generate_bgm_track',
          (s) => ({
            style: (s.triggerPayload.audio as Record<string, any>)?.style,
            duration_sec: (s.triggerPayload.audio as Record<string, any>)?.duration_sec,
            custom_prompt: (s.triggerPayload.audio as Record<string, any>)?.prompt,
            loopable: true,
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
            game_config: this.stepData(s, 'game_config'),
            audio_uri: this.stepData(s, 'bgm')?.audio_uri,
            template_id: s.triggerPayload.template_id,
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
            campaign_name: s.triggerPayload.campaign_name,
            intro_video_uri: s.triggerPayload.intro_video_uri,
            outcome_videos: s.triggerPayload.outcome_videos,
            game_bundle_uri: this.stepData(s, 'bundle_game')?.bundle_uri,
            button_config: s.triggerPayload.button_config,
            rules: s.triggerPayload.rules,
            branding: s.triggerPayload.branding,
          }),
          { maxAttempts: 1, backoffMs: 1000 },
        ),
      );

    graph
      .addEdge('__start__', 'game_config')
      .addEdge('__start__', 'bgm')
      .addConditionalEdges('game_config', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('bgm', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('bundle_game', (s) => this.shouldContinue(s), { continue: 'manifest', __end__: '__end__' })
      .addEdge('manifest', '__end__');

    this.logger.log('Campaign build minimal workflow graph created with 4 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
