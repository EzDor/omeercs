import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GameConfigFromTemplateInput, GameConfigOutput, SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';

const GAME_CONFIG_SYSTEM_PROMPT = `You are a game configuration expert. Your task is to generate complete, schema-validated game_config.json files for interactive marketing games.

Given a game template, theme, difficulty settings, and optional assets, generate a comprehensive configuration that includes:
1. Game settings (duration, difficulty parameters)
2. Visual configuration (colors, asset mappings, animations)
3. Audio settings (BGM, SFX volumes and mappings)
4. Template-specific mechanics (e.g., wheel segments for spin_wheel, card layouts for memory_match)
5. Copy/text content

IMPORTANT: Generate ONLY configuration, NOT code. All values must be concrete and usable.

Template-specific mechanics guidelines:
- spin_wheel: segments array with prizes, probabilities, colors
- scratch_card: grid size, reveal patterns, prize distribution
- slot_machine: reels configuration, symbol weights, paylines
- memory_match: grid dimensions, card themes, time limits
- catch_game: spawn rates, speeds, score values
- quiz: question count, time per question, scoring rules`;

const GAME_CONFIG_OUTPUT_SCHEMA = {
  name: 'game_config',
  description: 'Complete game configuration',
  strict: true,
  schema: {
    type: 'object',
    required: ['template_id', 'version', 'settings', 'visuals', 'audio', 'mechanics', 'copy'],
    properties: {
      template_id: { type: 'string' },
      version: { type: 'string' },
      settings: {
        type: 'object',
        required: ['duration_sec', 'difficulty', 'locale'],
        properties: {
          duration_sec: { type: 'number' },
          difficulty: {
            type: 'object',
            required: ['level', 'win_probability', 'parameters'],
            properties: {
              level: { type: 'string', enum: ['easy', 'medium', 'hard'] },
              win_probability: { type: 'number' },
              parameters: { type: 'object' },
            },
            additionalProperties: false,
          },
          locale: { type: 'string' },
        },
        additionalProperties: false,
      },
      visuals: {
        type: 'object',
        required: ['theme', 'colors', 'assets', 'animations'],
        properties: {
          theme: { type: 'string' },
          colors: {
            type: 'object',
            required: ['primary', 'secondary', 'accent', 'background'],
            properties: {
              primary: { type: 'string' },
              secondary: { type: 'string' },
              accent: { type: 'string' },
              background: { type: 'string' },
            },
            additionalProperties: false,
          },
          assets: { type: 'object' },
          animations: { type: 'object' },
        },
        additionalProperties: false,
      },
      audio: {
        type: 'object',
        required: ['bgm', 'sfx'],
        properties: {
          bgm: {
            type: 'object',
            required: ['enabled', 'volume', 'loop'],
            properties: {
              enabled: { type: 'boolean' },
              volume: { type: 'number' },
              loop: { type: 'boolean' },
            },
            additionalProperties: false,
          },
          sfx: { type: 'object' },
        },
        additionalProperties: false,
      },
      mechanics: { type: 'object' },
      copy: {
        type: 'object',
        required: ['title', 'instructions', 'win_message', 'lose_message'],
        properties: {
          title: { type: 'string' },
          instructions: { type: 'string' },
          win_message: { type: 'string' },
          lose_message: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

@Injectable()
export class GameConfigFromTemplateHandler implements SkillHandler<GameConfigFromTemplateInput, GameConfigOutput> {
  private readonly logger = new Logger(GameConfigFromTemplateHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('LITELLM_MODEL') || 'claude-sonnet';
  }

  async execute(input: GameConfigFromTemplateInput, context: SkillExecutionContext): Promise<SkillResult<GameConfigOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing game_config_from_template for template ${input.template_id}, tenant ${context.tenantId}`);

    try {
      const userPrompt = this.buildUserPrompt(input);
      timings['prompt_build'] = Date.now() - startTime;

      const llmStartTime = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.chatCompletion({
        model,
        messages: [
          { role: 'system', content: GAME_CONFIG_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 3000,
        response_format: {
          type: 'json_schema',
          json_schema: GAME_CONFIG_OUTPUT_SCHEMA,
        },
      });
      timings['llm_call'] = Date.now() - llmStartTime;

      const parseStartTime = Date.now();
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return skillFailure('No content in LLM response', 'EMPTY_RESPONSE', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      const gameConfig: GameConfigOutput = JSON.parse(content);
      timings['parse'] = Date.now() - parseStartTime;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Game config generated successfully in ${totalTime}ms`);

      return skillSuccess(
        gameConfig,
        [
          {
            artifact_type: 'json/game-config',
            uri: `memory://game-config/${context.executionId}`,
            metadata: {
              template_id: gameConfig.template_id,
              theme: gameConfig.visuals.theme,
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
      this.logger.error(`Failed to generate game config: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during game config generation', 'EXECUTION_ERROR', { timings_ms: { total: totalTime, ...timings } });
    }
  }

  private buildUserPrompt(input: GameConfigFromTemplateInput): string {
    const parts: string[] = [];

    parts.push('## Game Template');
    parts.push(`Template ID: ${input.template_id}`);
    parts.push(`Theme: ${input.theme}`);
    parts.push('');

    parts.push('## Difficulty Settings');
    parts.push(`Level: ${input.difficulty.level}`);
    parts.push(`Target Win Probability: ${input.difficulty.win_probability}`);
    parts.push('');

    if (input.color_scheme) {
      parts.push('## Color Scheme');
      if (input.color_scheme.primary) parts.push(`Primary: ${input.color_scheme.primary}`);
      if (input.color_scheme.secondary) parts.push(`Secondary: ${input.color_scheme.secondary}`);
      if (input.color_scheme.accent) parts.push(`Accent: ${input.color_scheme.accent}`);
      if (input.color_scheme.background) parts.push(`Background: ${input.color_scheme.background}`);
      parts.push('');
    }

    if (input.asset_refs && input.asset_refs.length > 0) {
      parts.push('## Available Assets');
      for (const asset of input.asset_refs) {
        parts.push(`- ${asset.type}: ${asset.uri}${asset.slot ? ` (slot: ${asset.slot})` : ''}`);
      }
      parts.push('');
    }

    if (input.copy) {
      parts.push('## Copy/Text Content');
      if (input.copy.title) parts.push(`Title: ${input.copy.title}`);
      if (input.copy.instructions) parts.push(`Instructions: ${input.copy.instructions}`);
      if (input.copy.win_message) parts.push(`Win Message: ${input.copy.win_message}`);
      if (input.copy.lose_message) parts.push(`Lose Message: ${input.copy.lose_message}`);
      parts.push('');
    }

    parts.push('Generate a complete game_config.json for this template with appropriate mechanics configuration.');

    return parts.join('\n');
  }
}
