import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmGenerationService } from '../../skills/skill-runner/services/llm-generation.service';
import type { GenerationConfig, GenerationInput } from '../../skills/skill-runner/interfaces/generation-result.interface';

const PLAN_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['summary', 'recommended_template', 'theme', 'prize_tiers', 'estimated_engagement', 'asset_requirements'],
  properties: {
    summary: { type: 'string' },
    recommended_template: {
      type: 'object',
      required: ['template_id', 'template_name', 'reasoning', 'confidence'],
      properties: {
        template_id: { type: 'string' },
        template_name: { type: 'string' },
        reasoning: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    theme: {
      type: 'object',
      required: ['primary_color', 'secondary_color', 'accent_color', 'background_color', 'text_color', 'mood'],
      properties: {
        primary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        secondary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        accent_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        background_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        text_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        mood: { type: 'string' },
      },
    },
    prize_tiers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tier', 'suggestion', 'probability'],
        properties: {
          tier: { type: 'string' },
          suggestion: { type: 'string' },
          probability: { type: 'number', minimum: 0, maximum: 1 },
          estimated_cost: { type: 'string' },
        },
      },
    },
    estimated_engagement: { type: 'string' },
    asset_requirements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'purpose'],
        properties: {
          type: { type: 'string' },
          purpose: { type: 'string' },
          generation_prompt: { type: 'string' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

export interface PlanOutput {
  summary: string;
  recommended_template: {
    template_id: string;
    template_name: string;
    reasoning: string;
    confidence: number;
  };
  theme: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    mood: string;
  };
  prize_tiers: Array<{
    tier: string;
    suggestion: string;
    probability: number;
    estimated_cost?: string;
  }>;
  estimated_engagement: string;
  asset_requirements: Array<{
    type: string;
    purpose: string;
    generation_prompt?: string;
  }>;
  warnings?: string[];
}

@Injectable()
export class IntelligencePlanService {
  private readonly logger = new Logger(IntelligencePlanService.name);
  private readonly llmModel: string;

  constructor(
    private readonly llmGenerationService: LlmGenerationService,
    configService: ConfigService,
  ) {
    this.llmModel = configService.get<string>('INTELLIGENCE_LLM_MODEL', 'gemini/gemini-2.0-flash');
  }

  async generatePlan(brief: string, constraints?: Record<string, unknown>): Promise<{ plan: PlanOutput; duration_ms: number; model: string; attempts: number }> {
    this.logger.log(`Generating plan for brief (${brief.length} chars)`);
    const startTime = Date.now();

    const input: GenerationInput = {
      variables: {
        brief,
        constraints: constraints ? JSON.stringify(constraints) : 'No specific constraints provided.',
      },
      context: {
        model: this.llmModel,
      },
    };

    const config: GenerationConfig = {
      promptId: 'intelligence_plan',
      outputSchema: PLAN_OUTPUT_SCHEMA,
      retryOnValidationFailure: true,
      maxValidationRetries: 2,
      temperature: 0.5,
      maxTokens: 4096,
    };

    const result = await this.llmGenerationService.generate<PlanOutput>(input, config);

    if (!result.success || !result.data) {
      this.logger.error(`Plan generation failed: ${result.validationErrors?.map((e) => e.message).join(', ') || 'Unknown error'}`);
      throw new InternalServerErrorException('Plan generation failed');
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(`Plan generated in ${durationMs}ms (${result.attempts} attempt(s))`);

    return {
      plan: result.data,
      duration_ms: durationMs,
      model: this.llmModel,
      attempts: result.attempts,
    };
  }
}
