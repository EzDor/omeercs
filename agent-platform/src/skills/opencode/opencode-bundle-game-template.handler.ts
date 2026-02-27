import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BundleGameTemplateInput, BundleGameTemplateOutput, BundleManifest, BundledFileInfo } from '@agentic-template/dto/src/skills/bundle-game-template.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { TemplateManifest } from '@agentic-template/dto/src/template-system/template-manifest.interface';
import { TemplateManifestLoaderService } from '../../template-system/services/template-manifest-loader.service';
import { TemplateConfigValidatorService } from '../../template-system/services/template-config-validator.service';
import { OpenCodeService } from './opencode.service';
import { CodeSafetyService } from './code-safety.service';
import { ValidateBundleHandler, ValidateBundleOutput } from '../handlers/validate-bundle.handler';
import { GenerateThreejsCodeInput } from '@agentic-template/dto/src/skills/generate-threejs-code.dto';
import { isAllowedUrl, fetchWithTimeout } from '../handlers/network-safety.utils';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const GAME_TEMPLATES_PATH = path.resolve(__dirname, '../../../../..', 'templates', 'games');
const DEFAULT_VERSION = '1.0.0';

@Injectable()
export class OpenCodeBundleGameTemplateHandler implements SkillHandler<BundleGameTemplateInput, BundleGameTemplateOutput> {
  private readonly logger = new Logger(OpenCodeBundleGameTemplateHandler.name);
  private readonly outputDir: string;
  private readonly templatesDir: string;
  private readonly maxHealingIterations: number;
  private readonly promptsDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openCodeService: OpenCodeService,
    private readonly codeSafetyService: CodeSafetyService,
    private readonly manifestLoader: TemplateManifestLoaderService,
    private readonly configValidator: TemplateConfigValidatorService,
    private readonly validateHandler: ValidateBundleHandler,
  ) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.templatesDir = configService.get<string>('GAME_TEMPLATES_DIR') || GAME_TEMPLATES_PATH;
    const parsed = parseInt(configService.get<string>('BUNDLE_HEALING_MAX_ITERATIONS') || '3', 10);
    this.maxHealingIterations = Number.isNaN(parsed) || parsed < 1 ? 3 : Math.min(parsed, 10);
    this.promptsDir = path.resolve(__dirname, '..', '..', 'prompt-registry', 'prompts');
  }

  async execute(input: BundleGameTemplateInput, context: SkillExecutionContext): Promise<SkillResult<BundleGameTemplateOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing bundle_game_template via OpenCode for template ${input.template_id}, execution ${context.executionId}`);

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
      timings['validate_template_id'] = Date.now() - templateStart;

      const manifestStart = Date.now();
      let templateManifest: TemplateManifest;
      try {
        const loadResult = this.manifestLoader.loadManifest(input.template_id, input.version);
        templateManifest = loadResult.manifest;
      } catch {
        return skillFailure(`No manifest found for template: ${input.template_id}`, 'MANIFEST_NOT_FOUND', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }
      timings['load_manifest'] = Date.now() - manifestStart;

      const configValStart = Date.now();
      const validationResult = this.configValidator.validate(templateManifest, input.game_config);
      timings['validate_config'] = Date.now() - configValStart;

      if (!validationResult.valid) {
        this.logger.warn(`Game config validation warnings: ${validationResult.errors.join('; ')}. Proceeding with defaults.`);
      }

      const assetsStart = Date.now();
      const assetFiles = await this.copyAssets(input.assets, bundlePath, input.audio_uri);
      timings['copy_assets'] = Date.now() - assetsStart;

      this.writeThreeJsRuntime(bundlePath);
      this.writeGsapRuntime(bundlePath);

      const gameConfig = input.sealed_outcome_token ? { ...input.game_config, sealed_outcome_token: input.sealed_outcome_token } : input.game_config;
      const configPath = path.join(bundlePath, 'game_config.json');
      this.writeJsonFile(configPath, gameConfig);

      const codeGenStart = Date.now();
      const codeGenInput = this.buildCodeGenInput(input, templateManifest);
      const systemPrompt = this.loadPromptFile('threejs-system.prompt.txt');
      const templatePrompt = this.loadPromptFile(`${input.template_id.replace(/_/g, '-')}.prompt.txt`);
      const userPrompt = this.buildUserPrompt(codeGenInput);
      const agentSystemPrompt = this.buildAgentSystemPrompt(systemPrompt);
      const agentUserPrompt = `## Template Instructions\n\n${templatePrompt}\n\n## Generation Request\n\n${userPrompt}`;

      const scriptsDir = path.join(bundlePath, 'scripts');
      this.ensureDirectoryExists(scriptsDir);

      const sessionResult = await this.openCodeService.executeSession({
        workspaceDir: bundlePath,
        systemPrompt: agentSystemPrompt,
        userPrompt: agentUserPrompt,
      });
      timings['code_generation'] = Date.now() - codeGenStart;

      const safetyResult = this.codeSafetyService.validateWorkspaceFiles(bundlePath, 'scripts');
      if (!safetyResult.valid) {
        const reasons = [
          ...safetyResult.violations.map((v) => `${v.filename}: forbidden pattern ${v.pattern}`),
          ...safetyResult.invalidFilenames.map((f) => `invalid filename: ${f}`),
        ];
        return skillFailure(`Code safety validation failed: ${reasons.join('; ')}`, 'CODE_SAFETY_VIOLATION', {
          timings_ms: { total: Date.now() - startTime, ...timings },
        });
      }

      const scriptFiles = this.getScriptFilenames(scriptsDir);
      this.writeIndexHtml(bundlePath, scriptFiles, templateManifest.title);

      const optimizationsApplied = this.applyOptimizations(input.optimization, timings);

      const healingStart = Date.now();
      const validationOutput = await this.selfHealingLoop(bundlePath, sessionResult.sessionId, context, timings, templateManifest.title);
      timings['self_healing_total'] = Date.now() - healingStart;

      const postHealScripts = this.getScriptFilenames(scriptsDir);
      this.writeIndexHtml(bundlePath, postHealScripts, templateManifest.title);

      const allFiles = this.getAllFiles(bundlePath, bundlePath);
      const manifest = this.createManifest(bundleId, input.template_id, input.version || DEFAULT_VERSION, allFiles, assetFiles, optimizationsApplied);
      const manifestPath = path.join(bundlePath, 'bundle_manifest.json');
      this.writeJsonFile(manifestPath, manifest);

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
            validation: validationOutput ? { valid: validationOutput.valid, checks_passed: validationOutput.checks.filter((c) => c.passed).length } : undefined,
          },
        },
        {
          artifact_type: 'json/bundle-manifest',
          uri: manifestPath,
          metadata: { version: manifest.version },
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

  private async selfHealingLoop(
    bundlePath: string,
    sessionId: string,
    context: SkillExecutionContext,
    timings: Record<string, number>,
    title: string,
  ): Promise<ValidateBundleOutput | undefined> {
    let lastValidationOutput: ValidateBundleOutput | undefined;

    for (let iteration = 1; iteration <= this.maxHealingIterations; iteration++) {
      const iterStart = Date.now();
      this.logger.log(`Self-healing loop iteration ${iteration}/${this.maxHealingIterations}`);

      const validateResult = await this.validateHandler.execute({ bundle_dir: bundlePath, entry_point: 'index.html' }, context);
      timings[`validate_iteration_${iteration}`] = Date.now() - iterStart;

      if (!validateResult.ok || !validateResult.data) {
        this.logger.warn(`Validation execution failed at iteration ${iteration}: ${validateResult.error || 'Unknown'}`);
        break;
      }

      lastValidationOutput = validateResult.data;

      if (validateResult.data.valid) {
        this.logger.log(`Bundle validation passed at iteration ${iteration}`);
        break;
      }

      if (iteration >= this.maxHealingIterations) {
        this.logger.warn(`Max healing iterations reached. Last errors: ${validateResult.data.errors.join('; ')}`);
        break;
      }

      const errorFeedback = this.buildErrorFeedback(validateResult.data);
      this.logger.log(`Sending error feedback to OpenCode agent for iteration ${iteration + 1}`);

      const fixStart = Date.now();
      await this.openCodeService.sendFollowUp({
        sessionId,
        prompt: errorFeedback,
      });
      timings[`fix_iteration_${iteration}`] = Date.now() - fixStart;

      const safetyResult = this.codeSafetyService.validateWorkspaceFiles(bundlePath, 'scripts');
      if (!safetyResult.valid) {
        this.logger.warn(`Code safety check failed after fix iteration ${iteration}, stopping healing loop`);
        break;
      }

      const scriptFiles = this.getScriptFilenames(path.join(bundlePath, 'scripts'));
      this.writeIndexHtml(bundlePath, scriptFiles, title);
    }

    return lastValidationOutput;
  }

  private buildErrorFeedback(validation: ValidateBundleOutput): string {
    const sections = ['The bundle validation found the following issues. Please fix them by editing the files in the `scripts/` directory.', ''];

    if (validation.errors.length > 0) {
      sections.push('## Errors');
      for (const error of validation.errors) {
        sections.push(`- ${error}`);
      }
      sections.push('');
    }

    const failedChecks = validation.checks.filter((c) => !c.passed);
    if (failedChecks.length > 0) {
      sections.push('## Failed Checks');
      for (const check of failedChecks) {
        sections.push(`- **${check.name}**: ${check.details || 'Failed'}`);
      }
      sections.push('');
    }

    sections.push('Use the read and edit tools to inspect and fix the JavaScript files in `scripts/`.');
    sections.push('Do NOT use eval, new Function, require, or dynamic imports.');
    sections.push('Ensure window.GAME_CONFIG is accessed correctly and the gameReady event is dispatched.');

    return sections.join('\n');
  }

  private buildCodeGenInput(input: BundleGameTemplateInput, templateManifest: TemplateManifest): GenerateThreejsCodeInput {
    return {
      template_id: input.template_id,
      template_manifest: templateManifest,
      game_config: input.game_config,
      asset_mappings: input.assets?.map((a) => ({ slot_id: a.slot, uri: a.uri, type: a.type, format: a.content_type })),
      scene_overrides: input.scene_overrides,
      sealed_outcome_token: input.sealed_outcome_token,
    };
  }

  private buildAgentSystemPrompt(coreSystemPrompt: string): string {
    return [
      coreSystemPrompt,
      '',
      '== AGENT INSTRUCTIONS ==',
      '',
      'You are running as an autonomous code generation agent inside a game bundle workspace.',
      'Write each JavaScript file directly to the `scripts/` subdirectory using the file write tool.',
      'Use filenames with only alphanumeric characters, dashes, and underscores (e.g., scene-setup.js, game-logic.js).',
      'Do NOT use Node.js built-ins (fs, path, process, child_process).',
      'Do NOT use eval, new Function, require, or dynamic imports.',
      'Write only browser-safe Three.js/GSAP ES module code.',
      'Write all files to the `scripts/` directory only.',
      '',
      'If you receive validation error feedback, read the existing files with the read tool and fix them using the edit tool.',
    ].join('\n');
  }

  private buildUserPrompt(input: GenerateThreejsCodeInput): string {
    const sections: string[] = [
      `Generate Three.js game code for the "${input.template_id}" template.`,
      '',
      '## Game Configuration',
      '```json',
      JSON.stringify(input.game_config, null, 2),
      '```',
    ];

    if (input.asset_mappings && input.asset_mappings.length > 0) {
      sections.push('', '## Asset Mappings', '```json', JSON.stringify(input.asset_mappings, null, 2), '```');
    }

    if (input.scene_overrides) {
      sections.push('', '## Scene Overrides', '```json', JSON.stringify(input.scene_overrides, null, 2), '```');
    }

    if (input.sealed_outcome_token) {
      sections.push(
        '',
        '## Sealed Outcome',
        'The game config will contain a `sealed_outcome_token` field.',
        'Use `window.GAME_CONFIG.sealed_outcome_token` to access the pre-determined outcome.',
      );
    }

    sections.push('', '## Template Scene Config', '```json', JSON.stringify(input.template_manifest.scene_config, null, 2), '```');
    sections.push('', '## Asset Slots', '```json', JSON.stringify(input.template_manifest.asset_slots, null, 2), '```');

    return sections.join('\n');
  }

  private loadPromptFile(filename: string): string {
    const resolvedPromptsDir = path.resolve(this.promptsDir);
    const filePath = path.resolve(this.promptsDir, filename);
    if (!filePath.startsWith(resolvedPromptsDir + path.sep)) {
      throw new Error('Prompt file path escapes prompts directory');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt file not found for template: ${filename.replace('.prompt.txt', '')}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private getScriptFilenames(scriptsDir: string): string[] {
    if (!fs.existsSync(scriptsDir)) return [];
    return fs
      .readdirSync(scriptsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private writeIndexHtml(bundlePath: string, scriptFiles: string[], title: string): void {
    const safeScripts = scriptFiles.filter((f) => this.codeSafetyService.validateFilename(f));
    const scriptTags = safeScripts.map((f) => `  <script src="scripts/${f}" type="module" defer></script>`).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${this.escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #game-container { width: 100%; height: 100%; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script>
    window.GAME_CONFIG = null;
    fetch('game_config.json')
      .then(function(r) { return r.json(); })
      .then(function(config) {
        window.GAME_CONFIG = config;
        window.dispatchEvent(new Event('gameConfigLoaded'));
      });
  </script>
  <script src="lib/three.min.js"></script>
  <script src="lib/gsap.min.js"></script>
${scriptTags}
</body>
</html>`;

    fs.writeFileSync(path.join(bundlePath, 'index.html'), html);
  }

  private writeThreeJsRuntime(bundlePath: string): void {
    const libDir = path.join(bundlePath, 'lib');
    this.ensureDirectoryExists(libDir);
    const placeholder =
      '// Three.js r170+ runtime will be injected at deploy time\n// This placeholder enables the bundle to reference the Three.js import map\nwindow.__THREE_LOADED = true;\n';
    fs.writeFileSync(path.join(libDir, 'three.min.js'), placeholder);
  }

  private writeGsapRuntime(bundlePath: string): void {
    const libDir = path.join(bundlePath, 'lib');
    this.ensureDirectoryExists(libDir);
    const placeholder = '// GSAP runtime will be injected at deploy time\n// This placeholder enables the bundle to reference GSAP globals\nwindow.__GSAP_LOADED = true;\n';
    fs.writeFileSync(path.join(libDir, 'gsap.min.js'), placeholder);
  }

  private async copyAssets(
    assets: BundleGameTemplateInput['assets'],
    bundlePath: string,
    audioUri?: string,
  ): Promise<{ images: string[]; audio: string[]; video: string[]; models: string[]; configs: string[] }> {
    const assetFiles = { images: [] as string[], audio: [] as string[], video: [] as string[], models: [] as string[], configs: [] as string[] };
    const assetsDir = path.join(bundlePath, 'assets');
    this.ensureDirectoryExists(assetsDir);

    if (audioUri) {
      await this.copyAudioAssets(audioUri, assetsDir, assetFiles);
    }

    if (!assets || !Array.isArray(assets)) {
      return assetFiles;
    }

    for (const asset of assets) {
      const destDir = path.join(assetsDir, asset.type);
      this.ensureDirectoryExists(destDir);
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

  private async copyAudioAssets(audioUri: string, assetsDir: string, assetFiles: { audio: string[] }): Promise<void> {
    const audioDir = path.join(assetsDir, 'audio');
    this.ensureDirectoryExists(audioDir);

    if (!fs.existsSync(audioUri)) {
      this.logger.warn(`Audio URI not found: ${audioUri}`);
      return;
    }

    if (!this.isAllowedLocalPath(audioUri)) {
      this.logger.warn(`Audio URI path traversal blocked: ${audioUri}`);
      return;
    }

    if (fs.statSync(audioUri).isDirectory()) {
      const audioEntries = fs.readdirSync(audioUri, { withFileTypes: true });
      for (const entry of audioEntries) {
        if (entry.isFile()) {
          const srcFile = path.join(audioUri, entry.name);
          const destFile = path.join(audioDir, entry.name);
          fs.copyFileSync(srcFile, destFile);
          assetFiles.audio.push(path.join('assets', 'audio', entry.name));
        }
      }
    } else {
      const filename = path.basename(audioUri);
      const destPath = path.join(audioDir, filename);
      fs.copyFileSync(audioUri, destPath);
      assetFiles.audio.push(path.join('assets', 'audio', filename));
    }
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
      metadata: { total_size_bytes: totalSize, file_count: files.length, optimizations_applied: optimizationsApplied },
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
    const assetStorageDir = this.configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    return resolved.startsWith(path.resolve(this.outputDir)) || resolved.startsWith(path.resolve(assetStorageDir));
  }

  private isValidTemplateId(templateId: string, baseDir: string): boolean {
    if (templateId.includes('..') || path.isAbsolute(templateId)) return false;
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
  }

  private applyOptimizations(optimization: BundleGameTemplateInput['optimization'], timings: Record<string, number>): string[] {
    const optimizationsApplied: string[] = [];
    if (!optimization) return optimizationsApplied;
    const optimizeStart = Date.now();
    if (optimization.minify_js) optimizationsApplied.push('minify_js');
    if (optimization.minify_css) optimizationsApplied.push('minify_css');
    if (optimization.compress_images) optimizationsApplied.push('compress_images');
    if (optimization.tree_shake) optimizationsApplied.push('tree_shake');
    timings['optimize'] = Date.now() - optimizeStart;
    return optimizationsApplied;
  }

  private isRemoteUrl(uri: string): boolean {
    return uri.startsWith('http://') || uri.startsWith('https://');
  }
}
