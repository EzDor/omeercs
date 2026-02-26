import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';
import { ProviderError } from '@agentic-template/common/src/providers/errors/provider.error';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { GenerateSfxPackInput, GenerateSfxPackOutput, GeneratedSfx, SfxRequest } from '@agentic-template/dto/src/skills/generate-sfx-pack.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { isAllowedUrl, fetchWithTimeout } from './network-safety.utils';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT = 'wav';
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_SFX_DURATION = 1.0;

@Injectable()
export class GenerateSfxPackHandler implements SkillHandler<GenerateSfxPackInput, GenerateSfxPackOutput> {
  private readonly logger = new Logger(GenerateSfxPackHandler.name);
  private readonly outputDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly audioProviderRegistry: AudioProviderRegistry,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: GenerateSfxPackInput, context: SkillExecutionContext): Promise<SkillResult<GenerateSfxPackOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_sfx_pack for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const specs = this.normalizeSpecs(input.specs);

      const outputPath = path.join(this.outputDir, context.executionId, 'sfx');
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const generatedSfx: GeneratedSfx[] = [];
      let totalSize = 0;

      const generationStart = Date.now();
      const sfxProvider = this.audioProviderRegistry.routeByAudioType('sfx');
      if (!sfxProvider.generateAudioAndWait) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, sfxProvider.providerId, 'Provider does not support synchronous audio generation');
      }

      for (const sfxRequest of input.sfx_list) {
        const variations = sfxRequest.variations || 1;

        for (let varIndex = 0; varIndex < variations; varIndex++) {
          const sfxPrompt = this.buildSfxPrompt(sfxRequest, input.style?.theme);
          const sfxDuration = sfxRequest.duration_sec || DEFAULT_SFX_DURATION;

          this.logger.debug(`Generating SFX: ${sfxRequest.name} (variation ${varIndex + 1}/${variations})`);

          try {
            const result = await sfxProvider.generateAudioAndWait({
              prompt: sfxPrompt,
              durationSec: sfxDuration,
              audioType: 'sfx',
              sampleRate: specs.sample_rate,
              channels: 1,
            });

            const safeName = this.sanitizeFilename(sfxRequest.name);
            const safeFormat = this.sanitizeFormat(specs.format);
            const filename = variations > 1 ? `${safeName}_${varIndex + 1}.${safeFormat}` : `${safeName}.${safeFormat}`;
            const filePath = path.join(outputPath, path.basename(filename));

            if (!isAllowedUrl(result.uri)) {
              this.logger.warn(`Blocked SFX download URL for ${sfxRequest.name} (SSRF prevention)`);
              continue;
            }

            const fileResponse = await fetchWithTimeout(result.uri);
            if (!fileResponse.ok) {
              this.logger.warn(`Failed to download SFX ${sfxRequest.name}: ${fileResponse.statusText}`);
              continue;
            }

            const buffer = Buffer.from(await fileResponse.arrayBuffer());
            fs.writeFileSync(filePath, buffer);

            const stats = fs.statSync(filePath);
            totalSize += stats.size;

            generatedSfx.push({
              name: sfxRequest.name,
              intent: sfxRequest.intent,
              uri: filePath,
              duration_sec: result.metadata.durationSec,
              file_size_bytes: stats.size,
              variation_index: variations > 1 ? varIndex : undefined,
            });
          } catch (error) {
            this.logger.warn(`Failed to generate SFX ${sfxRequest.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            continue;
          }
        }
      }

      timings['generation'] = Date.now() - generationStart;

      if (generatedSfx.length === 0) {
        return skillFailure('Failed to generate any SFX files', 'NO_SFX_GENERATED', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      const manifestStart = Date.now();
      const manifestPath = path.join(outputPath, 'manifest.json');
      const manifest = {
        version: '1.0.0',
        created_at: new Date().toISOString(),
        style_theme: input.style?.theme,
        format: specs.format,
        sample_rate: specs.sample_rate,
        sfx_files: generatedSfx.map((sfx) => ({
          name: sfx.name,
          intent: sfx.intent,
          filename: path.basename(sfx.uri),
          duration_sec: sfx.duration_sec,
          file_size_bytes: sfx.file_size_bytes,
          variation_index: sfx.variation_index,
        })),
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      timings['manifest'] = Date.now() - manifestStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`SFX pack generated successfully with ${generatedSfx.length} files in ${totalTime}ms`);

      const output: GenerateSfxPackOutput = {
        manifest_uri: manifestPath,
        pack_uri: outputPath,
        sfx_files: generatedSfx,
        total_count: generatedSfx.length,
        total_size_bytes: totalSize,
        format: specs.format,
        generation_params: {
          style_theme: input.style?.theme,
          requested_sfx: input.sfx_list.map((s) => s.name),
          seed: input.seed,
          model: sfxProvider.providerId,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'audio/sfx-pack',
            uri: outputPath,
            metadata: {
              total_count: output.total_count,
              total_size_bytes: output.total_size_bytes,
              format: output.format,
              style_theme: input.style?.theme,
            },
          },
          {
            artifact_type: 'json/sfx-manifest',
            uri: manifestPath,
            metadata: {
              sfx_names: generatedSfx.map((s) => s.name),
            },
          },
        ],
        {
          timings_ms: { total: totalTime, ...timings },
          provider_calls: [
            {
              provider: sfxProvider.providerId,
              model: 'nano-banana-sfx',
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate SFX pack: ${error instanceof Error ? error.message : 'Unknown error'}`);

      const message = error instanceof ProviderError ? error.getUserSafeMessage() : error instanceof Error ? error.message : 'Unknown error during SFX generation';
      return skillFailure(message, 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private buildSfxPrompt(sfxRequest: SfxRequest, styleTheme?: string): string {
    const parts: string[] = [];

    const intentPrompts: Record<string, string> = {
      jump: 'bouncy jump sound effect',
      coin: 'coin collection pickup sound',
      click: 'UI button click sound',
      win: 'victory celebration sound',
      lose: 'game over failure sound',
      collect: 'item collection pickup sound',
      powerup: 'power up activation sound',
      explosion: 'explosion blast sound',
      hit: 'impact hit sound',
      miss: 'miss or whoosh sound',
      countdown: 'countdown tick sound',
      start: 'game start sound',
      game_over: 'game over sound',
      level_up: 'level up achievement sound',
      bonus: 'bonus reward sound',
      notification: 'notification alert sound',
      error: 'error warning sound',
      success: 'success completion sound',
      whoosh: 'swoosh whoosh movement sound',
      pop: 'pop bubble sound',
      ding: 'ding bell notification sound',
      buzz: 'buzz vibration sound',
      custom: '',
    };

    if (sfxRequest.intent === 'custom' && sfxRequest.custom_description) {
      parts.push(sfxRequest.custom_description);
    } else {
      parts.push(intentPrompts[sfxRequest.intent] || `${sfxRequest.intent} sound effect`);
    }

    if (styleTheme) {
      const themeModifiers: Record<string, string> = {
        retro: 'in 8-bit retro game style',
        modern: 'with modern polished sound',
        cartoon: 'in cartoon animated style',
        realistic: 'with realistic sound design',
        sci_fi: 'with sci-fi futuristic feel',
        fantasy: 'with magical fantasy feel',
        arcade: 'in classic arcade style',
        minimal: 'with minimal clean design',
      };
      parts.push(themeModifiers[styleTheme] || `in ${styleTheme} style`);
    }

    if (sfxRequest.intent !== 'custom' && sfxRequest.custom_description) {
      parts.push(sfxRequest.custom_description);
    }

    return parts.join(', ');
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  }

  private sanitizeFormat(format: string): string {
    return format.replace(/[^a-z0-9]/g, '').substring(0, 10);
  }

  private normalizeSpecs(specs?: GenerateSfxPackInput['specs']): {
    format: string;
    sample_rate: number;
  } {
    return {
      format: specs?.format || DEFAULT_FORMAT,
      sample_rate: specs?.sample_rate || DEFAULT_SAMPLE_RATE,
    };
  }
}
