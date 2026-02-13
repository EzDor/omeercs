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
