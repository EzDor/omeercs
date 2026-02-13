import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ImageProviderAdapter, ImageGenerationParams, ImageGenerationResult } from '@agentic-template/dto/src/providers/interfaces/image-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';

const DEFAULT_API_URL = 'https://api.nanobanana.com/v1/image/generate';
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const DEFAULT_FORMAT = 'png';
const DEFAULT_QUALITY = 'standard';
const MIN_DIMENSION = 512;
const MAX_DIMENSION = 4096;

@Injectable()
export class NanoBananaImageAdapter implements ImageProviderAdapter {
  readonly providerId = 'nano-banana-image';
  private readonly logger = new Logger(NanoBananaImageAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NANO_BANANA_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('NANO_BANANA_IMAGE_API_URL') || DEFAULT_API_URL;
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    this.validatePrompt(params.prompt);
    this.validateApiKey();

    const startTime = Date.now();
    const width = params.width || DEFAULT_WIDTH;
    const height = params.height || DEFAULT_HEIGHT;
    const format = params.format || DEFAULT_FORMAT;
    const quality = params.quality || DEFAULT_QUALITY;

    this.logger.debug(`[${this.providerId}] Generating image: ${width}x${height}, format=${format}, prompt="${params.prompt.substring(0, 50)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          prompt: params.prompt,
          width,
          height,
          format,
          quality,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const jobId = this.extractJobId(response.data);
      const durationMs = Date.now() - startTime;
      this.logger.log(`[${this.providerId}] Image generation submitted in ${durationMs}ms: jobId=${jobId}`);

      return {
        uri: jobId,
        metadata: {
          providerId: this.providerId,
          model: 'nano-banana-image',
          width,
          height,
          format,
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

  supportsParams(params: ImageGenerationParams): boolean {
    if (params.width !== undefined && (params.width < MIN_DIMENSION || params.width > MAX_DIMENSION)) {
      return false;
    }
    if (params.height !== undefined && (params.height < MIN_DIMENSION || params.height > MAX_DIMENSION)) {
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
      throw new ProviderError(ProviderErrorCode.AUTHENTICATION_ERROR, this.providerId, 'NANO_BANANA_API_KEY is not configured');
    }
  }

  private extractJobId(data: Record<string, unknown>): string {
    const jobId = data.job_id;
    if (!jobId) {
      throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, 'No job_id returned from NanoBanana API');
    }
    return String(jobId);
  }
}
