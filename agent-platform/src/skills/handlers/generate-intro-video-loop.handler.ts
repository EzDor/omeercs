import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateIntroVideoLoopInput, GenerateIntroVideoLoopOutput } from '@agentic-template/dto/src/skills/generate-intro-video-loop.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GenerateIntroVideoLoopHandler implements SkillHandler<GenerateIntroVideoLoopInput, GenerateIntroVideoLoopOutput> {
  private readonly logger = new Logger(GenerateIntroVideoLoopHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly videoGenerationTimeout: number;

  private readonly useStubProvider: boolean;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('VIDEO_GENERATION_MODEL') || 'runway-gen3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.videoGenerationTimeout = configService.get<number>('VIDEO_GENERATION_TIMEOUT_MS') || 300000;
    this.useStubProvider = configService.get<string>('VIDEO_PROVIDER_STUB') === 'true';
  }

  async execute(input: GenerateIntroVideoLoopInput, context: SkillExecutionContext): Promise<SkillResult<GenerateIntroVideoLoopOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_intro_video_loop for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      if (this.useStubProvider) {
        return this.executeStub(input, context, startTime, timings);
      }

      // Prepare image for video generation
      const prepareStart = Date.now();
      const imageData = this.prepareImageData(input.image_uri);
      timings['prepare'] = Date.now() - prepareStart;

      // Build motion prompt
      const motionPrompt = this.buildMotionPrompt(input);

      // Determine video specs
      const specs = this.normalizeSpecs(input.specs);

      // Call video generation API
      const generationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.videoGeneration({
        model,
        prompt: motionPrompt,
        image_url: imageData.isUrl ? imageData.value : undefined,
        image_base64: !imageData.isUrl ? imageData.value : undefined,
        duration: specs.duration_sec,
        fps: specs.fps,
        width: specs.width,
        height: specs.height,
        seed: input.seed,
      });

      // Handle async generation if needed
      let videoData = response.data?.[0];

      if (response.status === 'pending' || response.status === 'processing') {
        // Wait for async generation to complete
        this.logger.log(`Video generation is async, waiting for completion (ID: ${response.id})`);
        const statusResult = await this.llmClient.waitForVideoGeneration(response.id!, this.videoGenerationTimeout);

        if (statusResult.status === 'failed') {
          return skillFailure(statusResult.error || 'Video generation failed', 'GENERATION_FAILED', {
            timings_ms: { total: Date.now() - startTime, ...timings },
          });
        }

        if (statusResult.data) {
          videoData = statusResult.data;
        }
      }

      timings['generation'] = Date.now() - generationStart;

      const videoUrl = videoData?.url;
      if (!videoUrl) {
        return skillFailure('No video URL in response', 'NO_VIDEO_URL', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      // Download and save the video
      const saveStart = Date.now();
      const savedVideoInfo = await this.saveVideo(videoUrl, context.executionId, specs.format);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Intro video loop generated successfully in ${totalTime}ms`);

      const output: GenerateIntroVideoLoopOutput = {
        video_uri: savedVideoInfo.uri,
        duration_sec: videoData?.duration_sec || specs.duration_sec,
        width: videoData?.width || specs.width,
        height: videoData?.height || specs.height,
        fps: videoData?.fps || specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: savedVideoInfo.fileSize,
        is_loopable: true,
        generation_params: {
          source_image_uri: input.image_uri,
          motion_type: input.motion_params?.motion_type,
          motion_prompt: motionPrompt,
          seed: input.seed,
          model,
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
              provider: 'litellm',
              model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate intro video loop: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during video generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private executeStub(
    input: GenerateIntroVideoLoopInput,
    context: SkillExecutionContext,
    startTime: number,
    timings: Record<string, number>,
  ): SkillResult<GenerateIntroVideoLoopOutput> {
    this.logger.log(`Using stub video provider for intro video loop`);
    const specs = this.normalizeSpecs(input.specs);
    const outputPath = path.join(this.outputDir, context.executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    const filePath = path.join(outputPath, `intro-loop.${specs.format}`);
    fs.writeFileSync(filePath, Buffer.alloc(1024));
    const totalTime = Date.now() - startTime;

    return skillSuccess(
      {
        video_uri: filePath,
        duration_sec: specs.duration_sec,
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: 1024,
        is_loopable: true,
        generation_params: { source_image_uri: input.image_uri, motion_prompt: 'stub', model: 'stub-generator' },
      },
      [{ artifact_type: 'video/intro-loop', uri: filePath, metadata: { duration_sec: specs.duration_sec, width: specs.width, height: specs.height, is_loopable: true } }],
      { timings_ms: { total: totalTime, ...timings }, provider_calls: [{ provider: 'stub', model: 'stub-generator', duration_ms: 0 }] },
    );
  }

  private buildMotionPrompt(input: GenerateIntroVideoLoopInput): string {
    const parts: string[] = [];

    // Start with custom motion prompt if provided
    if (input.motion_prompt) {
      parts.push(input.motion_prompt);
    } else {
      parts.push('Create a subtle, seamless looping animation');
    }

    // Add motion parameters
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

    // Add loop requirements
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
    // If it's already a URL, return as-is
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      return { value: imageUri, isUrl: true };
    }

    // If it's a local file, convert to base64
    if (fs.existsSync(imageUri)) {
      const buffer = fs.readFileSync(imageUri);
      const base64 = buffer.toString('base64');
      const ext = path.extname(imageUri).toLowerCase().slice(1);
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { value: `data:${mimeType};base64,${base64}`, isUrl: false };
    }

    throw new Error(`Invalid image URI: ${imageUri}`);
  }

  private async saveVideo(videoUrl: string, executionId: string, format: string): Promise<{ uri: string; fileSize: number }> {
    // Ensure output directory exists
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Download the video
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `intro-loop.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
