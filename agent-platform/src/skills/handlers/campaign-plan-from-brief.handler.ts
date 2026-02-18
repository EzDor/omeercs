import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { CampaignPlanFromBriefInput, CampaignPlanOutput } from '@agentic-template/dto/src/skills/campaign-plan.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';

const CAMPAIGN_PLAN_SYSTEM_PROMPT = `You are a campaign planning expert. Your task is to create comprehensive campaign plans for interactive marketing campaigns that include gamified experiences.

Given a marketing brief, brand assets, and constraints, generate a structured campaign plan that includes:
1. Theme and tone that aligns with the brand
2. Color scheme (either derived from brand assets or generated to match the theme)
3. Game template selection with rationale
4. Difficulty settings optimized for engagement
5. Required assets to generate (images, videos, audio, 3D models)
6. Video prompts for intro and outcome videos
7. Audio specifications (background music style, sound effects)
8. Copy/text content for all campaign touchpoints

Be creative but stay true to the brand voice and campaign objectives. Ensure all recommendations are actionable and specific.`;

const CAMPAIGN_PLAN_OUTPUT_SCHEMA = {
  name: 'campaign_plan',
  description: 'Structured campaign plan output',
  strict: true,
  schema: {
    type: 'object',
    required: ['theme', 'tone', 'color_scheme', 'game_template', 'difficulty', 'required_assets', 'video_prompts', 'audio_specs', 'copy', 'planning_notes'],
    properties: {
      theme: {
        type: 'string',
        description: 'Campaign theme (e.g., "summer beach vibes", "retro arcade")',
      },
      tone: {
        type: 'string',
        description: 'Tone of the campaign (e.g., "playful", "professional", "energetic")',
      },
      color_scheme: {
        type: 'object',
        required: ['primary', 'secondary', 'accent', 'background'],
        properties: {
          primary: { type: 'string', description: 'Primary color in hex format' },
          secondary: { type: 'string', description: 'Secondary color in hex format' },
          accent: { type: 'string', description: 'Accent color in hex format' },
          background: { type: 'string', description: 'Background color in hex format' },
        },
        additionalProperties: false,
      },
      game_template: {
        type: 'object',
        required: ['template_id', 'template_name', 'rationale'],
        properties: {
          template_id: { type: 'string', enum: ['spin_wheel'], description: 'ID of the selected game template' },
          template_name: { type: 'string', description: 'Human-readable template name' },
          rationale: { type: 'string', description: 'Why this template was chosen' },
        },
        additionalProperties: false,
      },
      difficulty: {
        type: 'object',
        required: ['level', 'win_probability', 'rationale'],
        properties: {
          level: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          win_probability: { type: 'number', description: 'Target win probability (0-1)' },
          rationale: { type: 'string', description: 'Why this difficulty was chosen' },
        },
        additionalProperties: false,
      },
      required_assets: {
        type: 'array',
        items: {
          type: 'object',
          required: ['asset_type', 'description', 'specifications'],
          properties: {
            asset_type: { type: 'string', enum: ['image', 'video', 'audio', '3d_model', 'sfx'] },
            description: { type: 'string' },
            specifications: { type: 'object' },
          },
          additionalProperties: false,
        },
      },
      video_prompts: {
        type: 'array',
        minItems: 3,
        items: {
          type: 'object',
          required: ['type', 'prompt', 'style_notes', 'duration_sec'],
          properties: {
            type: { type: 'string', enum: ['intro', 'win', 'lose'] },
            prompt: { type: 'string' },
            style_notes: { type: 'string' },
            duration_sec: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      audio_specs: {
        type: 'object',
        required: ['genre', 'bpm', 'sfx_list'],
        properties: {
          genre: {
            type: 'string',
            enum: [
              'electronic',
              'ambient',
              'orchestral',
              'rock',
              'pop',
              'jazz',
              'classical',
              'cinematic',
              'retro',
              'chiptune',
              'lofi',
              'upbeat',
              'calm',
              'energetic',
              'mysterious',
            ],
            description: 'Music genre for background music generation',
          },
          mood: {
            type: 'string',
            enum: ['happy', 'sad', 'tense', 'relaxed', 'epic', 'playful', 'dramatic', 'neutral'],
            description: 'Mood for the background music',
          },
          bpm: { type: 'number', description: 'Beats per minute for the background music' },
          sfx_list: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'intent'],
              properties: {
                name: { type: 'string', description: 'Sound effect name (e.g., "click_sound", "win_fanfare")' },
                intent: {
                  type: 'string',
                  enum: [
                    'jump',
                    'coin',
                    'click',
                    'win',
                    'lose',
                    'collect',
                    'powerup',
                    'explosion',
                    'hit',
                    'miss',
                    'countdown',
                    'start',
                    'game_over',
                    'level_up',
                    'bonus',
                    'notification',
                    'error',
                    'success',
                    'whoosh',
                    'pop',
                    'ding',
                    'buzz',
                    'custom',
                  ],
                  description: 'The semantic intent of the sound effect',
                },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      copy: {
        type: 'object',
        required: ['intro_headline', 'intro_subtext', 'win_message', 'lose_message', 'cta_text'],
        properties: {
          intro_headline: { type: 'string' },
          intro_subtext: { type: 'string' },
          win_message: { type: 'string' },
          lose_message: { type: 'string' },
          cta_text: { type: 'string' },
        },
        additionalProperties: false,
      },
      planning_notes: {
        type: 'string',
        description: 'Additional notes from the planning process',
      },
    },
    additionalProperties: false,
  },
};

@Injectable()
export class CampaignPlanFromBriefHandler implements SkillHandler<CampaignPlanFromBriefInput, CampaignPlanOutput> {
  private readonly logger = new Logger(CampaignPlanFromBriefHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('LITELLM_MODEL') || 'claude-sonnet';
  }

  async execute(input: CampaignPlanFromBriefInput, context: SkillExecutionContext): Promise<SkillResult<CampaignPlanOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing campaign_plan_from_brief for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Build the user prompt
      const userPrompt = this.buildUserPrompt(input);
      timings['prompt_build'] = Date.now() - startTime;

      // Call LLM with structured output
      const llmStartTime = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.chatCompletion({
        model,
        messages: [
          { role: 'system', content: CAMPAIGN_PLAN_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: CAMPAIGN_PLAN_OUTPUT_SCHEMA,
        },
      });
      timings['llm_call'] = Date.now() - llmStartTime;

      // Parse the response
      const parseStartTime = Date.now();
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return skillFailure('No content in LLM response', 'EMPTY_RESPONSE', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      const campaignPlan = JSON.parse(content) as CampaignPlanOutput;
      timings['parse'] = Date.now() - parseStartTime;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Campaign plan generated successfully in ${totalTime}ms`);

      return skillSuccess(
        campaignPlan,
        [
          {
            artifact_type: 'json/campaign-plan',
            uri: `memory://campaign-plan/${context.executionId}`,
            metadata: {
              theme: campaignPlan.theme,
              game_template: campaignPlan.game_template.template_id,
            },
          },
        ],
        {
          timings_ms: { total: totalTime, ...timings },
          provider_calls: [
            {
              provider: 'litellm',
              model,
              duration_ms: timings['llm_call'],
              tokens: {
                input: response.usage?.prompt_tokens || 0,
                output: response.usage?.completion_tokens || 0,
              },
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate campaign plan: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during campaign plan generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildUserPrompt(input: CampaignPlanFromBriefInput): string {
    const parts: string[] = [];

    parts.push('## Marketing Brief');
    parts.push(input.brief);
    parts.push('');

    if (input.brand_assets && input.brand_assets.length > 0) {
      parts.push('## Brand Assets');
      for (const asset of input.brand_assets) {
        parts.push(`- ${asset.type}: ${asset.uri}${asset.description ? ` (${asset.description})` : ''}`);
      }
      parts.push('');
    }

    if (input.constraints) {
      parts.push('## Constraints');
      if (input.constraints.max_game_duration_sec) {
        parts.push(`- Maximum game duration: ${input.constraints.max_game_duration_sec} seconds`);
      }
      if (input.constraints.target_audience) {
        parts.push(`- Target audience: ${input.constraints.target_audience}`);
      }
      if (input.constraints.excluded_themes && input.constraints.excluded_themes.length > 0) {
        parts.push(`- Excluded themes: ${input.constraints.excluded_themes.join(', ')}`);
      }
      if (input.constraints.required_features && input.constraints.required_features.length > 0) {
        parts.push(`- Required features: ${input.constraints.required_features.join(', ')}`);
      }
      if (input.constraints.language) {
        parts.push(`- Language: ${input.constraints.language}`);
      }
      if (input.constraints.region) {
        parts.push(`- Region: ${input.constraints.region}`);
      }
      parts.push('');
    }

    parts.push('## Available Game Templates');
    parts.push('- spin_wheel: Classic spinning wheel game with configurable segments and prizes. Best for prize giveaways, promotional events, and engagement campaigns.');
    parts.push('');
    parts.push('IMPORTANT: You MUST select "spin_wheel" as the template_id. It is currently the only fully implemented template.');

    parts.push('Please generate a comprehensive campaign plan based on the above information.');

    return parts.join('\n');
  }
}
