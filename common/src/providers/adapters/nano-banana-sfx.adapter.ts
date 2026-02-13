import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AudioProviderAdapter, AudioGenerationParams, AudioGenerationResult } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';

const DEFAULT_API_URL = 'https://api.nanobanana.com/v1/audio/sfx';
const DEFAULT_DURATION_SEC = 2;
const DEFAULT_FORMAT = 'wav';
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 1;
const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 5;

@Injectable()
export class NanoBananaSfxAdapter implements AudioProviderAdapter {
  readonly providerId = 'nano-banana-sfx';
  private readonly logger = new Logger(NanoBananaSfxAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NANO_BANANA_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('NANO_BANANA_SFX_API_URL') || DEFAULT_API_URL;
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    const startTime = Date.now();
    const durationSec = params.durationSec || DEFAULT_DURATION_SEC;
    const format = params.format || DEFAULT_FORMAT;

    this.logger.debug(`[${this.providerId}] Generating SFX: duration=${durationSec}s, prompt="${params.prompt.substring(0, 50)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          prompt: params.prompt,
          duration: durationSec,
          format,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { job_id, status } = response.data as { job_id: string; status: string };

      if (!job_id) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, 'No job_id returned from provider');
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(`[${this.providerId}] SFX generation submitted in ${durationMs}ms: job_id=${job_id}, status=${status}`);

      return {
        uri: job_id,
        metadata: {
          providerId: this.providerId,
          model: 'nano-banana-sfx',
          durationSec,
          format: DEFAULT_FORMAT,
          sampleRate: OUTPUT_SAMPLE_RATE,
          channels: OUTPUT_CHANNELS,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof ProviderError) {
        this.logger.warn(`[${this.providerId}] Generation failed in ${durationMs}ms: ${error.code}`);
        throw error;
      }

      this.logger.error(`[${this.providerId}] Generation failed in ${durationMs}ms: ${(error as Error).message}`);
      throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, (error as Error).message, { originalError: String(error) });
    }
  }

  supportsParams(params: AudioGenerationParams): boolean {
    if (params.durationSec !== undefined && (params.durationSec < MIN_DURATION_SEC || params.durationSec > MAX_DURATION_SEC)) {
      return false;
    }
    return true;
  }
}
