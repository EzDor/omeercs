import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProviderRegistry } from '@agentic-template/common/src/providers/registries/image-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { GenerateIntroImageInput, GenerateIntroImageOutput } from '@agentic-template/dto/src/skills/generate-intro-image.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class GenerateIntroImageHandler implements SkillHandler<GenerateIntroImageInput, GenerateIntroImageOutput> {
  private readonly logger = new Logger(GenerateIntroImageHandler.name);
  private readonly outputDir: string;

  // Allowed domains for image URLs (SSRF prevention)
  private readonly ALLOWED_IMAGE_DOMAINS = [
    'oaidalleapiprodscus.blob.core.windows.net', // OpenAI DALL-E
    'stability.ai',
    'api.stability.ai',
    'storage.googleapis.com',
    'replicate.delivery',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProviders: ImageProviderRegistry,
  ) {
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

      // Determine image dimensions
      const { width, height } = this.determineDimensions(input.specs);

      // Get provider from registry (use specified provider or default)
      const provider = input.provider ? this.imageProviders.getProvider(input.provider) : this.imageProviders.getDefaultProvider();

      // Call image generation API via provider adapter
      const generationStart = Date.now();
      const result = await provider.generateImage({
        prompt: enhancedPrompt,
        negativePrompt: input.negative_prompt,
        width,
        height,
        quality: 'hd',
        seed: input.seed,
        format: input.specs?.format || 'png',
      });
      timings['generation'] = Date.now() - generationStart;

      const imageUrl = result.uri;

      // Download and save the image
      const saveStart = Date.now();
      const savedImageInfo = await this.saveImage(imageUrl, context.executionId, result.metadata.format, result.metadata.width, result.metadata.height);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Intro image generated successfully in ${totalTime}ms via provider '${provider.providerId}'`);

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
          model: result.metadata.model,
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
              revised_prompt: result.metadata.revisedPrompt,
              provider_id: result.metadata.providerId,
              model: result.metadata.model,
            },
          },
        ],
        {
          timings_ms: { total: totalTime, ...timings },
          provider_calls: [
            {
              provider: result.metadata.providerId,
              model: result.metadata.model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;

      // Handle ProviderError specifically for better error messages
      if (error instanceof ProviderError) {
        this.logger.error(`Provider error during image generation: [${error.code}] ${error.message} (provider: ${error.providerId})`);
        return skillFailure(error.message, error.code, {
          timings_ms: { total: totalTime, ...timings },
        });
      }

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

  private determineDimensions(specs?: GenerateIntroImageInput['specs']): { width: number; height: number } {
    if (!specs) {
      return { width: 1792, height: 1024 }; // Default to 16:9 landscape
    }

    // Use explicit dimensions if provided
    if (specs.width && specs.height) {
      return { width: specs.width, height: specs.height };
    }

    // Map aspect ratios to dimensions
    const aspectRatio = specs.aspect_ratio;
    if (aspectRatio === '16:9') {
      return { width: 1792, height: 1024 };
    } else if (aspectRatio === '9:16') {
      return { width: 1024, height: 1792 };
    } else if (aspectRatio === '1:1') {
      return { width: 1024, height: 1024 };
    }

    return { width: 1024, height: 1024 };
  }

  private async saveImage(
    imageUrl: string,
    executionId: string,
    format: string,
    width: number,
    height: number,
  ): Promise<{ uri: string; width: number; height: number; format: string; fileSize: number }> {
    // Validate URL origin (SSRF prevention)
    this.validateImageUrl(imageUrl);

    // Ensure output directory exists (async mkdir with recursive handles existence check)
    const outputPath = path.join(this.outputDir, executionId);
    await fs.mkdir(outputPath, { recursive: true });

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `intro-frame.${format}`;
    const filePath = path.join(outputPath, filename);

    await fs.writeFile(filePath, buffer);
    const stats = await fs.stat(filePath);

    return {
      uri: filePath,
      width,
      height,
      format,
      fileSize: stats.size,
    };
  }

  private validateImageUrl(url: string): void {
    try {
      const parsed = new URL(url);
      const isAllowed = this.ALLOWED_IMAGE_DOMAINS.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
      if (!isAllowed) {
        this.logger.warn(`Image URL from untrusted domain blocked: ${parsed.hostname}`);
        throw new Error(`Image URL from untrusted domain: ${parsed.hostname}`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid image URL: ${url}`);
      }
      throw error;
    }
  }
}
