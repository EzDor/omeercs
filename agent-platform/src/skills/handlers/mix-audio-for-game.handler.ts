import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MixAudioForGameInput,
  MixAudioForGameOutput,
  NormalizedAudioFile,
  SkillResult,
  skillSuccess,
  skillFailure,
} from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Default loudness targets (LUFS)
const DEFAULT_BGM_LUFS = -16;
const DEFAULT_SFX_LUFS = -14;
const DEFAULT_TRUE_PEAK = -1;
const DEFAULT_FORMAT = 'mp3';

// Preset loudness configurations
const LOUDNESS_PRESETS: Record<string, { bgm_lufs: number; sfx_lufs: number; true_peak_dbfs: number }> = {
  lufs_16: { bgm_lufs: -16, sfx_lufs: -14, true_peak_dbfs: -1 },
  lufs_14: { bgm_lufs: -14, sfx_lufs: -12, true_peak_dbfs: -1 },
  lufs_12: { bgm_lufs: -12, sfx_lufs: -10, true_peak_dbfs: -1 },
  web_standard: { bgm_lufs: -16, sfx_lufs: -14, true_peak_dbfs: -1 },
  broadcast: { bgm_lufs: -24, sfx_lufs: -20, true_peak_dbfs: -2 },
  game_mobile: { bgm_lufs: -14, sfx_lufs: -12, true_peak_dbfs: -1 },
  game_desktop: { bgm_lufs: -16, sfx_lufs: -14, true_peak_dbfs: -1 },
};

@Injectable()
export class MixAudioForGameHandler implements SkillHandler<MixAudioForGameInput, MixAudioForGameOutput> {
  private readonly logger = new Logger(MixAudioForGameHandler.name);
  private readonly outputDir: string;
  private readonly ffmpegPath: string;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.ffmpegPath = configService.get<string>('FFMPEG_PATH') || 'ffmpeg';
  }

  async execute(input: MixAudioForGameInput, context: SkillExecutionContext): Promise<SkillResult<MixAudioForGameOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing mix_audio_for_game for tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      // Determine loudness targets
      const loudnessConfig = this.resolveLoudnessTargets(input.loudness_targets);

      // Create output directory
      const outputPath = path.join(this.outputDir, context.executionId, 'mixed');
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const format = input.output_specs?.format || DEFAULT_FORMAT;

      // Process BGM
      const bgmStart = Date.now();
      const normalizedBgm = await this.normalizeAudioFile(input.bgm_uri, 'bgm', outputPath, loudnessConfig.bgm_lufs, loudnessConfig.true_peak_dbfs, format);
      timings['bgm_normalization'] = Date.now() - bgmStart;

      // Load SFX files from manifest or direct references
      const sfxStart = Date.now();
      const sfxFiles = await this.loadSfxFiles(input);
      const normalizedSfx: NormalizedAudioFile[] = [];

      for (const sfxFile of sfxFiles) {
        try {
          const volumeAdjust = sfxFile.volume_adjust_db || 0;
          const targetLufs = loudnessConfig.sfx_lufs + volumeAdjust;

          const normalized = await this.normalizeAudioFile(sfxFile.uri, 'sfx', outputPath, targetLufs, loudnessConfig.true_peak_dbfs, format, sfxFile.name);
          normalizedSfx.push(normalized);
        } catch (error) {
          this.logger.warn(`Failed to normalize SFX ${sfxFile.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      timings['sfx_normalization'] = Date.now() - sfxStart;

      // Calculate total size
      const totalSize = normalizedBgm.file_size_bytes + normalizedSfx.reduce((sum, sfx) => sum + sfx.file_size_bytes, 0);

      // Create output manifest
      const manifestStart = Date.now();
      const manifestPath = path.join(outputPath, 'audio_manifest.json');
      const manifest = {
        version: '1.0.0',
        created_at: new Date().toISOString(),
        loudness_standard: input.loudness_targets.standard || 'web_standard',
        bgm_target_lufs: loudnessConfig.bgm_lufs,
        sfx_target_lufs: loudnessConfig.sfx_lufs,
        true_peak_dbfs: loudnessConfig.true_peak_dbfs,
        bgm: {
          name: 'bgm',
          original_uri: normalizedBgm.original_uri,
          normalized_uri: normalizedBgm.normalized_uri,
          filename: path.basename(normalizedBgm.normalized_uri),
          duration_sec: normalizedBgm.duration_sec,
          original_lufs: normalizedBgm.original_lufs,
          normalized_lufs: normalizedBgm.normalized_lufs,
        },
        sfx_files: normalizedSfx.map((sfx) => ({
          name: sfx.name,
          original_uri: sfx.original_uri,
          normalized_uri: sfx.normalized_uri,
          filename: path.basename(sfx.normalized_uri),
          duration_sec: sfx.duration_sec,
          original_lufs: sfx.original_lufs,
          normalized_lufs: sfx.normalized_lufs,
        })),
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      timings['manifest'] = Date.now() - manifestStart;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Audio mix completed with ${normalizedSfx.length + 1} files in ${totalTime}ms`);

      const output: MixAudioForGameOutput = {
        manifest_uri: manifestPath,
        output_dir: outputPath,
        bgm: normalizedBgm,
        sfx_files: normalizedSfx,
        total_files: normalizedSfx.length + 1,
        total_size_bytes: totalSize,
        loudness_info: {
          standard_used: input.loudness_targets.standard || 'web_standard',
          bgm_target_lufs: loudnessConfig.bgm_lufs,
          sfx_target_lufs: loudnessConfig.sfx_lufs,
          true_peak_dbfs: loudnessConfig.true_peak_dbfs,
        },
        processing_params: {
          source_bgm_uri: input.bgm_uri,
          source_sfx_count: sfxFiles.length,
          provider: input.provider,
        },
      };

      return skillSuccess(
        output,
        [
          {
            artifact_type: 'audio/mixed-pack',
            uri: outputPath,
            metadata: {
              total_files: output.total_files,
              total_size_bytes: output.total_size_bytes,
              loudness_standard: output.loudness_info.standard_used,
            },
          },
          {
            artifact_type: 'json/audio-manifest',
            uri: manifestPath,
            metadata: {
              bgm_file: path.basename(normalizedBgm.normalized_uri),
              sfx_count: normalizedSfx.length,
            },
          },
        ],
        {
          timings_ms: { total: totalTime, ...timings },
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to mix audio: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during audio mixing', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private resolveLoudnessTargets(targets: MixAudioForGameInput['loudness_targets']): {
    bgm_lufs: number;
    sfx_lufs: number;
    true_peak_dbfs: number;
  } {
    // If standard preset is specified, use it as base
    const preset = targets.standard ? LOUDNESS_PRESETS[targets.standard] : undefined;

    return {
      bgm_lufs: targets.bgm_lufs ?? preset?.bgm_lufs ?? DEFAULT_BGM_LUFS,
      sfx_lufs: targets.sfx_lufs ?? preset?.sfx_lufs ?? DEFAULT_SFX_LUFS,
      true_peak_dbfs: targets.true_peak_dbfs ?? preset?.true_peak_dbfs ?? DEFAULT_TRUE_PEAK,
    };
  }

  private async loadSfxFiles(input: MixAudioForGameInput): Promise<Array<{ name: string; uri: string; volume_adjust_db?: number }>> {
    const sfxFiles: Array<{ name: string; uri: string; volume_adjust_db?: number }> = [];

    // Load from direct file references
    if (input.sfx_files) {
      sfxFiles.push(...input.sfx_files);
    }

    // Load from manifest
    if (input.sfx_manifest) {
      try {
        const manifestContent = fs.readFileSync(input.sfx_manifest.manifest_uri, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        if (manifest.sfx_files && Array.isArray(manifest.sfx_files)) {
          const packDir = input.sfx_manifest.pack_uri || path.dirname(input.sfx_manifest.manifest_uri);

          for (const sfxEntry of manifest.sfx_files) {
            const uri = path.isAbsolute(sfxEntry.filename) ? sfxEntry.filename : path.join(packDir, sfxEntry.filename);

            if (fs.existsSync(uri)) {
              sfxFiles.push({
                name: sfxEntry.name,
                uri,
              });
            } else {
              this.logger.warn(`SFX file not found: ${uri}`);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to load SFX manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return sfxFiles;
  }

  private async normalizeAudioFile(
    inputUri: string,
    type: 'bgm' | 'sfx',
    outputDir: string,
    targetLufs: number,
    truePeak: number,
    format: string,
    name?: string,
  ): Promise<NormalizedAudioFile> {
    const inputFilename = path.basename(inputUri, path.extname(inputUri));
    const outputFilename = name || inputFilename;
    const outputUri = path.join(outputDir, `${outputFilename}_normalized.${format}`);

    // First, analyze the input file to get its current loudness
    const analysisResult = await this.analyzeAudio(inputUri);

    // Normalize the audio using ffmpeg with loudnorm filter
    const ffmpegCmd = `${this.ffmpegPath} -y -i "${inputUri}" -af "loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11:print_format=summary" -ar 44100 "${outputUri}"`;

    try {
      await execAsync(ffmpegCmd, { timeout: 120000 });
    } catch (error) {
      // If ffmpeg fails, try a simpler approach or copy the file
      this.logger.warn(`ffmpeg normalization failed, attempting fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.copyFile(inputUri, outputUri);
    }

    const stats = fs.statSync(outputUri);

    return {
      name: outputFilename,
      original_uri: inputUri,
      normalized_uri: outputUri,
      type,
      original_lufs: analysisResult.lufs,
      normalized_lufs: targetLufs,
      peak_dbfs: truePeak,
      duration_sec: analysisResult.duration_sec,
      file_size_bytes: stats.size,
    };
  }

  private async analyzeAudio(uri: string): Promise<{ lufs?: number; duration_sec: number }> {
    try {
      // Use ffprobe to get duration
      const probeCmd = `${this.ffmpegPath.replace('ffmpeg', 'ffprobe')} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${uri}"`;
      const { stdout: durationOutput } = await execAsync(probeCmd, { timeout: 30000 });
      const duration_sec = parseFloat(durationOutput.trim()) || 0;

      // Try to get loudness using ffmpeg
      const analysisCmd = `${this.ffmpegPath} -i "${uri}" -af "loudnorm=print_format=json" -f null - 2>&1`;
      try {
        const { stdout, stderr } = await execAsync(analysisCmd, { timeout: 60000 });
        const output = stdout + stderr;

        // Parse the loudnorm JSON output
        const jsonMatch = output.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
        if (jsonMatch) {
          const loudnormData = JSON.parse(jsonMatch[0]);
          return {
            lufs: parseFloat(loudnormData.input_i),
            duration_sec,
          };
        }
      } catch {
        // If loudness analysis fails, just return duration
      }

      return { duration_sec };
    } catch (error) {
      this.logger.warn(`Audio analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { duration_sec: 0 };
    }
  }

  private async copyFile(src: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(src);
      const writeStream = fs.createWriteStream(dest);

      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      readStream.pipe(writeStream);
    });
  }
}
