import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateIntroImageInput, GenerateIntroImageOutput, SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GenerateIntroImageHandler implements SkillHandler<GenerateIntroImageInput, GenerateIntroImageOutput> {
  private readonly logger = new Logger(GenerateIntroImageHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('IMAGE_GENERATION_MODEL') || 'dall-e-3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: GenerateIntroImageInput, context: SkillExecutionContext): Promise<SkillResult<GenerateIntroImageOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_intro_image for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Build enhanced prompt with brand assets and style refs
      const promptBuildStart = Date.now();
      const enhancedPrompt = this.buildEnhancedPrompt(input);
      timings['prompt_build'] = Date.now() - promptBuildStart;

      // Determine image size from specs
      const size = this.determineSize(input.specs);

      // Call image generation API
      const generationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.imageGeneration({
        model,
        prompt: enhancedPrompt,
        n: 1,
        size,
        quality: 'hd',
        style: 'vivid',
        response_format: 'url',
      });
      timings['generation'] = Date.now() - generationStart;

      if (!response.data || response.data.length === 0) {
        return skillFailure('No image data in response', 'EMPTY_RESPONSE', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      const imageData = response.data[0];
      const imageUrl = imageData.url;

      if (!imageUrl) {
        return skillFailure('No image URL in response', 'NO_IMAGE_URL', { timings_ms: { total: Date.now() - startTime, ...timings } });
      }

      // Download and save the image
      const saveStart = Date.now();
      const savedImageInfo = await this.saveImage(imageUrl, context.executionId, input.specs?.format || 'png');
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Intro image generated successfully in ${totalTime}ms`);

      const output: GenerateIntroImageOutput = {
        image_uri: savedImageInfo.uri,
        width: savedImageInfo.width,
        height: savedImageInfo.height,
        format: savedImageInfo.format,
        file_size_bytes: savedImageInfo.fileSize,
        generation_params: {
          prompt: enhancedPrompt,
          negative_prompt: input.negative_prompt,
          seed: input.seed,
          model,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'image/intro-frame',
            uri: savedImageInfo.uri,
            metadata: {
              width: savedImageInfo.width,
              height: savedImageInfo.height,
              format: savedImageInfo.format,
              revised_prompt: imageData.revised_prompt,
            },
          },
        ],
        {
          timings_ms: { total: totalTime, ...timings },
          provider_calls: [
            {
              provider: 'litellm',
              model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate intro image: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during image generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildEnhancedPrompt(input: GenerateIntroImageInput): string {
    const parts: string[] = [input.prompt];

    // Add style references
    if (input.style_refs) {
      if (input.style_refs.style) {
        parts.push(`Style: ${input.style_refs.style}`);
      }
      if (input.style_refs.mood) {
        parts.push(`Mood: ${input.style_refs.mood}`);
      }
      if (input.style_refs.color_tone) {
        parts.push(`Color tone: ${input.style_refs.color_tone}`);
      }
    }

    // Add brand asset context
    if (input.brand_assets && input.brand_assets.length > 0) {
      const brandContext = input.brand_assets
        .filter((a) => a.description)
        .map((a) => a.description)
        .join('. ');

      if (brandContext) {
        parts.push(`Brand context: ${brandContext}`);
      }
    }

    // Add aspect ratio hint for composition
    if (input.specs?.aspect_ratio) {
      parts.push(`Composition: optimized for ${input.specs.aspect_ratio} aspect ratio`);
    }

    return parts.join('. ');
  }

  private determineSize(specs?: GenerateIntroImageInput['specs']): '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' {
    if (!specs) {
      return '1792x1024'; // Default to 16:9 landscape
    }

    const aspectRatio = specs.aspect_ratio;
    const width = specs.width;
    const height = specs.height;

    // Map aspect ratios to supported sizes
    if (aspectRatio === '16:9' || (width && height && width / height > 1.5)) {
      return '1792x1024';
    } else if (aspectRatio === '9:16' || (width && height && height / width > 1.5)) {
      return '1024x1792';
    } else if (aspectRatio === '1:1') {
      return '1024x1024';
    }

    // Default based on dimensions
    if (width && height) {
      if (width > height) return '1792x1024';
      if (height > width) return '1024x1792';
    }

    return '1024x1024';
  }

  private async saveImage(
    imageUrl: string,
    executionId: string,
    format: string,
  ): Promise<{ uri: string; width: number; height: number; format: string; fileSize: number }> {
    // Ensure output directory exists
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `intro-frame.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    // For now, we'll estimate dimensions based on the API size used
    // In a production system, you'd parse the actual image dimensions
    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      width: 1792, // Default, should be parsed from actual image
      height: 1024,
      format,
      fileSize: stats.size,
    };
  }
}
