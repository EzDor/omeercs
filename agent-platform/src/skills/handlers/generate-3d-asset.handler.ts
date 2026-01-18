import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { Generate3DAssetInput, Generate3DAssetOutput, Model3DFormat, Model3DStyle, SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT: Model3DFormat = 'glb';
const DEFAULT_MAX_TRIANGLES = 50000;
const DEFAULT_TEXTURE_RESOLUTION = '1024';

@Injectable()
export class Generate3DAssetHandler implements SkillHandler<Generate3DAssetInput, Generate3DAssetOutput> {
  private readonly logger = new Logger(Generate3DAssetHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly generationTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('MODEL_3D_GENERATION_MODEL') || 'meshy-v3';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.generationTimeout = configService.get<number>('MODEL_3D_GENERATION_TIMEOUT_MS') || 600000;
  }

  async execute(input: Generate3DAssetInput, context: SkillExecutionContext): Promise<SkillResult<Generate3DAssetOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_3d_asset for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Build the 3D generation prompt
      const promptStart = Date.now();
      const model3DPrompt = this.build3DPrompt(input);
      timings['prompt_build'] = Date.now() - promptStart;

      // Determine specs
      const format = input.specs?.format || DEFAULT_FORMAT;
      const maxTriangles = input.poly_budget?.max_triangles || DEFAULT_MAX_TRIANGLES;
      const textureResolution = input.style.texture_resolution || DEFAULT_TEXTURE_RESOLUTION;

      // Call 3D generation API
      const generationStart = Date.now();
      const model = input.provider || this.defaultModel;

      const response = await this.llmClient.model3DGeneration({
        model,
        prompt: model3DPrompt,
        format,
        style: input.style.theme,
        category: input.style.category,
        max_triangles: maxTriangles,
        max_vertices: input.poly_budget?.max_vertices,
        target_platform: input.poly_budget?.target_platform,
        generate_textures: input.style.generate_textures ?? true,
        texture_resolution: textureResolution,
        embed_textures: input.specs?.embed_textures ?? true,
        generate_lods: input.specs?.generate_lods,
        lod_count: input.specs?.lod_count,
        reference_image_url: input.reference_image_uri,
        color_palette: input.style.color_palette,
        material_style: input.style.material_style,
        scale: input.specs?.scale,
        center_origin: input.specs?.center_origin ?? true,
        seed: input.seed,
      });

      // Handle async generation if needed
      let modelData = response.data?.[0];

      if (response.status === 'pending' || response.status === 'processing') {
        this.logger.log(`3D generation is async, waiting for completion (ID: ${response.id})`);
        const statusResult = await this.llmClient.waitForModel3DGeneration(response.id!, this.generationTimeout);

        if (statusResult.status === 'failed') {
          return skillFailure(statusResult.error || '3D generation failed', 'GENERATION_FAILED', {
            timings_ms: { total: Date.now() - startTime, ...timings },
          });
        }

        if (statusResult.data) {
          modelData = statusResult.data;
        }
      }

      timings['generation'] = Date.now() - generationStart;

      const modelUrl = modelData?.url;
      if (!modelUrl) {
        return skillFailure('No model URL in response', 'NO_MODEL_URL', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      // Download and save the model
      const saveStart = Date.now();
      const savedModelInfo = await this.saveModel(modelUrl, context.executionId, format);
      timings['save'] = Date.now() - saveStart;

      // Download textures if separate
      let textureInfo: Generate3DAssetOutput['textures'];
      if (modelData?.textures && modelData.textures.urls && modelData.textures.urls.length > 0) {
        const textureStart = Date.now();
        const savedTextures = await this.saveTextures(modelData.textures.urls, context.executionId);
        timings['save_textures'] = Date.now() - textureStart;
        textureInfo = {
          count: savedTextures.length,
          total_size_bytes: savedTextures.reduce((acc, t) => acc + t.size, 0),
          resolution: modelData.textures.resolution || textureResolution,
          uris: savedTextures.map((t) => t.uri),
        };
      } else if (modelData?.textures) {
        textureInfo = {
          count: modelData.textures.count,
          total_size_bytes: modelData.textures.total_size_bytes || 0,
          resolution: modelData.textures.resolution || textureResolution,
        };
      }

      // Download LODs if present
      let lodInfo: Generate3DAssetOutput['lods'];
      if (modelData?.lods && modelData.lods.urls && modelData.lods.urls.length > 0) {
        const lodStart = Date.now();
        const savedLods = await this.saveLods(modelData.lods.urls, context.executionId, format);
        timings['save_lods'] = Date.now() - lodStart;
        lodInfo = {
          count: savedLods.length,
          uris: savedLods.map((l) => l.uri),
        };
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(`3D asset generated successfully in ${totalTime}ms`);

      const output: Generate3DAssetOutput = {
        model_uri: savedModelInfo.uri,
        format,
        file_size_bytes: savedModelInfo.fileSize,
        geometry: {
          triangles: modelData?.triangles || 0,
          vertices: modelData?.vertices || 0,
          materials: modelData?.materials || 1,
        },
        textures: textureInfo,
        lods: lodInfo,
        bounding_box: modelData?.bounding_box || { width: 1, height: 1, depth: 1 },
        generation_params: {
          prompt: input.prompt,
          style: input.style.theme,
          category: input.style.category,
          poly_budget: {
            max_triangles: maxTriangles,
            target_platform: input.poly_budget?.target_platform,
          },
          seed: input.seed,
          model,
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

      if (textureInfo?.uris) {
        textureInfo.uris.forEach((uri, idx) => {
          artifacts.push({
            artifact_type: 'image/texture',
            uri,
            metadata: {
              index: idx,
              resolution: textureInfo.resolution,
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
            duration_ms: timings['generation'],
          },
        ],
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate 3D asset: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during 3D generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private build3DPrompt(input: Generate3DAssetInput): string {
    const parts: string[] = [];

    // Start with the main prompt
    parts.push(input.prompt);

    // Add style information
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

    // Add category context
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

    // Add color preferences
    if (input.style.color_palette && input.style.color_palette.length > 0) {
      parts.push(`using color palette: ${input.style.color_palette.join(', ')}`);
    }

    // Add material style
    if (input.style.material_style) {
      parts.push(`with ${input.style.material_style} materials`);
    }

    return parts.join(', ');
  }

  private async saveModel(modelUrl: string, executionId: string, format: Model3DFormat): Promise<{ uri: string; fileSize: number }> {
    const outputPath = path.join(this.outputDir, executionId);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const response = await fetch(modelUrl);
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

  private async saveTextures(textureUrls: string[], executionId: string): Promise<{ uri: string; size: number }[]> {
    const outputPath = path.join(this.outputDir, executionId, 'textures');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const results: { uri: string; size: number }[] = [];

    for (let i = 0; i < textureUrls.length; i++) {
      const url = textureUrls[i];
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Failed to download texture ${i}: ${response.statusText}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = this.getExtensionFromUrl(url) || 'png';
      const filename = `texture_${i}.${extension}`;
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

  private getExtensionFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
