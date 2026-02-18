import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateOutcomeVideoWinInput, GenerateOutcomeVideoOutput } from '@agentic-template/dto/src/skills/generate-outcome-video.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const DEFAULT_WIN_TEXT = 'Congratulations! You Win!';

@Injectable()
export class GenerateOutcomeVideoWinHandler implements SkillHandler<GenerateOutcomeVideoWinInput, GenerateOutcomeVideoOutput> {
  private readonly logger = new Logger(GenerateOutcomeVideoWinHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly videoGenerationTimeout: number;

  private readonly useStubProvider: boolean;

  private readonly ALLOWED_VIDEO_DOMAINS = ['runway-cdn.com', 'storage.googleapis.com', 'replicate.delivery', 'api.stability.ai', 'stability.ai'];

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('VIDEO_GENERATION_MODEL') || 'runway-gen3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.videoGenerationTimeout = configService.get<number>('VIDEO_GENERATION_TIMEOUT_MS') || 300000;
    this.useStubProvider = configService.get<string>('VIDEO_PROVIDER_STUB') === 'true';
    if (this.useStubProvider && configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Stub video provider must not be used in production');
    }
  }

  async execute(input: GenerateOutcomeVideoWinInput, context: SkillExecutionContext): Promise<SkillResult<GenerateOutcomeVideoOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_outcome_video_win for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      if (this.useStubProvider) {
        return this.executeStub(input, context, startTime, timings);
      }

      // Build the win video prompt
      const promptStart = Date.now();
      const videoPrompt = this.buildWinVideoPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      // Determine video specs
      const specs = this.normalizeSpecs(input.specs);

      // Process any background assets
      let imageUrl: string | undefined;
      if (input.assets) {
        const backgroundAsset = input.assets.find((a) => a.type === 'background');
        if (backgroundAsset) {
          const imageData = this.prepareImageData(backgroundAsset.uri);
          imageUrl = imageData.isUrl ? imageData.value : undefined;
        }
      }

      // Call video generation API
      const generationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.videoGeneration({
        model,
        prompt: videoPrompt,
        image_url: imageUrl,
        duration: specs.duration_sec,
        fps: specs.fps,
        width: specs.width,
        height: specs.height,
        seed: input.seed,
      });

      // Handle async generation if needed
      let videoData = response.data?.[0];

      if (response.status === 'pending' || response.status === 'processing') {
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
      this.logger.log(`Win outcome video generated successfully in ${totalTime}ms`);

      const winText = input.win_text || input.text_overlay?.text || DEFAULT_WIN_TEXT;

      const output: GenerateOutcomeVideoOutput = {
        video_uri: savedVideoInfo.uri,
        outcome_type: 'win',
        duration_sec: videoData?.duration_sec || specs.duration_sec,
        width: videoData?.width || specs.width,
        height: videoData?.height || specs.height,
        fps: videoData?.fps || specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: savedVideoInfo.fileSize,
        generation_params: {
          prompt: videoPrompt,
          outcome_text: winText,
          seed: input.seed,
          model,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'video/outcome-win',
            uri: savedVideoInfo.uri,
            metadata: {
              outcome_type: 'win',
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
              provider: 'litellm',
              model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate win outcome video: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during video generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildWinVideoPrompt(input: GenerateOutcomeVideoWinInput): string {
    const parts: string[] = [];

    // Start with custom prompt if provided
    if (input.prompt) {
      parts.push(input.prompt);
    } else {
      parts.push('Create a celebratory win animation');
    }

    // Add theme elements
    if (input.theme) {
      if (input.theme.mood) {
        const moodDescriptions: Record<string, string> = {
          energetic: 'with energetic, dynamic movement',
          calm: 'with smooth, satisfying motion',
          exciting: 'with exciting, triumphant visuals',
          celebratory: 'with celebration effects like confetti and sparkles',
          sympathetic: 'with warm, welcoming atmosphere',
          encouraging: 'with uplifting, positive energy',
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

    // Add win text context
    const winText = input.win_text || input.text_overlay?.text || DEFAULT_WIN_TEXT;
    parts.push(`displaying "${winText}"`);

    // Add asset context
    if (input.assets) {
      const hasConfetti = input.assets.some((a) => a.type === 'confetti' || a.type === 'particle_effect');
      if (hasConfetti) {
        parts.push('with confetti and particle effects');
      }
    }

    return parts.join(', ');
  }

  private normalizeSpecs(specs?: GenerateOutcomeVideoWinInput['specs']): {
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

  private validateLocalPath(uri: string): void {
    const resolved = path.resolve(uri);
    const allowedBase = path.resolve(this.outputDir) + path.sep;
    if (!resolved.startsWith(allowedBase)) {
      throw new Error(`Access denied: path outside allowed directory`);
    }
  }

  private prepareImageData(imageUri: string): { value: string; isUrl: boolean } {
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      return { value: imageUri, isUrl: true };
    }

    this.validateLocalPath(imageUri);

    if (fs.existsSync(imageUri)) {
      const buffer = fs.readFileSync(imageUri);
      const base64 = buffer.toString('base64');
      const ext = path.extname(imageUri).toLowerCase().slice(1);
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { value: `data:${mimeType};base64,${base64}`, isUrl: false };
    }

    throw new Error(`Invalid image URI: ${imageUri}`);
  }

  private async executeStub(
    input: GenerateOutcomeVideoWinInput,
    context: SkillExecutionContext,
    startTime: number,
    timings: Record<string, number>,
  ): Promise<SkillResult<GenerateOutcomeVideoOutput>> {
    this.logger.log(`Using stub video provider for win outcome`);
    const specs = this.normalizeSpecs(input.specs);
    const outputPath = path.join(this.outputDir, context.executionId);
    await fsPromises.mkdir(outputPath, { recursive: true });
    const filePath = path.join(outputPath, `outcome-win.${specs.format}`);
    await fsPromises.writeFile(filePath, Buffer.alloc(1024));
    const winText = input.win_text || input.text_overlay?.text || DEFAULT_WIN_TEXT;
    const totalTime = Date.now() - startTime;

    return skillSuccess(
      {
        video_uri: filePath,
        outcome_type: 'win',
        duration_sec: specs.duration_sec,
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: 1024,
        generation_params: { prompt: 'stub', outcome_text: winText, model: 'stub-generator' },
      },
      [{ artifact_type: 'video/outcome-win', uri: filePath, metadata: { outcome_type: 'win', duration_sec: specs.duration_sec, width: specs.width, height: specs.height } }],
      { timings_ms: { total: totalTime, ...timings }, provider_calls: [{ provider: 'stub', model: 'stub-generator', duration_ms: 0 }] },
    );
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
    const filename = `outcome-win.${format}`;
    const filePath = path.join(outputPath, filename);

    await fsPromises.writeFile(filePath, buffer);

    const stats = await fsPromises.stat(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
