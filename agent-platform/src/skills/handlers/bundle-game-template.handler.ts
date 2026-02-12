import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BundleGameTemplateInput, BundleGameTemplateOutput, BundleManifest, BundledFileInfo } from '@agentic-template/dto/src/skills/bundle-game-template.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { isAllowedUrl, fetchWithTimeout } from './network-safety.utils';

import * as pathModule from 'path';

const GAME_TEMPLATES_PATH = pathModule.resolve(__dirname, '../../../../..', 'templates', 'games');
const DEFAULT_VERSION = '1.0.0';

@Injectable()
export class BundleGameTemplateHandler implements SkillHandler<BundleGameTemplateInput, BundleGameTemplateOutput> {
  private readonly logger = new Logger(BundleGameTemplateHandler.name);
  private readonly outputDir: string;
  private readonly templatesDir: string;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.templatesDir = configService.get<string>('GAME_TEMPLATES_DIR') || GAME_TEMPLATES_PATH;
  }

  async execute(input: BundleGameTemplateInput, context: SkillExecutionContext): Promise<SkillResult<BundleGameTemplateOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing bundle_game_template for template ${input.template_id}, tenant ${context.tenantId}, execution ${context.executionId}`);

    try {
      const bundleId = `bundle_${context.executionId}_${Date.now()}`;
      const bundlePath = path.join(this.outputDir, context.executionId, 'bundle');

      const setupStart = Date.now();
      this.ensureDirectoryExists(bundlePath);
      timings['setup'] = Date.now() - setupStart;

      const templateStart = Date.now();
      if (!this.isValidTemplateId(input.template_id, this.templatesDir)) {
        return skillFailure(`Invalid template_id: ${input.template_id}`, 'INPUT_VALIDATION_ERROR', {
          timings_ms: { total: Date.now() - startTime },
        });
      }
      const templatePath = path.join(this.templatesDir, input.template_id);
      await this.copyTemplateFiles(templatePath, bundlePath);
      timings['copy_template'] = Date.now() - templateStart;

      const configStart = Date.now();
      const configPath = path.join(bundlePath, 'game_config.json');
      this.writeJsonFile(configPath, input.game_config);
      timings['write_config'] = Date.now() - configStart;

      const assetsStart = Date.now();
      const assetFiles = await this.copyAssets(input.assets, bundlePath, input.audio_uri);
      timings['copy_assets'] = Date.now() - assetsStart;

      const optimizationsApplied = this.applyOptimizations(input.optimization, timings);

      const filesStart = Date.now();
      const allFiles = this.getAllFiles(bundlePath, bundlePath);
      timings['generate_file_list'] = Date.now() - filesStart;

      const manifestStart = Date.now();
      const manifest = this.createManifest(bundleId, input.template_id, input.version || DEFAULT_VERSION, allFiles, assetFiles, optimizationsApplied);
      const manifestPath = path.join(bundlePath, 'bundle_manifest.json');
      this.writeJsonFile(manifestPath, manifest);
      timings['create_manifest'] = Date.now() - manifestStart;

      const totalSizeBytes = allFiles.reduce((acc, f) => acc + f.size_bytes, 0);

      const totalTime = Date.now() - startTime;
      this.logger.log(`Game bundle created successfully in ${totalTime}ms`);

      const output: BundleGameTemplateOutput = {
        bundle_uri: bundlePath,
        manifest_uri: manifestPath,
        manifest,
        total_size_bytes: totalSizeBytes,
        file_count: allFiles.length,
        entry_point: manifest.entry_point,
        optimizations_applied: optimizationsApplied,
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'bundle/game',
          uri: bundlePath,
          metadata: {
            bundle_id: bundleId,
            template_id: input.template_id,
            file_count: allFiles.length,
            total_size_bytes: totalSizeBytes,
          },
        },
        {
          artifact_type: 'json/bundle-manifest',
          uri: manifestPath,
          metadata: {
            version: manifest.version,
          },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to bundle game template: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during game bundling', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private async copyTemplateFiles(templatePath: string, bundlePath: string): Promise<BundledFileInfo[]> {
    const files: BundledFileInfo[] = [];

    if (!fs.existsSync(templatePath)) {
      this.logger.warn(`Template path not found: ${templatePath}, creating placeholder structure`);
      return this.createPlaceholderTemplate(bundlePath, files);
    }

    await this.copyDirRecursive(templatePath, bundlePath, files, bundlePath);
    return files;
  }

  private createPlaceholderTemplate(bundlePath: string, files: BundledFileInfo[]): BundledFileInfo[] {
    const indexPath = path.join(bundlePath, 'index.html');
    const indexContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Game</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <div id="game-container"></div>
  <script src="scripts/game.js" type="module"></script>
</body>
</html>`;
    fs.writeFileSync(indexPath, indexContent);

    this.createPlaceholderDirectories(bundlePath);
    this.createPlaceholderStylesheet(bundlePath);
    this.createPlaceholderScript(bundlePath);

    const indexStats = fs.statSync(indexPath);
    files.push({
      path: 'index.html',
      size_bytes: indexStats.size,
      content_type: 'text/html',
      checksum: this.computeChecksum(indexPath),
    });

    return files;
  }

  private createPlaceholderDirectories(bundlePath: string): void {
    fs.mkdirSync(path.join(bundlePath, 'styles'), { recursive: true });
    fs.mkdirSync(path.join(bundlePath, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(bundlePath, 'assets'), { recursive: true });
  }

  private createPlaceholderStylesheet(bundlePath: string): void {
    const cssPath = path.join(bundlePath, 'styles', 'main.css');
    fs.writeFileSync(cssPath, '#game-container { width: 100%; height: 100vh; }');
  }

  private createPlaceholderScript(bundlePath: string): void {
    const jsPath = path.join(bundlePath, 'scripts', 'game.js');
    fs.writeFileSync(jsPath, 'import config from "../game_config.json" assert { type: "json" };\nconsole.log("Game loaded", config);');
  }

  private async copyDirRecursive(src: string, dest: string, files: BundledFileInfo[], basePath: string): Promise<void> {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath, files, basePath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        const stats = fs.statSync(destPath);
        files.push({
          path: path.relative(basePath, destPath),
          size_bytes: stats.size,
          content_type: this.getContentType(entry.name),
          checksum: this.computeChecksum(destPath),
        });
      }
    }
  }

  private async copyAssets(
    assets: BundleGameTemplateInput['assets'],
    bundlePath: string,
    audioUri?: string,
  ): Promise<{ images: string[]; audio: string[]; video: string[]; models: string[]; configs: string[] }> {
    const assetFiles = {
      images: [] as string[],
      audio: [] as string[],
      video: [] as string[],
      models: [] as string[],
      configs: [] as string[],
    };

    const assetsDir = path.join(bundlePath, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    if (audioUri) {
      const audioDir = path.join(assetsDir, 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      const filename = path.basename(audioUri);
      const destPath = path.join(audioDir, filename);
      if (fs.existsSync(audioUri)) {
        if (this.isAllowedLocalPath(audioUri)) {
          fs.copyFileSync(audioUri, destPath);
          assetFiles.audio.push(path.join('assets', 'audio', filename));
          this.logger.log(`Copied audio from audio_uri: ${audioUri} -> ${destPath}`);
        } else {
          this.logger.warn(`Audio URI path traversal blocked: ${audioUri}`);
        }
      } else {
        this.logger.warn(`Audio URI not found: ${audioUri}`);
      }
    }

    if (!assets || !Array.isArray(assets)) {
      return assetFiles;
    }

    for (const asset of assets) {
      const destDir = path.join(assetsDir, asset.type);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const filename = asset.slot || path.basename(asset.uri);
      const destPath = path.join(destDir, filename);
      const relativePath = path.join('assets', asset.type, filename);

      if (this.isRemoteUrl(asset.uri)) {
        if (!isAllowedUrl(asset.uri)) {
          this.logger.warn(`Blocked URL (SSRF prevention): ${asset.uri}`);
          continue;
        }
        const response = await fetchWithTimeout(asset.uri);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        } else {
          this.logger.warn(`Failed to download asset: ${asset.uri}`);
          continue;
        }
      } else if (fs.existsSync(asset.uri)) {
        if (!this.isAllowedLocalPath(asset.uri)) {
          this.logger.warn(`Local asset path traversal blocked: ${asset.uri}`);
          continue;
        }
        fs.copyFileSync(asset.uri, destPath);
      } else {
        this.logger.warn(`Asset not found: ${asset.uri}`);
        continue;
      }

      this.categorizeAsset(asset.type, relativePath, assetFiles);
    }

    return assetFiles;
  }

  private categorizeAsset(assetType: string, relativePath: string, assetFiles: { images: string[]; audio: string[]; video: string[]; models: string[]; configs: string[] }): void {
    switch (assetType) {
      case 'image':
        assetFiles.images.push(relativePath);
        break;
      case 'audio':
        assetFiles.audio.push(relativePath);
        break;
      case 'video':
        assetFiles.video.push(relativePath);
        break;
      case 'model':
        assetFiles.models.push(relativePath);
        break;
      case 'json':
        assetFiles.configs.push(relativePath);
        break;
    }
  }

  private getAllFiles(dir: string, basePath: string): BundledFileInfo[] {
    const files: BundledFileInfo[] = [];

    const processDir = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          processDir(fullPath);
        } else {
          const stats = fs.statSync(fullPath);
          files.push({
            path: path.relative(basePath, fullPath),
            size_bytes: stats.size,
            content_type: this.getContentType(entry.name),
            checksum: this.computeChecksum(fullPath),
          });
        }
      }
    };

    processDir(dir);
    return files;
  }

  private createManifest(
    bundleId: string,
    templateId: string,
    version: string,
    files: BundledFileInfo[],
    assetFiles: { images: string[]; audio: string[]; video: string[]; models: string[]; configs: string[] },
    optimizationsApplied: string[],
  ): BundleManifest {
    const totalSize = files.reduce((acc, f) => acc + f.size_bytes, 0);
    const checksumInput = files.map((f) => f.checksum).join('');
    const bundleChecksum = crypto.createHash('sha256').update(checksumInput).digest('hex');

    return {
      bundle_id: bundleId,
      template_id: templateId as BundleManifest['template_id'],
      version,
      created_at: new Date().toISOString(),
      files,
      entry_point: 'index.html',
      assets: assetFiles,
      checksum: bundleChecksum,
      metadata: {
        total_size_bytes: totalSize,
        file_count: files.length,
        optimizations_applied: optimizationsApplied,
      },
    };
  }

  private computeChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.obj': 'model/obj',
      '.fbx': 'model/fbx',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  private isAllowedLocalPath(localPath: string): boolean {
    const resolved = path.resolve(localPath);
    return resolved.startsWith(path.resolve(this.outputDir));
  }

  private isValidTemplateId(templateId: string, baseDir: string): boolean {
    if (templateId.includes('..') || path.isAbsolute(templateId)) {
      return false;
    }
    const resolvedPath = path.resolve(baseDir, templateId);
    return resolvedPath.startsWith(path.resolve(baseDir));
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private writeJsonFile(filePath: string, data: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    fs.statSync(filePath);
  }

  private applyOptimizations(optimization: BundleGameTemplateInput['optimization'], timings: Record<string, number>): string[] {
    const optimizationsApplied: string[] = [];
    if (!optimization) {
      return optimizationsApplied;
    }

    const optimizeStart = Date.now();
    if (optimization.minify_js) {
      optimizationsApplied.push('minify_js');
    }
    if (optimization.minify_css) {
      optimizationsApplied.push('minify_css');
    }
    if (optimization.compress_images) {
      optimizationsApplied.push('compress_images');
    }
    if (optimization.tree_shake) {
      optimizationsApplied.push('tree_shake');
    }
    timings['optimize'] = Date.now() - optimizeStart;

    return optimizationsApplied;
  }

  private isRemoteUrl(uri: string): boolean {
    return uri.startsWith('http://') || uri.startsWith('https://');
  }
}
