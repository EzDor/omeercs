import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { GenerateSfxPackInput, GenerateSfxPackOutput, GeneratedSfx, SfxRequest } from '@agentic-template/dto/src/skills/generate-sfx-pack.dto';
import { SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_FORMAT = 'wav';
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_SFX_DURATION = 1.0;

@Injectable()
export class GenerateSfxPackHandler implements SkillHandler<GenerateSfxPackInput, GenerateSfxPackOutput> {
  private readonly logger = new Logger(GenerateSfxPackHandler.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;
  private readonly outputDir: string;
  private readonly audioGenerationTimeout: number;

  private readonly useStubProvider: boolean;

  private readonly ALLOWED_AUDIO_DOMAINS = ['storage.googleapis.com', 'replicate.delivery', 'api.stability.ai', 'stability.ai', 'api.elevenlabs.io'];

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('SFX_GENERATION_MODEL') || 'audiogen';
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.audioGenerationTimeout = configService.get<number>('AUDIO_GENERATION_TIMEOUT_MS') || 300000;
    this.useStubProvider = configService.get<string>('AUDIO_PROVIDER_STUB') === 'true';
    if (this.useStubProvider && configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Stub audio provider must not be used in production');
    }
  }

  async execute(input: GenerateSfxPackInput, context: SkillExecutionContext): Promise<SkillResult<GenerateSfxPackOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing generate_sfx_pack for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      if (this.useStubProvider) {
        return this.executeStub(input, context, startTime, timings);
      }

      const specs = this.normalizeSpecs(input.specs);
      const model = input.provider || this.defaultModel;

      // Create output directory
      const outputPath = path.join(this.outputDir, context.executionId, 'sfx');
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      // Generate each SFX
      const generatedSfx: GeneratedSfx[] = [];
      let totalSize = 0;

      const generationStart = Date.now();

      for (const sfxRequest of input.sfx_list) {
        const variations = sfxRequest.variations || 1;

        for (let varIndex = 0; varIndex < variations; varIndex++) {
          const sfxPrompt = this.buildSfxPrompt(sfxRequest, input.style?.theme);
          const sfxDuration = sfxRequest.duration_sec || DEFAULT_SFX_DURATION;

          this.logger.debug(`Generating SFX: ${sfxRequest.name} (variation ${varIndex + 1}/${variations})`);

          const response = await this.llmClient.audioGeneration({
            model,
            prompt: sfxPrompt,
            duration_sec: sfxDuration,
            format: specs.format,
            sample_rate: specs.sample_rate,
            seed: input.seed ? input.seed + generatedSfx.length : undefined,
            sfx_type: sfxRequest.intent,
          });

          // Handle async generation if needed
          let audioData = response.data?.[0];

          if (response.status === 'pending' || response.status === 'processing') {
            this.logger.log(`SFX generation is async, waiting for completion (ID: ${response.id})`);
            const statusResult = await this.llmClient.waitForAudioGeneration(response.id!, this.audioGenerationTimeout);

            if (statusResult.status === 'failed') {
              this.logger.warn(`Failed to generate SFX ${sfxRequest.name}: ${statusResult.error}`);
              continue;
            }

            if (statusResult.data) {
              audioData = statusResult.data;
            }
          }

          const audioUrl = audioData?.url;
          if (!audioUrl) {
            this.logger.warn(`No audio URL for SFX ${sfxRequest.name}`);
            continue;
          }

          // Save the SFX file
          const safeName = this.sanitizeFilename(sfxRequest.name);
          const safeFormat = this.sanitizeFormat(specs.format);
          const filename = variations > 1 ? `${safeName}_${varIndex + 1}.${safeFormat}` : `${safeName}.${safeFormat}`;
          const filePath = path.join(outputPath, path.basename(filename));

          this.validateAudioUrl(audioUrl);

          const fileResponse = await fetch(audioUrl);
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
            duration_sec: audioData?.duration_sec || sfxDuration,
            file_size_bytes: stats.size,
            variation_index: variations > 1 ? varIndex : undefined,
          });
        }
      }

      timings['generation'] = Date.now() - generationStart;

      if (generatedSfx.length === 0) {
        return skillFailure('Failed to generate any SFX files', 'NO_SFX_GENERATED', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      // Create manifest
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
          model,
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
              provider: 'litellm',
              model,
              duration_ms: timings['generation'],
            },
          ],
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to generate SFX pack: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during SFX generation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private executeStub(input: GenerateSfxPackInput, context: SkillExecutionContext, startTime: number, timings: Record<string, number>): SkillResult<GenerateSfxPackOutput> {
    this.logger.log(`Using stub audio provider for SFX pack`);
    const specs = this.normalizeSpecs(input.specs);
    const outputPath = path.join(this.outputDir, context.executionId, 'sfx');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const generatedSfx: GeneratedSfx[] = [];
    let totalSize = 0;

    for (const sfxRequest of input.sfx_list) {
      const sfxDuration = sfxRequest.duration_sec || DEFAULT_SFX_DURATION;
      const safeName = this.sanitizeFilename(sfxRequest.name);
      const safeFormat = this.sanitizeFormat(specs.format);
      const filename = `${safeName}.${safeFormat}`;
      const filePath = path.join(outputPath, path.basename(filename));
      const wavBuffer = this.generateSilentWav(sfxDuration);
      fs.writeFileSync(filePath, wavBuffer);
      totalSize += wavBuffer.length;
      generatedSfx.push({
        name: sfxRequest.name,
        intent: sfxRequest.intent,
        uri: filePath,
        duration_sec: sfxDuration,
        file_size_bytes: wavBuffer.length,
      });
    }

    const manifestPath = path.join(outputPath, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: '1.0.0',
        created_at: new Date().toISOString(),
        style_theme: input.style?.theme,
        format: specs.format,
        sample_rate: DEFAULT_SAMPLE_RATE,
        sfx_files: generatedSfx.map((sfx) => ({
          name: sfx.name,
          intent: sfx.intent,
          filename: path.basename(sfx.uri),
          duration_sec: sfx.duration_sec,
          file_size_bytes: sfx.file_size_bytes,
        })),
      }),
    );

    const totalTime = Date.now() - startTime;

    return skillSuccess(
      {
        manifest_uri: manifestPath,
        pack_uri: outputPath,
        sfx_files: generatedSfx,
        total_count: generatedSfx.length,
        total_size_bytes: totalSize,
        format: specs.format,
        generation_params: { style_theme: input.style?.theme, requested_sfx: input.sfx_list.map((s) => s.name), model: 'stub-generator' },
      },
      [
        { artifact_type: 'audio/sfx-pack', uri: outputPath, metadata: { total_count: generatedSfx.length, format: specs.format } },
        { artifact_type: 'json/sfx-manifest', uri: manifestPath, metadata: { sfx_names: generatedSfx.map((s) => s.name) } },
      ],
      { timings_ms: { total: totalTime, ...timings }, provider_calls: [{ provider: 'stub', model: 'stub-generator', duration_ms: 0 }] },
    );
  }

  private generateSilentWav(durationSec: number): Buffer {
    const sampleRate = DEFAULT_SAMPLE_RATE;
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(durationSec * sampleRate);
    const dataSize = numSamples * numChannels * bytesPerSample;
    const header = Buffer.alloc(44);
    let offset = 0;
    header.write('RIFF', offset);
    offset += 4;
    header.writeUInt32LE(36 + dataSize, offset);
    offset += 4;
    header.write('WAVE', offset);
    offset += 4;
    header.write('fmt ', offset);
    offset += 4;
    header.writeUInt32LE(16, offset);
    offset += 4;
    header.writeUInt16LE(1, offset);
    offset += 2;
    header.writeUInt16LE(numChannels, offset);
    offset += 2;
    header.writeUInt32LE(sampleRate, offset);
    offset += 4;
    header.writeUInt32LE(sampleRate * numChannels * bytesPerSample, offset);
    offset += 4;
    header.writeUInt16LE(numChannels * bytesPerSample, offset);
    offset += 2;
    header.writeUInt16LE(bitsPerSample, offset);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, Buffer.alloc(dataSize)]);
  }

  private validateAudioUrl(url: string): void {
    const parsed = new URL(url);
    const isAllowed = this.ALLOWED_AUDIO_DOMAINS.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    if (!isAllowed) {
      throw new Error(`Audio URL from untrusted domain: ${parsed.hostname}`);
    }
  }

  private buildSfxPrompt(sfxRequest: SfxRequest, styleTheme?: string): string {
    const parts: string[] = [];

    // Intent-based prompt
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

    // Add style theme
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

    // Add custom description if provided (for non-custom intents)
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
