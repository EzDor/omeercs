import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Asset3DProviderAdapter, Asset3DGenerationParams, Asset3DGenerationResult } from '@agentic-template/dto/src/providers/interfaces/asset3d-provider.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';

const DEFAULT_API_URL = 'https://api.meshy.ai/v2/text-to-3d';
const DEFAULT_POLY_COUNT_TARGET = 50000;
const MAX_SUPPORTED_POLY_COUNT = 50000;
const SUPPORTED_FORMATS = ['glb', 'gltf'];
const DEFAULT_FORMAT = 'glb';
const DEFAULT_POLL_INTERVAL_MS = 10000;
const DEFAULT_TIMEOUT_MS = 600000;

@Injectable()
export class MeshyAsset3dAdapter implements Asset3DProviderAdapter {
  readonly providerId = 'meshy';
  private readonly logger = new Logger(MeshyAsset3dAdapter.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MESHY_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('MESHY_API_URL') || DEFAULT_API_URL;
  }

  async generate3D(params: Asset3DGenerationParams): Promise<Asset3DGenerationResult> {
    this.validatePrompt(params.prompt);
    this.validateApiKey();

    const startTime = Date.now();
    const format = params.format || DEFAULT_FORMAT;

    this.logger.debug(`[${this.providerId}] Generating 3D asset: format=${format}, prompt="${params.prompt.substring(0, 50)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          prompt: params.prompt,
          target_polycount: params.polyCountTarget || DEFAULT_POLY_COUNT_TARGET,
          enable_pbr: params.includeTextures !== false,
          format,
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
      this.logger.log(`[${this.providerId}] 3D generation submitted in ${durationMs}ms: jobId=${jobId}`);

      return {
        uri: jobId,
        metadata: {
          providerId: this.providerId,
          model: 'meshy-text-to-3d',
          format: DEFAULT_FORMAT,
          polyCount: params.polyCountTarget || DEFAULT_POLY_COUNT_TARGET,
          hasTextures: true,
          hasAnimations: false,
          materialCount: 1,
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

  async generate3DAndWait(
    params: Asset3DGenerationParams,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Asset3DGenerationResult> {
    const submitResult = await this.generate3D(params);
    const jobId = submitResult.uri;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'SUCCEEDED') {
        return {
          uri: status.model_url,
          metadata: { ...submitResult.metadata, rawResponse: status },
        };
      }

      if (status.status === 'FAILED' || status.status === 'EXPIRED') {
        throw new ProviderError(
          ProviderErrorCode.GENERATION_FAILED,
          this.providerId,
          status.error || `3D generation failed for job ${jobId}`,
        );
      }

      this.logger.debug(`[${this.providerId}] Job ${jobId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ProviderError(
      ProviderErrorCode.GENERATION_FAILED,
      this.providerId,
      `3D generation timed out after ${timeoutMs}ms for job ${jobId}`,
    );
  }

  async optimize3DAndWait(
    modelUrl: string,
    params: Partial<Asset3DGenerationParams>,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Asset3DGenerationResult> {
    this.validateApiKey();

    const optimizeUrl = this.apiUrl.replace(/\/text-to-3d$/, '/refine');

    const response = await axios.post(
      optimizeUrl,
      {
        preview_task_id: modelUrl,
        texture_richness: 'high',
        format: params.format || DEFAULT_FORMAT,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const jobId = this.extractJobId(response.data);

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'SUCCEEDED') {
        return {
          uri: status.model_url,
          metadata: {
            providerId: this.providerId,
            model: 'meshy-refine',
            format: params.format || DEFAULT_FORMAT,
            polyCount: params.polyCountTarget || DEFAULT_POLY_COUNT_TARGET,
            hasTextures: true,
            hasAnimations: false,
            materialCount: 1,
            rawResponse: status,
          },
        };
      }

      if (status.status === 'FAILED' || status.status === 'EXPIRED') {
        throw new ProviderError(
          ProviderErrorCode.GENERATION_FAILED,
          this.providerId,
          status.error || `3D optimization failed for job ${jobId}`,
        );
      }

      this.logger.debug(`[${this.providerId}] Optimization ${jobId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ProviderError(
      ProviderErrorCode.GENERATION_FAILED,
      this.providerId,
      `3D optimization timed out after ${timeoutMs}ms for job ${jobId}`,
    );
  }

  private async getJobStatus(jobId: string): Promise<{ status: string; model_url: string; progress?: number; error?: string }> {
    this.validateApiKey();

    const statusUrl = this.apiUrl.replace(/\/text-to-3d$/, '') + `/text-to-3d/${jobId}`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const data = response.data as Record<string, unknown>;
    const modelUrls = data.model_urls as Record<string, string> | undefined;
    return {
      status: String(data.status || 'PENDING'),
      model_url: String(modelUrls?.glb || data.model_url || ''),
      progress: data.progress as number | undefined,
      error: data.task_error as string | undefined,
    };
  }

  supportsParams(params: Asset3DGenerationParams): boolean {
    if (params.polyCountTarget !== undefined && params.polyCountTarget > MAX_SUPPORTED_POLY_COUNT) {
      return false;
    }
    if (params.format && !SUPPORTED_FORMATS.includes(params.format)) {
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
      throw new ProviderError(ProviderErrorCode.AUTHENTICATION_ERROR, this.providerId, 'MESHY_API_KEY is not configured');
    }
  }

  private extractJobId(data: Record<string, unknown>): string {
    const nested = data.result as Record<string, unknown> | undefined;
    const jobId = nested?.id ?? data.id;
    if (!jobId) {
      throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, 'No job ID returned from Meshy API');
    }
    return String(jobId);
  }
}
