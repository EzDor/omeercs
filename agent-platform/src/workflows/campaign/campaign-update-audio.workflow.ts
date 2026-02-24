import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignUpdateAudioWorkflow {
  private readonly logger = new Logger(CampaignUpdateAudioWorkflow.name);

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
    this.logger.log('Creating campaign update audio workflow graph');

    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'bgm',
        this.skillNode.createNode(
          'bgm',
          'generate_bgm_track',
          (s) => ({
            style: { ...this.baseRunData(s, 'plan')?.audio_style, ...(s.triggerPayload.audio_overrides as Record<string, any>)?.style },
            duration_sec: this.baseRunData(s, 'plan')?.duration_sec,
            mood: { ...this.baseRunData(s, 'plan')?.mood, ...(s.triggerPayload.audio_overrides as Record<string, any>)?.mood },
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
            game_type: this.baseRunData(s, 'plan')?.game_type,
            sfx_list: { ...this.baseRunData(s, 'plan')?.required_sfx, ...(s.triggerPayload.audio_overrides as Record<string, any>)?.sfx_list },
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'audio_mix',
        this.skillNode.createNode('audio_mix', 'mix_audio_for_game', (s) => ({
          bgm_track: this.stepArtifacts(s, 'bgm')[0],
          sfx_pack: this.stepArtifacts(s, 'sfx'),
          target_loudness: -14,
        })),
      )
      .addNode(
        'bundle_game',
        this.skillNode.createNode(
          'bundle_game',
          'bundle_game_template',
          (s) => ({
            game_config: this.baseRunData(s, 'game_config')?.data,
            audio_assets: this.stepArtifacts(s, 'audio_mix'),
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
      .addEdge('__start__', 'bgm')
      .addEdge('__start__', 'sfx')
      .addConditionalEdges('bgm', (s) => this.shouldContinue(s), { continue: 'audio_mix', __end__: '__end__' })
      .addConditionalEdges('sfx', (s) => this.shouldContinue(s), { continue: 'audio_mix', __end__: '__end__' })
      .addConditionalEdges('audio_mix', (s) => this.shouldContinue(s), { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges(
        'bundle_game',
        (s) => (s.error ? [] : ['manifest', 'qa_bundle']),
        ['manifest', 'qa_bundle'],
      )
      .addEdge('manifest', '__end__')
      .addEdge('qa_bundle', '__end__');

    this.logger.log('Campaign update audio workflow graph created with 6 steps');
    return graph as unknown as StateGraph<CampaignWorkflowStateType>;
  }
}
