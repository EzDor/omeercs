import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateBgmTrackInput, GenerateBgmTrackOutput, SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BPM = 120;
const DEFAULT_FORMAT = 'mp3';
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_BITRATE = 192;
const DEFAULT_CHANNELS = 2;

@Injectable()
export class GenerateBgmTrackHandler implements SkillHandler<GenerateBgmTrackInput, GenerateBgmTrackOutput> {
  private readonly logger = new Logger(GenerateBgmTrackHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly audioGenerationTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('AUDIO_GENERATION_MODEL') || 'suno-v3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.audioGenerationTimeout = configService.get<number>('AUDIO_GENERATION_TIMEOUT_MS') || 300000;
  }

  async execute(input: GenerateBgmTrackInput, context: SkillExecutionContext): Promise<SkillResult<GenerateBgmTrackOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_bgm_track for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Build the music generation prompt
      const promptStart = Date.now();
      const musicPrompt = this.buildMusicPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      // Determine audio specs
      const specs = this.normalizeSpecs(input.specs);
      const bpm = input.bpm || DEFAULT_BPM;

      // Call audio generation API
      const generationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.audioGeneration({
        model,
        prompt: musicPrompt,
        duration_sec: input.duration_sec,
        format: specs.format,
        sample_rate: specs.sample_rate,
        bitrate_kbps: specs.bitrate_kbps,
        channels: specs.channels,
        seed: input.seed,
        bpm,
        loopable: input.loopable ?? true,
        genre: input.style.genre,
        mood: input.style.mood,
        instruments: input.style.instruments,
      });

      // Handle async generation if needed
      let audioUrl: string | undefined;
      let audioData = response.data?.[0];

      if (response.status === 'pending' || response.status === 'processing') {
        this.logger.log(`Audio generation is async, waiting for completion (ID: ${response.id})`);
        const statusResult = await this.llmClient.waitForAudioGeneration(response.id!, this.audioGenerationTimeout);

        if (statusResult.status === 'failed') {
          return skillFailure(statusResult.error || 'Audio generation failed', 'GENERATION_FAILED', {
            timings_ms: { total: Date.now() - startTime, ...timings },
          });
        }

        if (statusResult.data) {
          audioData = statusResult.data;
        }
      }

      timings['generation'] = Date.now() - generationStart;

      audioUrl = audioData?.url;
      if (!audioUrl) {
        return skillFailure('No audio URL in response', 'NO_AUDIO_URL', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      // Download and save the audio
      const saveStart = Date.now();
      const savedAudioInfo = await this.saveAudio(audioUrl, context.executionId, specs.format);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`BGM track generated successfully in ${totalTime}ms`);

      const output: GenerateBgmTrackOutput = {
        audio_uri: savedAudioInfo.uri,
        duration_sec: audioData?.duration_sec || input.duration_sec,
        bpm: audioData?.bpm || bpm,
        format: specs.format,
        sample_rate: audioData?.sample_rate || specs.sample_rate,
        bitrate_kbps: audioData?.bitrate_kbps || specs.bitrate_kbps,
        channels: specs.channels,
        file_size_bytes: savedAudioInfo.fileSize,
        is_loopable: input.loopable ?? true,
        generation_params: {
          style: input.style.genre,
          mood: input.style.mood,
          bpm,
          custom_prompt: input.custom_prompt,
          seed: input.seed,
          model,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'audio/bgm',
            uri: savedAudioInfo.uri,
            metadata: {
              duration_sec: output.duration_sec,
              bpm: output.bpm,
              format: output.format,
              sample_rate: output.sample_rate,
              is_loopable: output.is_loopable,
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
      this.logger.error(`Failed to generate BGM track: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during audio generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildMusicPrompt(input: GenerateBgmTrackInput): string {
    const parts: string[] = [];

    // Start with custom prompt if provided
    if (input.custom_prompt) {
      parts.push(input.custom_prompt);
    } else {
      parts.push(`Create ${input.style.genre} background music`);
    }

    // Add mood
    if (input.style.mood) {
      const moodDescriptions: Record<string, string> = {
        happy: 'with a happy, uplifting feel',
        sad: 'with a melancholic, emotional tone',
        tense: 'with building tension and suspense',
        relaxed: 'with a calm, relaxing atmosphere',
        epic: 'with epic, cinematic grandeur',
        playful: 'with a fun, playful character',
        dramatic: 'with dramatic intensity',
        neutral: 'with a balanced, versatile feel',
      };
      parts.push(moodDescriptions[input.style.mood] || input.style.mood);
    }

    // Add energy level
    if (input.style.energy_level !== undefined) {
      const energyDesc = input.style.energy_level < 0.3 ? 'low energy' : input.style.energy_level < 0.7 ? 'medium energy' : 'high energy';
      parts.push(`with ${energyDesc}`);
    }

    // Add instrument preferences
    if (input.style.instruments) {
      parts.push(`featuring ${input.style.instruments}`);
    }

    // Add BPM reference
    if (input.bpm) {
      parts.push(`at ${input.bpm} BPM`);
    }

    // Add loop requirement
    if (input.loopable) {
      parts.push('designed to loop seamlessly');
    }

    return parts.join(', ');
  }

  private normalizeSpecs(specs?: GenerateBgmTrackInput['specs']): {
    format: string;
    bitrate_kbps: number;
    sample_rate: number;
    channels: number;
  } {
    return {
      format: specs?.format || DEFAULT_FORMAT,
      bitrate_kbps: specs?.bitrate_kbps || DEFAULT_BITRATE,
      sample_rate: specs?.sample_rate || DEFAULT_SAMPLE_RATE,
      channels: specs?.channels || DEFAULT_CHANNELS,
    };
  }

  private async saveAudio(audioUrl: string, executionId: string, format: string): Promise<{ uri: string; fileSize: number }> {
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `bgm.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
