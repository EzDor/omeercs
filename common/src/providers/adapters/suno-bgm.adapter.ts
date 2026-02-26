import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AudioProviderAdapter, AudioGenerationParams, AudioGenerationResult } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';

const DEFAULT_API_URL = 'https://api.suno.ai/v1/generate';
const DEFAULT_DURATION_SEC = 60;
const DEFAULT_FORMAT = 'mp3';
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 2;
const MIN_DURATION_SEC = 30;
const MAX_DURATION_SEC = 120;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 300000;

@Injectable()
export class SunoBgmAdapter implements AudioProviderAdapter {
  readonly providerId = 'suno-bgm';
  private readonly logger = new Logger(SunoBgmAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SUNO_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('SUNO_API_URL') || DEFAULT_API_URL;
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    this.validatePrompt(params.prompt);
    this.validateApiKey();

    const startTime = Date.now();
    const durationSec = params.durationSec || DEFAULT_DURATION_SEC;
    const format = params.format || DEFAULT_FORMAT;

    this.logger.debug(`[${this.providerId}] Generating BGM: duration=${durationSec}s, prompt="${params.prompt.substring(0, 50)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          prompt: params.prompt,
          duration: durationSec,
          instrumental: true,
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
      this.logger.log(`[${this.providerId}] BGM generation submitted in ${durationMs}ms: job_id=${job_id}, status=${status}`);

      return {
        uri: job_id,
        metadata: {
          providerId: this.providerId,
          model: 'suno-bgm',
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

  async generateAudioAndWait(
    params: AudioGenerationParams,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AudioGenerationResult> {
    const submitResult = await this.generateAudio(params);
    const jobId = submitResult.uri;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'completed') {
        return {
          uri: status.audio_url,
          metadata: submitResult.metadata,
        };
      }

      if (status.status === 'failed') {
        throw new ProviderError(
          ProviderErrorCode.GENERATION_FAILED,
          this.providerId,
          status.error || `Audio generation failed for job ${jobId}`,
        );
      }

      this.logger.debug(`[${this.providerId}] Job ${jobId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ProviderError(
      ProviderErrorCode.GENERATION_FAILED,
      this.providerId,
      `Audio generation timed out after ${timeoutMs}ms for job ${jobId}`,
    );
  }

  private async getJobStatus(jobId: string): Promise<{ status: string; audio_url: string; progress?: number; error?: string }> {
    this.validateApiKey();

    const statusUrl = this.apiUrl.replace(/\/generate$/, '') + `/${jobId}/status`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data as { status: string; audio_url: string; progress?: number; error?: string };
  }

  supportsParams(params: AudioGenerationParams): boolean {
    if (params.durationSec !== undefined && (params.durationSec < MIN_DURATION_SEC || params.durationSec > MAX_DURATION_SEC)) {
      return false;
    }
    return true;
  }

  private validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim().length === 0) {
      throw new ProviderError(ProviderErrorCode.INVALID_PARAMS, this.providerId, 'Prompt is required and cannot be empty');
    }
  }

  private validateApiKey(): void {
    if (!this.apiKey) {
      throw new ProviderError(ProviderErrorCode.AUTHENTICATION_ERROR, this.providerId, 'SUNO_API_KEY is not configured');
    }
  }
}
