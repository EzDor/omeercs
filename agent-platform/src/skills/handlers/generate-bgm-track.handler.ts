import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';
import { GenerateBgmTrackInput, GenerateBgmTrackOutput } from '@agentic-template/dto/src/skills/generate-bgm-track.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BPM = 120;
const DEFAULT_FORMAT = 'mp3';
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_BITRATE = 192;
const DEFAULT_CHANNELS = 2;

const LOW_ENERGY_THRESHOLD = 0.3;
const HIGH_ENERGY_THRESHOLD = 0.7;

const BGM_ARTIFACT_TYPE = 'audio/bgm';

const MOOD_DESCRIPTIONS: Record<string, string> = {
  happy: 'with a happy, uplifting feel',
  sad: 'with a melancholic, emotional tone',
  tense: 'with building tension and suspense',
  relaxed: 'with a calm, relaxing atmosphere',
  epic: 'with epic, cinematic grandeur',
  playful: 'with a fun, playful character',
  dramatic: 'with dramatic intensity',
  neutral: 'with a balanced, versatile feel',
};

interface NormalizedSpecs {
  format: string;
  bitrate_kbps: number;
  sample_rate: number;
  channels: number;
}

@Injectable()
export class GenerateBgmTrackHandler implements SkillHandler<GenerateBgmTrackInput, GenerateBgmTrackOutput> {
  private readonly logger = new Logger(GenerateBgmTrackHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly audioGenerationTimeout: number;
  private readonly useStubProvider: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly audioProviderRegistry: AudioProviderRegistry,
  ) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('AUDIO_GENERATION_MODEL') || 'suno-v3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.audioGenerationTimeout = configService.get<number>('AUDIO_GENERATION_TIMEOUT_MS') || 300000;
    const stubEnvValue = configService.get<string>('AUDIO_PROVIDER_STUB');
    this.useStubProvider = stubEnvValue === 'true';
    this.logger.log(`GenerateBgmTrackHandler initialized: AUDIO_PROVIDER_STUB='${stubEnvValue}', useStubProvider=${this.useStubProvider}`);
  }

  private isAsyncGenerationInProgress(status: string | undefined): boolean {
    return status === 'pending' || status === 'processing';
  }

  private getEnergyLevelDescription(energyLevel: number): string {
    if (energyLevel < LOW_ENERGY_THRESHOLD) return 'low energy';
    if (energyLevel < HIGH_ENERGY_THRESHOLD) return 'medium energy';
    return 'high energy';
  }

  private buildOutput(
    audioUri: string,
    durationSec: number,
    bpm: number,
    specs: NormalizedSpecs,
    fileSizeBytes: number,
    isLoopable: boolean,
    generationParams: GenerateBgmTrackOutput['generation_params'],
  ): GenerateBgmTrackOutput {
    return {
      audio_uri: audioUri,
      duration_sec: durationSec,
      bpm,
      format: specs.format,
      sample_rate: specs.sample_rate,
      bitrate_kbps: specs.bitrate_kbps,
      channels: specs.channels,
      file_size_bytes: fileSizeBytes,
      is_loopable: isLoopable,
      generation_params: generationParams,
    };
  }

  private buildSuccessResult(
    output: GenerateBgmTrackOutput,
    artifactUri: string,
    totalTime: number,
    timings: Record<string, number>,
    provider: string,
    model: string,
  ): SkillResult<GenerateBgmTrackOutput> {
    return skillSuccess(
      output,
      [
        {
          artifact_type: BGM_ARTIFACT_TYPE,
          uri: artifactUri,
          metadata: {
            duration_sec: output.duration_sec,
            bpm: output.bpm,
            format: output.format,
            sample_rate: output.sample_rate,
            is_loopable: output.is_loopable,
            provider,
          },
        },
      ],
      {
        timings_ms: { total: totalTime, ...timings },
        provider_calls: [{ provider, model, duration_ms: timings['generation'] }],
      },
    );
  }

  private handleExecutionError(error: unknown, startTime: number, timings: Record<string, number>, logPrefix: string): SkillResult<GenerateBgmTrackOutput> {
    const totalTime = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`${logPrefix}: ${message}`);
    return skillFailure(message, 'EXECUTION_ERROR', {
      timings_ms: { total: totalTime, ...timings },
    });
  }

  async execute(input: GenerateBgmTrackInput, context: SkillExecutionContext): Promise<SkillResult<GenerateBgmTrackOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_bgm_track for tenant ${context.tenantId}, execution ${context.executionId} (stubMode=${this.useStubProvider})`);

    try {
      const promptStart = Date.now();
      const musicPrompt = this.buildMusicPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      const specs = this.normalizeSpecs(input.specs);
      const bpm = input.bpm || DEFAULT_BPM;

      if (this.useStubProvider) {
        return this.executeWithStubProvider(input, specs, bpm, musicPrompt, startTime, timings);
      }

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

      let audioData = response.data?.[0];

      if (this.isAsyncGenerationInProgress(response.status)) {
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

      const audioUrl = audioData?.url;
      if (!audioUrl) {
        return skillFailure('No audio URL in response', 'NO_AUDIO_URL', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      const saveStart = Date.now();
      const savedAudioInfo = await this.saveAudio(audioUrl, context.executionId, specs.format);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`BGM track generated successfully in ${totalTime}ms`);

      const output = this.buildOutput(
        savedAudioInfo.uri,
        audioData?.duration_sec || input.duration_sec,
        audioData?.bpm || bpm,
        { ...specs, sample_rate: audioData?.sample_rate || specs.sample_rate, bitrate_kbps: audioData?.bitrate_kbps || specs.bitrate_kbps },
        savedAudioInfo.fileSize,
        input.loopable ?? true,
        {
          style: input.style.genre,
          mood: input.style.mood,
          bpm,
          custom_prompt: input.custom_prompt,
          seed: input.seed,
          model,
        },
      );

      return this.buildSuccessResult(output, savedAudioInfo.uri, totalTime, timings, 'litellm', model);
    } catch (error) {
      return this.handleExecutionError(error, startTime, timings, 'Failed to generate BGM track');
    }
  }

  private buildMusicPrompt(input: GenerateBgmTrackInput): string {
    const parts: string[] = [];

    if (input.custom_prompt) {
      parts.push(input.custom_prompt);
    } else {
      parts.push(`Create ${input.style.genre} background music`);
    }

    if (input.style.mood) {
      parts.push(MOOD_DESCRIPTIONS[input.style.mood] || input.style.mood);
    }

    if (input.style.energy_level !== undefined) {
      parts.push(`with ${this.getEnergyLevelDescription(input.style.energy_level)}`);
    }

    if (input.style.instruments) {
      parts.push(`featuring ${input.style.instruments}`);
    }

    if (input.bpm) {
      parts.push(`at ${input.bpm} BPM`);
    }

    if (input.loopable) {
      parts.push('designed to loop seamlessly');
    }

    return parts.join(', ');
  }

  private normalizeSpecs(specs?: GenerateBgmTrackInput['specs']): NormalizedSpecs {
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

  private async executeWithStubProvider(
    input: GenerateBgmTrackInput,
    specs: NormalizedSpecs,
    bpm: number,
    musicPrompt: string,
    startTime: number,
    timings: Record<string, number>,
  ): Promise<SkillResult<GenerateBgmTrackOutput>> {
    const generationStart = Date.now();
    this.logger.log(`Using stub audio provider for testing`);

    try {
      const stubProvider = this.audioProviderRegistry.getProvider('stub');
      const result = await stubProvider.generateAudio({
        prompt: musicPrompt,
        durationSec: input.duration_sec,
        sampleRate: specs.sample_rate,
        channels: specs.channels,
        audioType: 'music',
      });

      timings['generation'] = Date.now() - generationStart;
      const totalTime = Date.now() - startTime;

      this.logger.log(`Stub BGM track generated successfully in ${totalTime}ms at ${result.uri}`);

      const fileSizeBytes = fs.existsSync(result.uri) ? fs.statSync(result.uri).size : 0;

      const output = this.buildOutput(
        result.uri,
        result.metadata.durationSec,
        bpm,
        { ...specs, format: result.metadata.format, sample_rate: result.metadata.sampleRate, channels: result.metadata.channels },
        fileSizeBytes,
        input.loopable ?? true,
        {
          style: input.style.genre,
          mood: input.style.mood,
          bpm,
          custom_prompt: input.custom_prompt,
          seed: input.seed,
          model: 'stub-generator',
        },
      );

      return this.buildSuccessResult(output, result.uri, totalTime, timings, 'stub', 'stub-generator');
    } catch (error) {
      return this.handleExecutionError(error, startTime, timings, 'Stub provider failed');
    }
  }
}
