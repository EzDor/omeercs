import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { GenerateBgmTrackInput, GenerateBgmTrackOutput } from '@agentic-template/dto/src/skills/generate-bgm-track.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import { isAllowedUrl, fetchWithTimeout } from './network-safety.utils';

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
  private readonly outputDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly audioProviderRegistry: AudioProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
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
    const message = error instanceof ProviderError ? error.getUserSafeMessage() : error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`${logPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return skillFailure(message, 'EXECUTION_ERROR', {
      timings_ms: { total: totalTime, ...timings },
    });
  }

  async execute(input: GenerateBgmTrackInput, context: SkillExecutionContext): Promise<SkillResult<GenerateBgmTrackOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_bgm_track for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const promptStart = Date.now();
      const musicPrompt = this.buildMusicPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      const specs = this.normalizeSpecs(input.specs);
      const bpm = input.bpm || DEFAULT_BPM;

      const generationStart = Date.now();
      const bgmProvider = this.audioProviderRegistry.routeByAudioType('bgm');
      if (!bgmProvider.generateAudioAndWait) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, bgmProvider.providerId, 'Provider does not support synchronous audio generation');
      }

      const result = await bgmProvider.generateAudioAndWait({
        prompt: musicPrompt,
        durationSec: input.duration_sec,
        audioType: 'music',
        sampleRate: specs.sample_rate,
        channels: specs.channels,
      });

      timings['generation'] = Date.now() - generationStart;

      const actualFormat = result.metadata.format || specs.format;
      const saveStart = Date.now();
      const savedAudioInfo = await this.saveAudio(result.uri, context.executionId, actualFormat);
      timings['save'] = Date.now() - saveStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`BGM track generated successfully in ${totalTime}ms`);

      const output = this.buildOutput(
        savedAudioInfo.uri,
        result.metadata.durationSec,
        bpm,
        { ...specs, format: actualFormat, sample_rate: result.metadata.sampleRate, channels: result.metadata.channels },
        savedAudioInfo.fileSize,
        input.loopable ?? true,
        {
          style: input.style.genre,
          mood: input.style.mood,
          bpm,
          custom_prompt: input.custom_prompt,
          seed: input.seed,
          model: result.metadata.model,
        },
      );

      return this.buildSuccessResult(output, savedAudioInfo.uri, totalTime, timings, result.metadata.providerId, result.metadata.model);
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

    if (!isAllowedUrl(audioUrl)) {
      throw new Error(`Blocked URL (SSRF prevention): ${audioUrl}`);
    }

    const response = await fetchWithTimeout(audioUrl);
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
