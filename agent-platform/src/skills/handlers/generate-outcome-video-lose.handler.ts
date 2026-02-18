import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateOutcomeVideoLoseInput, GenerateOutcomeVideoOutput } from '@agentic-template/dto/src/skills/generate-outcome-video.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_LOSE_TEXT = 'Better luck next time!';

@Injectable()
export class GenerateOutcomeVideoLoseHandler implements SkillHandler<GenerateOutcomeVideoLoseInput, GenerateOutcomeVideoOutput> {
  private readonly logger = new Logger(GenerateOutcomeVideoLoseHandler.name);
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

  async execute(input: GenerateOutcomeVideoLoseInput, context: SkillExecutionContext): Promise<SkillResult<GenerateOutcomeVideoOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_outcome_video_lose for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      if (this.useStubProvider) {
        return this.executeStub(input, context, startTime, timings);
      }

      // Build the lose video prompt
      const promptStart = Date.now();
      const videoPrompt = this.buildLoseVideoPrompt(input);
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
      this.logger.log(`Lose outcome video generated successfully in ${totalTime}ms`);

      const loseText = input.lose_text || input.text_overlay?.text || DEFAULT_LOSE_TEXT;

      const output: GenerateOutcomeVideoOutput = {
        video_uri: savedVideoInfo.uri,
        outcome_type: 'lose',
        duration_sec: videoData?.duration_sec || specs.duration_sec,
        width: videoData?.width || specs.width,
        height: videoData?.height || specs.height,
        fps: videoData?.fps || specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: savedVideoInfo.fileSize,
        generation_params: {
          prompt: videoPrompt,
          outcome_text: loseText,
          seed: input.seed,
          model,
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
              provider: 'litellm',
              model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate lose outcome video: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during video generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildLoseVideoPrompt(input: GenerateOutcomeVideoLoseInput): string {
    const parts: string[] = [];

    // Start with custom prompt if provided
    if (input.prompt) {
      parts.push(input.prompt);
    } else {
      parts.push('Create an encouraging "try again" animation');
    }

    // Add theme elements
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

    // Add lose text context (encouraging tone)
    const loseText = input.lose_text || input.text_overlay?.text || DEFAULT_LOSE_TEXT;
    parts.push(`displaying "${loseText}" with an encouraging tone`);

    // Make sure it's not discouraging
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
      return { value: imageUri, isUrl: true };
    }

    if (fs.existsSync(imageUri)) {
      const buffer = fs.readFileSync(imageUri);
      const base64 = buffer.toString('base64');
      const ext = path.extname(imageUri).toLowerCase().slice(1);
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { value: `data:${mimeType};base64,${base64}`, isUrl: false };
    }

    throw new Error(`Invalid image URI: ${imageUri}`);
  }

  private executeStub(
    input: GenerateOutcomeVideoLoseInput,
    context: SkillExecutionContext,
    startTime: number,
    timings: Record<string, number>,
  ): SkillResult<GenerateOutcomeVideoOutput> {
    this.logger.log(`Using stub video provider for lose outcome`);
    const specs = this.normalizeSpecs(input.specs);
    const outputPath = path.join(this.outputDir, context.executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    const filePath = path.join(outputPath, `outcome-lose.${specs.format}`);
    fs.writeFileSync(filePath, Buffer.alloc(1024));
    const loseText = input.lose_text || input.text_overlay?.text || DEFAULT_LOSE_TEXT;
    const totalTime = Date.now() - startTime;

    return skillSuccess(
      {
        video_uri: filePath,
        outcome_type: 'lose',
        duration_sec: specs.duration_sec,
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        format: specs.format,
        codec: specs.codec,
        file_size_bytes: 1024,
        generation_params: { prompt: 'stub', outcome_text: loseText, model: 'stub-generator' },
      },
      [{ artifact_type: 'video/outcome-lose', uri: filePath, metadata: { outcome_type: 'lose', duration_sec: specs.duration_sec, width: specs.width, height: specs.height } }],
      { timings_ms: { total: totalTime, ...timings }, provider_calls: [{ provider: 'stub', model: 'stub-generator', duration_ms: 0 }] },
    );
  }

  private async saveVideo(videoUrl: string, executionId: string, format: string): Promise<{ uri: string; fileSize: number }> {
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `outcome-lose.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
