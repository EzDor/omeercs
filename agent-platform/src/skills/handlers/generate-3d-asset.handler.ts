import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Asset3DProviderRegistry } from '@agentic-template/common/src/providers/registries/asset3d-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { Generate3DAssetInput, Generate3DAssetOutput, Model3DFormat, Model3DStyle } from '@agentic-template/dto/src/skills/generate-3d-asset.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { isAllowedUrl, fetchWithTimeout } from './network-safety.utils';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT: Model3DFormat = 'glb';
const DEFAULT_MAX_TRIANGLES = 50000;

@Injectable()
export class Generate3DAssetHandler implements SkillHandler<Generate3DAssetInput, Generate3DAssetOutput> {
  private readonly logger = new Logger(Generate3DAssetHandler.name);
  private readonly outputDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly asset3DProviderRegistry: Asset3DProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: Generate3DAssetInput, context: SkillExecutionContext): Promise<SkillResult<Generate3DAssetOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_3d_asset for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const promptStart = Date.now();
      const model3DPrompt = this.build3DPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      const format = input.specs?.format || DEFAULT_FORMAT;
      const maxTriangles = input.poly_budget?.max_triangles || DEFAULT_MAX_TRIANGLES;

      const generationStart = Date.now();
      const provider = this.asset3DProviderRegistry.getProvider();
      if (!provider.generate3DAndWait) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, provider.providerId, 'Provider does not support synchronous 3D generation');
      }

      const result = await provider.generate3DAndWait({
        prompt: model3DPrompt,
        format,
        polyCountTarget: maxTriangles,
        includeTextures: input.style.generate_textures ?? true,
      });

      timings['generation'] = Date.now() - generationStart;

      const saveStart = Date.now();
      const savedModelInfo = await this.saveModel(result.uri, context.executionId, format);
      timings['save'] = Date.now() - saveStart;

      const rawResponse = result.metadata.rawResponse as Record<string, unknown> | undefined;

      const totalTime = Date.now() - startTime;
      this.logger.log(`3D asset generated successfully in ${totalTime}ms`);

      const output: Generate3DAssetOutput = {
        model_uri: savedModelInfo.uri,
        format,
        file_size_bytes: savedModelInfo.fileSize,
        geometry: {
          triangles: (rawResponse?.triangles as number) || 0,
          vertices: (rawResponse?.vertices as number) || 0,
          materials: (rawResponse?.materials as number) || 1,
        },
        textures: undefined,
        lods: undefined,
        bounding_box: { width: 1, height: 1, depth: 1 },
        generation_params: {
          prompt: input.prompt,
          style: input.style.theme,
          category: input.style.category,
          poly_budget: {
            max_triangles: maxTriangles,
            target_platform: input.poly_budget?.target_platform,
          },
          seed: input.seed,
          model: result.metadata.model,
        },
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'model/3d',
          uri: savedModelInfo.uri,
          metadata: {
            format,
            triangles: output.geometry.triangles,
            vertices: output.geometry.vertices,
            style: input.style.theme,
          },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
        provider_calls: [
          {
            provider: result.metadata.providerId,
            model: result.metadata.model,
            duration_ms: timings['generation'],
          },
        ],
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate 3D asset: ${error instanceof Error ? error.message : 'Unknown error'}`);

      const message = error instanceof ProviderError ? error.getUserSafeMessage() : error instanceof Error ? error.message : 'Unknown error during 3D generation';
      return skillFailure(message, 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private build3DPrompt(input: Generate3DAssetInput): string {
    const parts: string[] = [];

    parts.push(input.prompt);

    const styleDescriptions: Record<Model3DStyle, string> = {
      realistic: 'photorealistic with detailed textures and materials',
      stylized: 'stylized art style with artistic interpretation',
      low_poly: 'low polygon count with flat shading',
      cartoon: 'cartoon style with bold colors and outlines',
      anime: 'anime-inspired design with characteristic shading',
      voxel: 'voxel-based cubic style',
      hand_painted: 'hand-painted textures with painterly details',
      sci_fi: 'science fiction aesthetic with futuristic elements',
      fantasy: 'fantasy-themed with magical elements',
      modern: 'contemporary modern design',
      retro: 'retro vintage aesthetic',
      minimalist: 'minimal clean design with simple forms',
    };
    parts.push(`in ${styleDescriptions[input.style.theme] || input.style.theme} style`);

    if (input.style.category) {
      const categoryContext: Record<string, string> = {
        character: 'as a character model suitable for animation',
        prop: 'as a prop object',
        environment: 'as an environment piece',
        vehicle: 'as a vehicle model',
        weapon: 'as a weapon model',
        furniture: 'as furniture',
        food: 'as a food item',
        plant: 'as a plant or vegetation',
        animal: 'as an animal model',
        architecture: 'as an architectural element',
        ui_element: 'as a 3D UI element',
        other: '',
      };
      const categoryDesc = categoryContext[input.style.category];
      if (categoryDesc) {
        parts.push(categoryDesc);
      }
    }

    if (input.style.color_palette && input.style.color_palette.length > 0) {
      parts.push(`using color palette: ${input.style.color_palette.join(', ')}`);
    }

    if (input.style.material_style) {
      parts.push(`with ${input.style.material_style} materials`);
    }

    return parts.join(', ');
  }

  private sanitizeExecutionId(executionId: string): string {
    return executionId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  }

  private async saveModel(modelUrl: string, executionId: string, format: Model3DFormat): Promise<{ uri: string; fileSize: number }> {
    const safeId = this.sanitizeExecutionId(executionId);
    const outputPath = path.join(this.outputDir, safeId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    if (!isAllowedUrl(modelUrl)) {
      throw new Error('Blocked URL (SSRF prevention)');
    }

    const response = await fetchWithTimeout(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `model.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }
}
