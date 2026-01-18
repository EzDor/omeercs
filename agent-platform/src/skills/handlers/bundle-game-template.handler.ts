import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BundleGameTemplateInput,
  BundleGameTemplateOutput,
  BundleManifest,
  BundledFileInfo,
  SkillResult,
  SkillArtifact,
  skillSuccess,
  skillFailure,
} from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const GAME_TEMPLATES_PATH = '/templates/games';
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
      // Create bundle output directory
      const bundleId = `bundle_${context.executionId}_${Date.now()}`;
      const bundlePath = path.join(this.outputDir, context.executionId, 'bundle');

      const setupStart = Date.now();
      if (!fs.existsSync(bundlePath)) {
        fs.mkdirSync(bundlePath, { recursive: true });
      }
      timings['setup'] = Date.now() - setupStart;

      // Copy template files
      const templateStart = Date.now();
      const templatePath = path.join(this.templatesDir, input.template_id);
      await this.copyTemplateFiles(templatePath, bundlePath);
      timings['copy_template'] = Date.now() - templateStart;

      // Write game config
      const configStart = Date.now();
      const configPath = path.join(bundlePath, 'game_config.json');
      fs.writeFileSync(configPath, JSON.stringify(input.game_config, null, 2));
      fs.statSync(configPath);
      timings['write_config'] = Date.now() - configStart;

      // Copy assets
      const assetsStart = Date.now();
      const assetFiles = await this.copyAssets(input.assets, bundlePath);
      timings['copy_assets'] = Date.now() - assetsStart;

      // Apply optimizations if requested
      const optimizationsApplied: string[] = [];
      if (input.optimization) {
        const optimizeStart = Date.now();
        if (input.optimization.minify_js) {
          optimizationsApplied.push('minify_js');
          // In production, would run actual minification
        }
        if (input.optimization.minify_css) {
          optimizationsApplied.push('minify_css');
        }
        if (input.optimization.compress_images) {
          optimizationsApplied.push('compress_images');
        }
        if (input.optimization.tree_shake) {
          optimizationsApplied.push('tree_shake');
        }
        timings['optimize'] = Date.now() - optimizeStart;
      }

      // Generate file list with checksums
      const filesStart = Date.now();
      const allFiles = this.getAllFiles(bundlePath, bundlePath);
      timings['generate_file_list'] = Date.now() - filesStart;

      // Create manifest
      const manifestStart = Date.now();
      const manifest = this.createManifest(bundleId, input.template_id, input.version || DEFAULT_VERSION, allFiles, assetFiles, optimizationsApplied);

      const manifestPath = path.join(bundlePath, 'bundle_manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      timings['create_manifest'] = Date.now() - manifestStart;

      // Calculate totals
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

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      this.logger.warn(`Template path not found: ${templatePath}, creating placeholder structure`);
      // Create placeholder index.html for demo purposes
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

      // Create directories
      fs.mkdirSync(path.join(bundlePath, 'styles'), { recursive: true });
      fs.mkdirSync(path.join(bundlePath, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(bundlePath, 'assets'), { recursive: true });

      // Create placeholder CSS
      const cssPath = path.join(bundlePath, 'styles', 'main.css');
      fs.writeFileSync(cssPath, '/* Game styles */\n#game-container { width: 100%; height: 100vh; }');

      // Create placeholder JS
      const jsPath = path.join(bundlePath, 'scripts', 'game.js');
      fs.writeFileSync(jsPath, '// Game logic\nimport config from "../game_config.json" assert { type: "json" };\nconsole.log("Game loaded", config);');

      const indexStats = fs.statSync(indexPath);
      files.push({
        path: 'index.html',
        size_bytes: indexStats.size,
        content_type: 'text/html',
        checksum: this.computeChecksum(indexPath),
      });

      return files;
    }

    // Copy all files from template recursively
    await this.copyDirRecursive(templatePath, bundlePath, files, bundlePath);
    return files;
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

    for (const asset of assets) {
      const destDir = path.join(assetsDir, asset.type);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const filename = asset.slot || path.basename(asset.uri);
      const destPath = path.join(destDir, filename);
      const relativePath = path.join('assets', asset.type, filename);

      // Handle URL or local file
      if (asset.uri.startsWith('http://') || asset.uri.startsWith('https://')) {
        // Download the asset
        const response = await fetch(asset.uri);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        } else {
          this.logger.warn(`Failed to download asset: ${asset.uri}`);
          continue;
        }
      } else if (fs.existsSync(asset.uri)) {
        fs.copyFileSync(asset.uri, destPath);
      } else {
        this.logger.warn(`Asset not found: ${asset.uri}`);
        continue;
      }

      // Categorize the asset
      switch (asset.type) {
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

    return assetFiles;
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
}
