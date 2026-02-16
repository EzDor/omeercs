import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { LlmGenerationService } from '../../skills/skill-runner/services/llm-generation.service';
import type { GenerationConfig, GenerationInput } from '../../skills/skill-runner/interfaces/generation-result.interface';

const COPY_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['copies'],
  properties: {
    copies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['copy_type', 'variations'],
        properties: {
          copy_type: { type: 'string' },
          variations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text', 'character_count', 'tone_match_score'],
              properties: {
                text: { type: 'string' },
                character_count: { type: 'number' },
                tone_match_score: { type: 'number', minimum: 0, maximum: 1 },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

export interface CopyVariation {
  text: string;
  character_count: number;
  tone_match_score: number;
  tone?: string;
  notes?: string;
}

export interface CopyResult {
  copy_type: string;
  variations: CopyVariation[];
}

interface CopyOutput {
  copies: CopyResult[];
}

@Injectable()
export class CopyGenerationService {
  private readonly logger = new Logger(CopyGenerationService.name);

  constructor(private readonly llmGenerationService: LlmGenerationService) {}

  async generateCopy(
    campaignContext: Record<string, unknown>,
    copyTypes: string[],
    tone: string,
    variationsCount?: number,
    constraints?: Record<string, unknown>,
  ): Promise<{ copies: CopyResult[]; duration_ms: number; model: string; attempts: number }> {
    this.logger.log(`Generating copy for ${copyTypes.length} types, tone: ${tone}, variations: ${variationsCount || 3}`);
    const startTime = Date.now();

    const input: GenerationInput = {
      variables: {
        campaign_context: JSON.stringify(campaignContext),
        copy_types: copyTypes.join(', '),
        tone,
        variations_count: String(variationsCount || 3),
        constraints: constraints ? JSON.stringify(constraints) : 'No specific constraints.',
      },
      context: {
        model: 'gemini/gemini-2.0-flash',
      },
    };

    const config: GenerationConfig = {
      promptId: 'generate_copy',
      outputSchema: COPY_OUTPUT_SCHEMA,
      retryOnValidationFailure: true,
      maxValidationRetries: 2,
      temperature: 0.8,
      maxTokens: 4096,
    };

    const result = await this.llmGenerationService.generate<CopyOutput>(input, config);

    if (!result.success || !result.data) {
      const errors = result.validationErrors?.map((e) => e.message).join(', ') || 'Unknown generation error';
      this.logger.error(`Copy generation failed: ${errors}`);
      throw new InternalServerErrorException(`Copy generation failed: ${errors}`);
    }

    const copies = this.validateVariationDistinctness(result.data.copies);

    const durationMs = Date.now() - startTime;
    this.logger.log(`Copy generated in ${durationMs}ms (${result.attempts} attempt(s))`);

    return {
      copies,
      duration_ms: durationMs,
      model: 'gemini/gemini-2.0-flash',
      attempts: result.attempts,
    };
  }

  private validateVariationDistinctness(copies: CopyResult[]): CopyResult[] {
    return copies.map((copyResult) => {
      const validVariations: CopyVariation[] = [];
      for (const variation of copyResult.variations) {
        const isDuplicate = validVariations.some((existing) => this.computeWordOverlap(existing.text, variation.text) > 0.5);
        if (!isDuplicate) {
          validVariations.push(variation);
        } else {
          this.logger.warn(`Filtered duplicate variation for ${copyResult.copy_type}: "${variation.text.substring(0, 40)}..."`);
        }
      }
      return { ...copyResult, variations: validVariations };
    });
  }

  private computeWordOverlap(textA: string, textB: string): number {
    const wordsA = new Set(
      textA
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean),
    );
    const wordsB = new Set(
      textB
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean),
    );
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let shared = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) shared++;
    }
    const smaller = Math.min(wordsA.size, wordsB.size);
    return shared / smaller;
  }
}
