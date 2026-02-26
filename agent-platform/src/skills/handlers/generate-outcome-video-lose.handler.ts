import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProviderRegistry } from '@agentic-template/common/src/providers/registries/video-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { isAllowedUrl } from '@agentic-template/common/src/providers/network-safety.utils';
import { GenerateOutcomeVideoLoseInput, GenerateOutcomeVideoOutput } from '@agentic-template/dto/src/skills/generate-outcome-video.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const DEFAULT_LOSE_TEXT = 'Better luck next time!';

@Injectable()
export class GenerateOutcomeVideoLoseHandler implements SkillHandler<GenerateOutcomeVideoLoseInput, GenerateOutcomeVideoOutput> {
  private readonly logger = new Logger(GenerateOutcomeVideoLoseHandler.name);
  private readonly outputDir: string;

  private readonly ALLOWED_VIDEO_DOMAINS = ['runway-cdn.com', 'storage.googleapis.com', 'replicate.delivery', 'api.stability.ai', 'stability.ai', 'api.nanobanana.com'];

  constructor(
    private readonly configService: ConfigService,
    private readonly videoProviderRegistry: VideoProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: GenerateOutcomeVideoLoseInput, context: SkillExecutionContext): Promise<SkillResult<GenerateOutcomeVideoOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_outcome_video_lose for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const promptStart = Date.now();
      const videoPrompt = this.buildLoseVideoPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      const specs = this.normalizeSpecs(input.specs);

      let inputUris: string[] | undefined;
      if (input.assets) {
        const backgroundAsset = input.assets.find((a) => a.type === 'background');
        if (backgroundAsset) {
          const imageData = this.prepareImageData(backgroundAsset.uri);
          if (imageData.isUrl) {
            inputUris = [imageData.value];
          }
        }
      }

      const generationStart = Date.now();
      const provider = this.videoProviderRegistry.getProvider();
      if (!provider.generateVideoAndWait) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, provider.providerId, 'Provider does not support synchronous video generation');
      }

      const result = await provider.generateVideoAndWait({
        prompt: videoPrompt,
        durationSec: specs.duration_sec,
        fps: specs.fps,
        resolution: `${specs.width}x${specs.height}`,
        inputUris,
        seed: input.seed,
      });

      timings['generation'] = Date.now() - generationStart;

      const saveStart = Date.now();
      const savedVideoInfo = await this.saveVideo(result.uri, context.executionId, specs.format);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Lose outcome video generated successfully in ${totalTime}ms`);

      const loseText = input.lose_text || input.text_overlay?.text || DEFAULT_LOSE_TEXT;

      const output: GenerateOutcomeVideoOutput = {
        video_uri: savedVideoInfo.uri,
        outcome_type: 'lose',
        duration_sec: specs.duration_sec,
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: savedVideoInfo.fileSize,
        generation_params: {
          prompt: videoPrompt,
          outcome_text: loseText,
          seed: input.seed,
          model: result.metadata.model,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'video/outcome-lose',
            uri: savedVideoInfo.uri,
            metadata: {
              outcome_type: 'lose',
              duration_sec: output.duration_sec,
              width: output.width,
              height: output.height,
              fps: output.fps,
              format: output.format,
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
      this.logger.error(`Failed to generate lose outcome video: ${error instanceof Error ? error.message : 'Unknown error'}`);

      const message = error instanceof ProviderError ? error.getUserSafeMessage() : error instanceof Error ? error.message : 'Unknown error during video generation';
      return skillFailure(message, 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildLoseVideoPrompt(input: GenerateOutcomeVideoLoseInput): string {
    const parts: string[] = [];

    if (input.prompt) {
      parts.push(input.prompt);
    } else {
      parts.push('Create an encouraging "try again" animation');
    }

    if (input.theme) {
      if (input.theme.mood) {
        const moodDescriptions: Record<string, string> = {
          energetic: 'with motivating energy',
          calm: 'with gentle, reassuring motion',
          exciting: 'with dynamic, encouraging visuals',
          celebratory: 'with hopeful atmosphere',
          sympathetic: 'with warm, comforting feeling',
          encouraging: 'with uplifting, positive message',
        };
        parts.push(moodDescriptions[input.theme.mood] || input.theme.mood);
      }

      if (input.theme.style) {
        parts.push(`in a ${input.theme.style} style`);
      }

      if (input.theme.primary_color) {
        parts.push(`using ${input.theme.primary_color} as the primary color`);
      }
    }

    const loseText = input.lose_text || input.text_overlay?.text || DEFAULT_LOSE_TEXT;
    parts.push(`displaying "${loseText}" with an encouraging tone`);

    parts.push('maintaining a positive, motivating atmosphere');

    return parts.join(', ');
  }

  private normalizeSpecs(specs?: GenerateOutcomeVideoLoseInput['specs']): {
    duration_sec: number;
    fps: number;
    width: number;
    height: number;
    format: 'mp4' | 'webm';
    codec: string;
  } {
    return {
      duration_sec: specs?.duration_sec || 5,
      fps: specs?.fps || 30,
      width: specs?.width || 1920,
      height: specs?.height || 1080,
      format: specs?.format || 'mp4',
      codec: specs?.codec || 'h264',
    };
  }

  private prepareImageData(imageUri: string): { value: string; isUrl: boolean } {
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      if (!isAllowedUrl(imageUri)) {
        throw new Error('Blocked image URL (SSRF prevention)');
      }
      return { value: imageUri, isUrl: true };
    }

    throw new Error('Local image files must be uploaded to a URL before video generation');
  }

  private validateVideoUrl(url: string): void {
    const parsed = new URL(url);
    const isAllowed = this.ALLOWED_VIDEO_DOMAINS.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    if (!isAllowed) {
      throw new Error(`Video URL from untrusted domain: ${parsed.hostname}`);
    }
  }

  private async saveVideo(videoUrl: string, executionId: string, format: string): Promise<{ uri: string; fileSize: number }> {
    this.validateVideoUrl(videoUrl);

    const outputPath = path.join(this.outputDir, executionId);
    await fsPromises.mkdir(outputPath, { recursive: true });

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `outcome-lose.${format}`;
    const filePath = path.join(outputPath, filename);

    await fsPromises.writeFile(filePath, buffer);

    const stats = await fsPromises.stat(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
