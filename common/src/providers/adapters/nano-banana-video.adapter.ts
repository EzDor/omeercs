import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { VideoProviderAdapter, VideoGenerationParams, VideoGenerationResult } from '@agentic-template/dto/src/providers/interfaces/video-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { isAllowedUrl, validateProviderBaseUrl } from '../network-safety.utils';

const DEFAULT_API_URL = 'https://api.nanobanana.com/v1/video/generate';
const AXIOS_TIMEOUT_MS = 30000;
const MAX_PROMPT_LENGTH = 5000;
const DEFAULT_RESOLUTION = '1920x1080';
const DEFAULT_FPS = 24;
const MIN_DURATION_SEC = 1;
const MAX_DURATION_SEC = 300;
const SUPPORTED_RESOLUTION_PATTERN = /^\d{3,5}x\d{3,5}$/;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 300000;

@Injectable()
export class NanoBananaVideoAdapter implements VideoProviderAdapter {
  readonly providerId = 'nano-banana-video';
  private readonly logger = new Logger(NanoBananaVideoAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NANO_BANANA_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('NANO_BANANA_VIDEO_API_URL') || DEFAULT_API_URL;
    if (this.apiUrl !== DEFAULT_API_URL) {
      validateProviderBaseUrl(this.apiUrl, this.providerId);
    }
  }

  async generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
    this.validatePrompt(params.prompt);
    this.validateApiKey();
    this.validateInputUris(params.inputUris);

    const startTime = Date.now();
    const resolution = params.resolution || DEFAULT_RESOLUTION;
    const fps = params.fps || DEFAULT_FPS;

    this.logger.debug(
      `[${this.providerId}] Generating video: duration=${params.durationSec}s, resolution=${resolution}, fps=${fps}, prompt="${params.prompt.substring(0, 50)}..."`,
    );

    try {
      const response = await axios.post(this.apiUrl, this.buildRequestPayload(params, resolution, fps), this.buildRequestConfig());

      const { job_id, status } = response.data as { job_id: string; status: string };
      this.validateJobResponse(job_id, status);

      const durationMs = Date.now() - startTime;
      this.logger.log(`[${this.providerId}] Video generation submitted in ${durationMs}ms: jobId=${job_id}, status=${status}`);

      return this.buildResult(job_id, params.durationSec, resolution, fps);
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

  async generateVideoAndWait(params: VideoGenerationParams, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<VideoGenerationResult> {
    const submitResult = await this.generateVideo(params);
    const jobId = submitResult.uri;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'completed') {
        return {
          uri: status.video_url,
          metadata: submitResult.metadata,
        };
      }

      if (status.status === 'failed') {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, status.error || `Video generation failed for job ${jobId}`);
      }

      this.logger.debug(`[${this.providerId}] Job ${jobId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, `Video generation timed out after ${timeoutMs}ms for job ${jobId}`);
  }

  private async getJobStatus(jobId: string): Promise<{ status: string; video_url: string; progress?: number; error?: string }> {
    this.validateApiKey();

    const statusUrl = this.buildStatusUrl(jobId);

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: AXIOS_TIMEOUT_MS,
    });
    return response.data as { status: string; video_url: string; progress?: number; error?: string };
  }

  private buildStatusUrl(jobId: string): string {
    const base = new URL(this.apiUrl);
    base.pathname = base.pathname.replace(/\/generate$/, '') + `/${jobId}/status`;
    return base.toString();
  }

  supportsParams(params: VideoGenerationParams): boolean {
    if (!this.isValidDuration(params.durationSec)) {
      return false;
    }
    if (params.resolution && !this.isValidResolution(params.resolution)) {
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

  private validateInputUris(inputUris?: string[]): void {
    if (!inputUris || inputUris.length === 0) return;

    for (const uri of inputUris) {
      if (!isAllowedUrl(uri)) {
        throw new ProviderError(ProviderErrorCode.INVALID_PARAMS, this.providerId, `Input URI is not allowed: blocked by SSRF policy`);
      }
    }
  }

  private buildRequestPayload(params: VideoGenerationParams, resolution: string, fps: number) {
    return {
      prompt: params.prompt,
      duration: params.durationSec,
      resolution,
      fps,
      input_images: params.inputUris,
      motion: params.motion,
    };
  }

  private buildRequestConfig() {
    return {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: AXIOS_TIMEOUT_MS,
    };
  }

  private validateJobResponse(jobId: string, status: string): void {
    if (!jobId) {
      throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, `No job_id returned from provider (status: ${status})`);
    }
  }

  private buildResult(jobId: string, durationSec: number, resolution: string, fps: number): VideoGenerationResult {
    return {
      uri: jobId,
      metadata: {
        providerId: this.providerId,
        model: 'nano-banana-video',
        durationSec,
        resolution,
        fps,
        format: 'mp4',
      },
    };
  }

  private isValidDuration(durationSec: number): boolean {
    return durationSec >= MIN_DURATION_SEC && durationSec <= MAX_DURATION_SEC;
  }

  private isValidResolution(resolution: string): boolean {
    return SUPPORTED_RESOLUTION_PATTERN.test(resolution);
  }
}
