import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProviderRegistry } from '@agentic-template/common/src/providers/registries/video-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { isAllowedUrl } from '@agentic-template/common/src/providers/network-safety.utils';
import { GenerateIntroVideoLoopInput, GenerateIntroVideoLoopOutput } from '@agentic-template/dto/src/skills/generate-intro-video-loop.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

@Injectable()
export class GenerateIntroVideoLoopHandler implements SkillHandler<GenerateIntroVideoLoopInput, GenerateIntroVideoLoopOutput> {
  private readonly logger = new Logger(GenerateIntroVideoLoopHandler.name);
  private readonly outputDir: string;

  private readonly ALLOWED_VIDEO_DOMAINS = ['runway-cdn.com', 'storage.googleapis.com', 'replicate.delivery', 'api.stability.ai', 'stability.ai', 'api.nanobanana.com'];

  constructor(
    private readonly configService: ConfigService,
    private readonly videoProviderRegistry: VideoProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: GenerateIntroVideoLoopInput, context: SkillExecutionContext): Promise<SkillResult<GenerateIntroVideoLoopOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_intro_video_loop for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const prepareStart = Date.now();
      const imageData = this.prepareImageData(input.image_uri);
      timings['prepare'] = Date.now() - prepareStart;

      const motionPrompt = this.buildMotionPrompt(input);
      const specs = this.normalizeSpecs(input.specs);

      const generationStart = Date.now();
      const provider = this.videoProviderRegistry.getProvider();
      if (!provider.generateVideoAndWait) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, provider.providerId, 'Provider does not support synchronous video generation');
      }

      const result = await provider.generateVideoAndWait({
        prompt: motionPrompt,
        durationSec: specs.duration_sec,
        fps: specs.fps,
        resolution: `${specs.width}x${specs.height}`,
        inputUris: imageData.isUrl ? [imageData.value] : undefined,
        seed: input.seed,
      });

      timings['generation'] = Date.now() - generationStart;

      const saveStart = Date.now();
      const savedVideoInfo = await this.saveVideo(result.uri, context.executionId, specs.format);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Intro video loop generated successfully in ${totalTime}ms`);

      const output: GenerateIntroVideoLoopOutput = {
        video_uri: savedVideoInfo.uri,
        duration_sec: specs.duration_sec,
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: savedVideoInfo.fileSize,
        is_loopable: true,
        generation_params: {
          source_image_uri: input.image_uri,
          motion_type: input.motion_params?.motion_type,
          motion_prompt: motionPrompt,
          seed: input.seed,
          model: result.metadata.model,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'video/intro-loop',
            uri: savedVideoInfo.uri,
            metadata: {
              duration_sec: output.duration_sec,
              width: output.width,
              height: output.height,
              fps: output.fps,
              format: output.format,
              codec: output.codec,
              is_loopable: true,
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
      this.logger.error(`Failed to generate intro video loop: ${error instanceof Error ? error.message : 'Unknown error'}`);

      const message = error instanceof ProviderError ? error.getUserSafeMessage() : error instanceof Error ? error.message : 'Unknown error during video generation';
      return skillFailure(message, 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildMotionPrompt(input: GenerateIntroVideoLoopInput): string {
    const parts: string[] = [];

    if (input.motion_prompt) {
      parts.push(input.motion_prompt);
    } else {
      parts.push('Create a subtle, seamless looping animation');
    }

    if (input.motion_params) {
      const { motion_type, direction, intensity } = input.motion_params;

      if (motion_type) {
        const motionDescriptions: Record<string, string> = {
          pan: 'gentle panning movement',
          zoom: 'slow zoom effect',
          rotate: 'subtle rotation',
          parallax: 'parallax depth effect',
          subtle_movement: 'very subtle organic movement',
          breathing: 'gentle breathing/pulsing effect',
        };
        parts.push(motionDescriptions[motion_type] || motion_type);
      }

      if (direction) {
        parts.push(`moving ${direction}`);
      }

      if (intensity !== undefined) {
        const intensityDesc = intensity < 0.3 ? 'very subtle' : intensity < 0.6 ? 'moderate' : 'noticeable';
        parts.push(`with ${intensityDesc} intensity`);
      }
    }

    if (input.loop_config?.seamless !== false) {
      parts.push('ensuring seamless loop transition');
    }

    return parts.join(', ');
  }

  private normalizeSpecs(specs?: GenerateIntroVideoLoopInput['specs']): {
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
    const filename = `intro-loop.${format}`;
    const filePath = path.join(outputPath, filename);

    await fsPromises.writeFile(filePath, buffer);

    const stats = await fsPromises.stat(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
