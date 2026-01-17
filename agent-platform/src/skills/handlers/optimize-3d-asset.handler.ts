import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import {
  Optimize3DAssetInput,
  Optimize3DAssetOutput,
  OptimizationMetrics,
  SkillResult,
  SkillArtifact,
  skillSuccess,
  skillFailure,
} from '@agentic-template/dto/src/skills';
import { Model3DFormat } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT: Model3DFormat = 'glb';
const DEFAULT_OPTIMIZATION_LEVEL = 'balanced';

@Injectable()
export class Optimize3DAssetHandler implements SkillHandler<Optimize3DAssetInput, Optimize3DAssetOutput> {
  private readonly logger = new Logger(Optimize3DAssetHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly optimizationTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('MODEL_3D_OPTIMIZATION_MODEL') || 'gltf-transform';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.optimizationTimeout = configService.get<number>('MODEL_3D_OPTIMIZATION_TIMEOUT_MS') || 600000;
  }

  async execute(input: Optimize3DAssetInput, context: SkillExecutionContext): Promise<SkillResult<Optimize3DAssetOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing optimize_3d_asset for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Validate input model exists
      const validateStart = Date.now();
      if (!this.isValidModelUri(input.model_uri)) {
        return skillFailure(`Invalid or inaccessible model URI: ${input.model_uri}`, 'INVALID_MODEL_URI', {
          timings_ms: { total: Date.now() - startTime },
        });
      }
      timings['validate'] = Date.now() - validateStart;

      // Determine output format
      const format = input.specs?.format || this.getFormatFromUri(input.model_uri) || DEFAULT_FORMAT;
      const optimizationLevel = input.constraints.optimization_level || DEFAULT_OPTIMIZATION_LEVEL;

      // Call 3D optimization API
      const optimizationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const modelUrl = await this.resolveModelUrl(input.model_uri);

      const response = await this.llmClient.model3DOptimization({
        model,
        model_url: modelUrl,
        output_format: format,
        optimization_level: optimizationLevel,
        target_platform: input.constraints.target_platform,
        max_triangles: input.constraints.geometry?.max_triangles,
        max_vertices: input.constraints.geometry?.max_vertices,
        simplification_ratio: input.constraints.geometry?.simplification_ratio,
        preserve_uv_seams: input.constraints.geometry?.preserve_uv_seams,
        preserve_hard_edges: input.constraints.geometry?.preserve_hard_edges,
        texture_max_resolution: input.constraints.textures?.max_resolution,
        texture_format: input.constraints.textures?.format,
        texture_quality: input.constraints.textures?.quality,
        compress_textures: input.constraints.textures?.compress,
        atlas_textures: input.constraints.textures?.atlas_textures,
        generate_lods: input.constraints.lods?.generate,
        lod_count: input.constraints.lods?.count,
        draco_compression: input.specs?.draco_compression,
        draco_compression_level: input.specs?.draco_compression_level,
        meshopt_compression: input.specs?.meshopt_compression,
        max_file_size_bytes: input.constraints.max_file_size_bytes,
      });

      // Handle async optimization if needed
      let optimizedData = response.data?.[0];

      if (response.status === 'pending' || response.status === 'processing') {
        this.logger.log(`3D optimization is async, waiting for completion (ID: ${response.id})`);
        const statusResult = await this.llmClient.waitForModel3DOptimization(response.id!, this.optimizationTimeout);

        if (statusResult.status === 'failed') {
          return skillFailure(statusResult.error || '3D optimization failed', 'OPTIMIZATION_FAILED', {
            timings_ms: { total: Date.now() - startTime, ...timings },
          });
        }

        if (statusResult.data) {
          optimizedData = statusResult.data;
        }
      }

      timings['optimization'] = Date.now() - optimizationStart;

      const optimizedUrl = optimizedData?.url;
      if (!optimizedUrl) {
        return skillFailure('No optimized model URL in response', 'NO_MODEL_URL', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      // Download and save the optimized model
      const saveStart = Date.now();
      const savedModelInfo = await this.saveModel(optimizedUrl, context.executionId, format);
      timings['save'] = Date.now() - saveStart;

      // Copy original if requested
      let originalModelUri = input.model_uri;
      if (input.keep_original) {
        const copyStart = Date.now();
        originalModelUri = await this.copyOriginal(input.model_uri, context.executionId);
        timings['copy_original'] = Date.now() - copyStart;
      }

      // Download LODs if present
      let lodInfo: Optimize3DAssetOutput['lods'];
      if (optimizedData?.lods && optimizedData.lods.urls && optimizedData.lods.urls.length > 0) {
        const lodStart = Date.now();
        const savedLods = await this.saveLods(optimizedData.lods.urls, context.executionId, format);
        timings['save_lods'] = Date.now() - lodStart;
        lodInfo = {
          count: savedLods.length,
          uris: savedLods.map((l) => l.uri),
          triangle_counts: optimizedData.lods.triangle_counts || [],
        };
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(optimizedData);

      const totalTime = Date.now() - startTime;
      this.logger.log(`3D asset optimized successfully in ${totalTime}ms`);

      const output: Optimize3DAssetOutput = {
        optimized_model_uri: savedModelInfo.uri,
        original_model_uri: originalModelUri,
        format,
        file_size_bytes: savedModelInfo.fileSize,
        geometry: {
          triangles: optimizedData?.triangles || 0,
          vertices: optimizedData?.vertices || 0,
          materials: optimizedData?.materials || 1,
        },
        textures: optimizedData?.textures
          ? {
              count: optimizedData.textures.count,
              total_size_bytes: optimizedData.textures.total_size_bytes,
              resolution: optimizedData.textures.resolution,
              format: optimizedData.textures.format,
              compressed: optimizedData.textures.compressed,
            }
          : undefined,
        lods: lodInfo,
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

      if (lodInfo?.uris) {
        lodInfo.uris.forEach((uri, idx) => {
          artifacts.push({
            artifact_type: 'model/3d-lod',
            uri,
            metadata: {
              lod_level: idx,
              triangles: lodInfo!.triangle_counts[idx],
            },
          });
        });
      }

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
        provider_calls: [
          {
            provider: 'litellm',
            model,
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
    // Check if it's a URL
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return true;
    }
    // Check if it's a local file that exists
    return fs.existsSync(uri);
  }

  private getFormatFromUri(uri: string): Model3DFormat | null {
    const extension = path.extname(uri).toLowerCase().replace('.', '');
    const validFormats: Model3DFormat[] = ['glb', 'gltf', 'obj', 'fbx', 'usdz'];
    return validFormats.includes(extension as Model3DFormat) ? (extension as Model3DFormat) : null;
  }

  private async resolveModelUrl(uri: string): Promise<string> {
    // If it's already a URL, return it
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }

    // For local files, we would need to upload to a temporary storage
    // For now, we'll assume the API can handle file:// URIs or the file is accessible
    // In production, this would upload to S3/GCS and return a signed URL
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

  private async saveLods(lodUrls: string[], executionId: string, format: Model3DFormat): Promise<{ uri: string; size: number }[]> {
    const outputPath = path.join(this.outputDir, executionId, 'lods');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const results: { uri: string; size: number }[] = [];

    for (let i = 0; i < lodUrls.length; i++) {
      const url = lodUrls[i];
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Failed to download LOD ${i}: ${response.statusText}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `lod_${i}.${format}`;
      const filePath = path.join(outputPath, filename);

      fs.writeFileSync(filePath, buffer);
      const stats = fs.statSync(filePath);

      results.push({
        uri: filePath,
        size: stats.size,
      });
    }

    return results;
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
