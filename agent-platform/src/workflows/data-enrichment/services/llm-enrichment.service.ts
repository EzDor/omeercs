import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { LiteLLMClientFactory, LiteLLMConfiguration } from '@agentic-template/common/src/llm/litellm-client.factory';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { PromptTemplateService } from '@agentic-template/common/src/llm/services/prompt-template.service';
import { DataItem } from '../interfaces/data-item.interface';
import { EnrichedDataItem, DataEnrichment } from '../interfaces/enriched-data-item.interface';
import { DataEnrichmentStateType } from '../interfaces/data-enrichment-state.interface';

interface LlmEnrichmentResponse {
  summary?: string;
  keyTopics?: unknown;
  sentiment?: unknown;
  suggestedTags?: unknown;
  qualityScore?: unknown;
}

@Injectable()
export class LlmEnrichmentService {
  private readonly logger = new Logger(LlmEnrichmentService.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly model: string;
  private readonly promptsDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptTemplateService: PromptTemplateService,
  ) {
    const config: LiteLLMConfiguration = LiteLLMClientFactory.loadConfiguration(configService);
    this.llmClient = LiteLLMClientFactory.createClient(config);
    this.model = config.model;
    this.promptsDir = path.join(__dirname, '..', 'prompts');
  }

  async enrichWithLlm(state: DataEnrichmentStateType): Promise<Partial<DataEnrichmentStateType>> {
    this.logger.log(`Enriching ${state.transformedData.length} data items with LLM`);

    try {
      const enrichedData: EnrichedDataItem[] = [];

      for (const item of state.transformedData) {
        const enriched = await this.enrichSingleItem(item);
        enrichedData.push(enriched);
      }

      this.logger.log(`Enriched ${enrichedData.length} data items`);

      return {
        enrichedData,
        currentStep: 'enriched',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to enrich data with LLM', error);
      return {
        error: `LLM enrichment failed: ${errorMessage}`,
        currentStep: 'error',
      };
    }
  }

  private async enrichSingleItem(item: DataItem): Promise<EnrichedDataItem> {
    const promptConfig = this.promptTemplateService.loadAndInterpolate(this.promptsDir, 'data-enrichment', {
      title: item.title,
      content: item.content,
      category: item.category || 'unknown',
    });

    const response = await this.llmClient.chatCompletion({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a data analysis assistant. Respond only with valid JSON.',
        },
        { role: 'user', content: promptConfig.prompt },
      ],
      temperature: promptConfig.model_kwargs?.temperature ?? 0.3,
      max_tokens: promptConfig.model_kwargs?.max_tokens ?? 500,
    });

    const enrichmentText = response.choices[0]?.message?.content || '{}';
    const enrichment = this.parseEnrichmentResponse(enrichmentText);

    return {
      ...item,
      enrichment,
      enrichedAt: new Date(),
    };
  }

  private parseEnrichmentResponse(response: string): DataEnrichment {
    try {
      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr) as LlmEnrichmentResponse;
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary available',
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]) : [],
        sentiment: this.validateSentiment(parsed.sentiment),
        suggestedTags: Array.isArray(parsed.suggestedTags) ? (parsed.suggestedTags as string[]) : [],
        qualityScore: typeof parsed.qualityScore === 'number' ? Math.min(100, Math.max(0, parsed.qualityScore)) : 0,
      };
    } catch (error) {
      this.logger.warn('Failed to parse LLM response, using defaults', error);
      return {
        summary: 'Parsing failed',
        keyTopics: [],
        sentiment: 'neutral',
        suggestedTags: [],
        qualityScore: 0,
      };
    }
  }

  private validateSentiment(sentiment: unknown): 'positive' | 'negative' | 'neutral' {
    if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
      return sentiment;
    }
    return 'neutral';
  }
}
