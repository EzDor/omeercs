import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Asset3DProviderRegistry } from '@agentic-template/common/src/providers/registries/asset3d-provider.registry';
import { MeshyAsset3dAdapter } from '@agentic-template/common/src/providers/adapters/meshy-3d.adapter';
import { Optimize3DAssetInput, Optimize3DAssetOutput, OptimizationMetrics } from '@agentic-template/dto/src/skills/optimize-3d-asset.dto';
import { Model3DFormat } from '@agentic-template/dto/src/skills/generate-3d-asset.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT: Model3DFormat = 'glb';
const DEFAULT_OPTIMIZATION_LEVEL = 'balanced';

@Injectable()
export class Optimize3DAssetHandler implements SkillHandler<Optimize3DAssetInput, Optimize3DAssetOutput> {
  private readonly logger = new Logger(Optimize3DAssetHandler.name);
  private readonly outputDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly asset3DProviderRegistry: Asset3DProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: Optimize3DAssetInput, context: SkillExecutionContext): Promise<SkillResult<Optimize3DAssetOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing optimize_3d_asset for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const validateStart = Date.now();
      if (!this.isValidModelUri(input.model_uri)) {
        return skillFailure(`Invalid or inaccessible model URI: ${input.model_uri}`, 'INVALID_MODEL_URI', {
          timings_ms: { total: Date.now() - startTime },
        });
      }
      timings['validate'] = Date.now() - validateStart;

      const format = input.specs?.format || this.getFormatFromUri(input.model_uri) || DEFAULT_FORMAT;
      const optimizationLevel = input.constraints.optimization_level || DEFAULT_OPTIMIZATION_LEVEL;

      const optimizationStart = Date.now();
      const provider = this.asset3DProviderRegistry.getProvider() as MeshyAsset3dAdapter;
      const modelUrl = this.resolveModelUrl(input.model_uri);

      const result = await provider.optimize3DAndWait(modelUrl, {
        prompt: `Optimize 3D model with ${optimizationLevel} settings`,
        format,
        polyCountTarget: input.constraints.geometry?.max_triangles,
      });

      timings['optimization'] = Date.now() - optimizationStart;

      const saveStart = Date.now();
      const savedModelInfo = await this.saveModel(result.uri, context.executionId, format);
      timings['save'] = Date.now() - saveStart;

      let originalModelUri = input.model_uri;
      if (input.keep_original) {
        const copyStart = Date.now();
        originalModelUri = await this.copyOriginal(input.model_uri, context.executionId);
        timings['copy_original'] = Date.now() - copyStart;
      }

      const metrics = this.calculateMetrics(undefined);

      const totalTime = Date.now() - startTime;
      this.logger.log(`3D asset optimized successfully in ${totalTime}ms`);

      const output: Optimize3DAssetOutput = {
        optimized_model_uri: savedModelInfo.uri,
        original_model_uri: originalModelUri,
        format,
        file_size_bytes: savedModelInfo.fileSize,
        geometry: {
          triangles: 0,
          vertices: 0,
          materials: 1,
        },
        textures: undefined,
        lods: undefined,
        metrics,
        processing_params: {
          original_uri: input.model_uri,
          optimization_level: optimizationLevel,
          target_platform: input.constraints.target_platform,
          geometry_constraints: {
            max_triangles: input.constraints.geometry?.max_triangles,
            simplification_ratio: input.constraints.geometry?.simplification_ratio,
          },
          texture_constraints: {
            max_resolution: input.constraints.textures?.max_resolution,
            format: input.constraints.textures?.format,
            compressed: input.constraints.textures?.compress,
          },
        },
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'model/3d-optimized',
          uri: savedModelInfo.uri,
          metadata: {
            format,
            triangles: output.geometry.triangles,
            vertices: output.geometry.vertices,
            optimization_level: optimizationLevel,
            size_reduction_percent: metrics.reduction.file_size_percent,
          },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
        provider_calls: [
          {
            provider: result.metadata.providerId,
            model: result.metadata.model,
            duration_ms: timings['optimization'],
          },
        ],
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to optimize 3D asset: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during 3D optimization', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private isValidModelUri(uri: string): boolean {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return true;
    }
    return fs.existsSync(uri);
  }

  private getFormatFromUri(uri: string): Model3DFormat | null {
    const extension = path.extname(uri).toLowerCase().replace('.', '');
    const validFormats: Model3DFormat[] = ['glb', 'gltf', 'obj', 'fbx', 'usdz'];
    return validFormats.includes(extension as Model3DFormat) ? (extension as Model3DFormat) : null;
  }

  private resolveModelUrl(uri: string): string {
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }
    return uri;
  }

  private async saveModel(modelUrl: string, executionId: string, format: Model3DFormat): Promise<{ uri: string; fileSize: number }> {
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to download optimized model: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `model_optimized.${format}`;
    const filePath = path.join(outputPath, filename);

    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);

    return {
      uri: filePath,
      fileSize: stats.size,
    };
  }

  private async copyOriginal(originalUri: string, executionId: string): Promise<string> {
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const extension = path.extname(originalUri);
    const filename = `model_original${extension}`;
    const filePath = path.join(outputPath, filename);

    if (originalUri.startsWith('http://') || originalUri.startsWith('https://')) {
      const response = await fetch(originalUri);
      if (!response.ok) {
        throw new Error(`Failed to download original model: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    } else {
      fs.copyFileSync(originalUri, filePath);
    }

    return filePath;
  }

  private calculateMetrics(
    optimizedData:
      | {
          triangles?: number;
          vertices?: number;
          textures?: { total_size_bytes?: number };
          file_size_bytes?: number;
          original_metrics?: {
            triangles: number;
            vertices: number;
            textures_size_bytes: number;
            file_size_bytes: number;
          };
        }
      | undefined,
  ): OptimizationMetrics {
    const original = optimizedData?.original_metrics || {
      triangles: 0,
      vertices: 0,
      textures_size_bytes: 0,
      file_size_bytes: 0,
    };

    const optimized = {
      triangles: optimizedData?.triangles || 0,
      vertices: optimizedData?.vertices || 0,
      materials: 1,
      textures_size_bytes: optimizedData?.textures?.total_size_bytes || 0,
      file_size_bytes: optimizedData?.file_size_bytes || 0,
    };

    const calcReduction = (orig: number, opt: number): number => {
      if (orig === 0) return 0;
      return Math.round(((orig - opt) / orig) * 100 * 10) / 10;
    };

    return {
      original: {
        triangles: original.triangles,
        vertices: original.vertices,
        materials: 1,
        textures_size_bytes: original.textures_size_bytes,
        file_size_bytes: original.file_size_bytes,
      },
      optimized: {
        triangles: optimized.triangles,
        vertices: optimized.vertices,
        materials: optimized.materials,
        textures_size_bytes: optimized.textures_size_bytes,
        file_size_bytes: optimized.file_size_bytes,
      },
      reduction: {
        triangles_percent: calcReduction(original.triangles, optimized.triangles),
        vertices_percent: calcReduction(original.vertices, optimized.vertices),
        textures_size_percent: calcReduction(original.textures_size_bytes, optimized.textures_size_bytes),
        file_size_percent: calcReduction(original.file_size_bytes, optimized.file_size_bytes),
      },
    };
  }
}
