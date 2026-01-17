import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { ReviewAssetQualityInput, ReviewAssetQualityOutput, SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';

const RUBRIC_DESCRIPTIONS: Record<string, string> = {
  brand_consistency: `Review assets for brand consistency:
- Logo usage and placement
- Color palette adherence
- Typography consistency
- Visual style alignment
- Messaging tone consistency`,

  technical_quality: `Review assets for technical quality:
- Resolution and clarity
- File size optimization
- Format appropriateness
- Compression artifacts
- Color accuracy`,

  accessibility: `Review assets for accessibility:
- Color contrast ratios
- Text readability
- Alt text availability
- Motion/animation considerations
- Screen reader compatibility`,

  performance: `Review assets for performance:
- Load time impact
- Memory usage
- Render performance
- Mobile optimization
- Caching suitability`,

  general: `Perform a general quality review:
- Overall visual appeal
- Professional quality
- Consistency across assets
- Appropriate for target use
- Technical soundness`,
};

const REVIEW_SYSTEM_PROMPT = `You are an expert asset quality reviewer for interactive marketing campaigns. Your task is to review generated assets against quality rubrics and provide detailed, actionable feedback.

For each asset, provide:
1. A pass/fail determination based on the rubric
2. A quality score from 0-100
3. Specific issues found with severity levels (critical, major, minor, info)
4. Concrete suggestions for fixing each issue

Be thorough but fair. Critical issues should be reserved for problems that would break functionality or severely damage brand perception. Minor issues are for polish and optimization opportunities.

When reviewing, consider:
- The asset type and its intended use
- The target platform if specified
- The quality threshold (strict/standard/lenient)
- Any brand guidelines provided`;

const REVIEW_OUTPUT_SCHEMA = {
  name: 'quality_review',
  description: 'Asset quality review results',
  strict: true,
  schema: {
    type: 'object',
    required: ['pass', 'overall_score', 'reviews', 'summary'],
    properties: {
      pass: { type: 'boolean' },
      overall_score: { type: 'number' },
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          required: ['artifact_uri', 'pass', 'score', 'issues', 'suggested_fixes'],
          properties: {
            artifact_uri: { type: 'string' },
            artifact_name: { type: 'string' },
            pass: { type: 'boolean' },
            score: { type: 'number' },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                required: ['severity', 'category', 'description'],
                properties: {
                  severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
                  category: { type: 'string' },
                  description: { type: 'string' },
                  location: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            suggested_fixes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['issue_index', 'suggestion'],
                properties: {
                  issue_index: { type: 'number' },
                  suggestion: { type: 'string' },
                  effort: { type: 'string', enum: ['trivial', 'minor', 'moderate', 'major'] },
                  automated: { type: 'boolean' },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      summary: { type: 'string' },
    },
    additionalProperties: false,
  },
};

@Injectable()
export class ReviewAssetQualityHandler implements SkillHandler<ReviewAssetQualityInput, ReviewAssetQualityOutput> {
  private readonly logger = new Logger(ReviewAssetQualityHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('LITELLM_MODEL') || 'claude-sonnet';
  }

  async execute(input: ReviewAssetQualityInput, context: SkillExecutionContext): Promise<SkillResult<ReviewAssetQualityOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing review_asset_quality with rubric ${input.rubric_id}, tenant ${context.tenantId}`);

    try {
      const userPrompt = this.buildUserPrompt(input);
      timings['prompt_build'] = Date.now() - startTime;

      const llmStartTime = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.chatCompletion({
        model,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: REVIEW_OUTPUT_SCHEMA,
        },
      });
      timings['llm_call'] = Date.now() - llmStartTime;

      const parseStartTime = Date.now();
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return skillFailure('No content in LLM response', 'EMPTY_RESPONSE', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      const reviewResult: ReviewAssetQualityOutput = JSON.parse(content);
      timings['parse'] = Date.now() - parseStartTime;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Asset review completed in ${totalTime}ms - ${reviewResult.pass ? 'PASSED' : 'FAILED'} (score: ${reviewResult.overall_score})`);

      return skillSuccess(
        reviewResult,
        [
          {
            artifact_type: 'json/quality-report',
            uri: `memory://quality-report/${context.executionId}`,
            metadata: {
              rubric_id: input.rubric_id,
              pass: reviewResult.pass,
              overall_score: reviewResult.overall_score,
              artifact_count: input.artifact_refs.length,
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
      this.logger.error(`Failed to review assets: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during asset review', 'EXECUTION_ERROR', { timings_ms: { total: totalTime, ...timings } });
    }
  }

  private buildUserPrompt(input: ReviewAssetQualityInput): string {
    const parts: string[] = [];

    parts.push('## Quality Rubric');
    parts.push(`Rubric: ${input.rubric_id}`);
    parts.push(RUBRIC_DESCRIPTIONS[input.rubric_id] || RUBRIC_DESCRIPTIONS['general']);
    parts.push('');

    if (input.context) {
      parts.push('## Review Context');
      if (input.context.target_platform) {
        parts.push(`Target Platform: ${input.context.target_platform}`);
      }
      if (input.context.quality_threshold) {
        parts.push(`Quality Threshold: ${input.context.quality_threshold}`);
      }
      if (input.context.brand_guidelines) {
        parts.push(`Brand Guidelines: ${input.context.brand_guidelines}`);
      }
      parts.push('');
    }

    parts.push('## Artifacts to Review');
    for (const artifact of input.artifact_refs) {
      parts.push(`### ${artifact.name || artifact.uri}`);
      parts.push(`- URI: ${artifact.uri}`);
      parts.push(`- Type: ${artifact.type}`);
      if (artifact.metadata) {
        parts.push(`- Metadata: ${JSON.stringify(artifact.metadata)}`);
      }
      parts.push('');
    }

    parts.push('Please review each artifact against the rubric and provide detailed feedback.');

    return parts.join('\n');
  }
}
