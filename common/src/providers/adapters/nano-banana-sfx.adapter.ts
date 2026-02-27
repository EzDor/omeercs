import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AudioProviderAdapter, AudioGenerationParams, AudioGenerationResult } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { validateProviderBaseUrl } from '../network-safety.utils';

const DEFAULT_API_URL = 'https://api.nanobanana.com/v1/audio/sfx';
const AXIOS_TIMEOUT_MS = 30000;
const MAX_PROMPT_LENGTH = 5000;
const DEFAULT_DURATION_SEC = 2;
const DEFAULT_FORMAT = 'wav';
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 1;
const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 5;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 300000;

@Injectable()
export class NanoBananaSfxAdapter implements AudioProviderAdapter {
  readonly providerId = 'nano-banana-sfx';
  private readonly logger = new Logger(NanoBananaSfxAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NANO_BANANA_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('NANO_BANANA_SFX_API_URL') || DEFAULT_API_URL;
    if (this.apiUrl !== DEFAULT_API_URL) {
      validateProviderBaseUrl(this.apiUrl, this.providerId);
    }
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    this.validatePrompt(params.prompt);
    this.validateApiKey();

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
          timeout: AXIOS_TIMEOUT_MS,
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

  async generateAudioAndWait(params: AudioGenerationParams, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AudioGenerationResult> {
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
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, status.error || `SFX generation failed for job ${jobId}`);
      }

      this.logger.debug(`[${this.providerId}] Job ${jobId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, `SFX generation timed out after ${timeoutMs}ms for job ${jobId}`);
  }

  private async getJobStatus(jobId: string): Promise<{ status: string; audio_url: string; progress?: number; error?: string }> {
    this.validateApiKey();

    const statusUrl = this.buildStatusUrl(jobId);

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: AXIOS_TIMEOUT_MS,
    });
    return response.data as { status: string; audio_url: string; progress?: number; error?: string };
  }

  private buildStatusUrl(jobId: string): string {
    const base = new URL(this.apiUrl);
    base.pathname = base.pathname.replace(/\/sfx$/, '') + `/sfx/${jobId}/status`;
    return base.toString();
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
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new ProviderError(ProviderErrorCode.INVALID_PARAMS, this.providerId, `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
    }
  }

  private validateApiKey(): void {
    if (!this.apiKey) {
      throw new ProviderError(ProviderErrorCode.AUTHENTICATION_ERROR, this.providerId, 'NANO_BANANA_API_KEY is not configured');
    }
  }
}
