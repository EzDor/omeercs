import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { LlmGenerationService } from '../../skills/skill-runner/services/llm-generation.service';
import type { GenerationConfig, GenerationInput } from '../../skills/skill-runner/interfaces/generation-result.interface';

const THEME_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['primary_color', 'secondary_color', 'accent_color', 'background_color', 'text_color', 'mood', 'confidence', 'palette'],
  properties: {
    primary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    secondary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    accent_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    background_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    text_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    mood: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    palette: { type: 'array', items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, minItems: 5, maxItems: 8 },
  },
};

export interface ThemeOutput {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  mood: string;
  confidence: number;
  palette: string[];
}

@Injectable()
export class ThemeBriefService {
  private readonly logger = new Logger(ThemeBriefService.name);

  constructor(private readonly llmGenerationService: LlmGenerationService) {}

  async extractTheme(brief: string): Promise<{ theme: ThemeOutput; duration_ms: number; model: string; attempts: number }> {
    this.logger.log(`Extracting theme from brief (${brief.length} chars)`);
    const startTime = Date.now();

    const input: GenerationInput = {
      variables: { brief },
      context: {
        model: 'gemini/gemini-2.0-flash',
      },
    };

    const config: GenerationConfig = {
      promptId: 'extract_theme_brief',
      outputSchema: THEME_OUTPUT_SCHEMA,
      retryOnValidationFailure: true,
      maxValidationRetries: 2,
      temperature: 0.6,
      maxTokens: 2048,
    };

    const result = await this.llmGenerationService.generate<ThemeOutput>(input, config);

    if (!result.success || !result.data) {
      const errors = result.validationErrors?.map((e) => e.message).join(', ') || 'Unknown generation error';
      this.logger.error(`Theme extraction failed: ${errors}`);
      throw new InternalServerErrorException(`Theme extraction failed: ${errors}`);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(`Theme extracted in ${durationMs}ms (${result.attempts} attempt(s))`);

    return {
      theme: result.data,
      duration_ms: durationMs,
      model: 'gemini/gemini-2.0-flash',
      attempts: result.attempts,
    };
  }
}
