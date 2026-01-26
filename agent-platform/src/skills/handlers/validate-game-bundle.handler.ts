import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ValidateGameBundleInput,
  ValidateGameBundleOutput,
  ValidationIssue,
  ValidationSummary,
  ValidationChecks,
  BundlePerformanceMetrics,
} from '@agentic-template/dto/src/skills/validate-game-bundle.dto';
import { BundleManifest } from '@agentic-template/dto/src/skills/bundle-game-template.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const REQUIRED_FILES = ['index.html', 'game_config.json', 'bundle_manifest.json'];
const MAX_RECOMMENDED_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_SINGLE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class ValidateGameBundleHandler implements SkillHandler<ValidateGameBundleInput, ValidateGameBundleOutput> {
  private readonly logger = new Logger(ValidateGameBundleHandler.name);

  constructor(private readonly configService: ConfigService) {}

  async execute(input: ValidateGameBundleInput, context: SkillExecutionContext): Promise<SkillResult<ValidateGameBundleOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing validate_game_bundle for bundle ${input.bundle_uri}, tenant ${context.tenantId}`);

    // Yield to event loop for proper async behavior
    await Promise.resolve();

    const issues: ValidationIssue[] = [];
    const checks = input.checks || {
      verify_structure: true,
      verify_manifest: true,
      verify_assets: true,
      verify_config: true,
      verify_checksums: true,
      check_performance: true,
      check_compatibility: true,
      check_security: true,
    };

    try {
      // Verify bundle exists
      if (!fs.existsSync(input.bundle_uri)) {
        return skillFailure(`Bundle not found at: ${input.bundle_uri}`, 'BUNDLE_NOT_FOUND', {
          timings_ms: { total: Date.now() - startTime },
        });
      }

      const bundlePath = input.bundle_uri;
      let manifest: BundleManifest | null = null;
      let fileCount = 0;

      // Structure validation
      if (checks.verify_structure !== false) {
        const structureStart = Date.now();
        const structureIssues = this.validateStructure(bundlePath);
        issues.push(...structureIssues);
        timings['validate_structure'] = Date.now() - structureStart;
      }

      // Manifest validation
      if (checks.verify_manifest !== false) {
        const manifestStart = Date.now();
        const manifestPath = path.join(bundlePath, 'bundle_manifest.json');
        const { issues: manifestIssues, manifest: loadedManifest } = this.validateManifest(manifestPath);
        issues.push(...manifestIssues);
        manifest = loadedManifest;
        timings['validate_manifest'] = Date.now() - manifestStart;
      }

      // Config validation
      if (checks.verify_config !== false) {
        const configStart = Date.now();
        const configPath = path.join(bundlePath, 'game_config.json');
        const { issues: configIssues } = this.validateConfig(configPath);
        issues.push(...configIssues);
        timings['validate_config'] = Date.now() - configStart;
      }

      // Asset validation
      if (checks.verify_assets !== false) {
        const assetsStart = Date.now();
        const assetIssues = this.validateAssets(bundlePath, manifest);
        issues.push(...assetIssues);
        timings['validate_assets'] = Date.now() - assetsStart;
      }

      // Checksum validation
      if (checks.verify_checksums !== false && manifest) {
        const checksumStart = Date.now();
        const checksumIssues = this.validateChecksums(bundlePath, manifest);
        issues.push(...checksumIssues);
        timings['validate_checksums'] = Date.now() - checksumStart;
      }

      // Performance analysis
      let performance: BundlePerformanceMetrics | undefined;
      if (checks.check_performance !== false) {
        const perfStart = Date.now();
        const { metrics, issues: perfIssues } = this.analyzePerformance(bundlePath);
        performance = metrics;
        issues.push(...perfIssues);
        timings['analyze_performance'] = Date.now() - perfStart;
      }

      // Compatibility check
      let compatibility: ValidateGameBundleOutput['compatibility'];
      if (checks.check_compatibility !== false) {
        const compatStart = Date.now();
        const targetPlatforms = input.target_platforms || ['web', 'mobile', 'desktop'];
        compatibility = this.checkCompatibility(bundlePath, targetPlatforms, manifest);
        timings['check_compatibility'] = Date.now() - compatStart;
      }

      // Security check
      if (checks.check_security !== false) {
        const securityStart = Date.now();
        const securityIssues = this.checkSecurity(bundlePath);
        issues.push(...securityIssues);
        timings['check_security'] = Date.now() - securityStart;
      }

      // Count files
      fileCount = this.countFiles(bundlePath);

      // Generate summary
      const summary = this.generateSummary(issues, checks);

      // Determine pass/fail
      const hasErrors = issues.some((i) => i.severity === 'error');
      const pass = !hasErrors && (input.strict_mode ? !issues.some((i) => i.severity === 'warning') : true);

      const totalTime = Date.now() - startTime;
      this.logger.log(`Game bundle validation completed in ${totalTime}ms - ${pass ? 'PASSED' : 'FAILED'}`);

      const output: ValidateGameBundleOutput = {
        pass,
        issues,
        summary,
        bundle_info: {
          bundle_id: manifest?.bundle_id,
          template_id: manifest?.template_id,
          version: manifest?.version,
          entry_point: manifest?.entry_point,
          file_count: fileCount,
        },
        performance,
        compatibility,
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'json/validation-report',
          uri: `memory://validation-report/${context.executionId}`,
          metadata: {
            pass,
            error_count: summary.errors,
            warning_count: summary.warnings,
          },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to validate game bundle: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during bundle validation', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private validateStructure(bundlePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const file of REQUIRED_FILES) {
      const filePath = path.join(bundlePath, file);
      if (!fs.existsSync(filePath)) {
        issues.push({
          code: 'MISSING_REQUIRED_FILE',
          message: `Required file missing: ${file}`,
          severity: 'error',
          category: 'structure',
          file,
          suggestion: `Create the ${file} file in the bundle root`,
        });
      }
    }

    // Check for index.html entry point
    const indexPath = path.join(bundlePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      if (!content.includes('game_config.json')) {
        issues.push({
          code: 'NO_CONFIG_REFERENCE',
          message: 'index.html does not reference game_config.json',
          severity: 'warning',
          category: 'structure',
          file: 'index.html',
          suggestion: 'Add a script import or reference to game_config.json',
        });
      }
    }

    return issues;
  }

  private validateManifest(manifestPath: string): { issues: ValidationIssue[]; manifest: BundleManifest | null } {
    const issues: ValidationIssue[] = [];
    let manifest: BundleManifest | null = null;

    if (!fs.existsSync(manifestPath)) {
      issues.push({
        code: 'MISSING_MANIFEST',
        message: 'bundle_manifest.json not found',
        severity: 'error',
        category: 'manifest',
        suggestion: 'Generate a bundle manifest using the bundle_game_template skill',
      });
      return { issues, manifest: null };
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(content) as BundleManifest;

      // Validate required fields
      if (!manifest.bundle_id) {
        issues.push({
          code: 'MISSING_BUNDLE_ID',
          message: 'Manifest missing bundle_id',
          severity: 'error',
          category: 'manifest',
        });
      }

      if (!manifest.template_id) {
        issues.push({
          code: 'MISSING_TEMPLATE_ID',
          message: 'Manifest missing template_id',
          severity: 'error',
          category: 'manifest',
        });
      }

      if (!manifest.version) {
        issues.push({
          code: 'MISSING_VERSION',
          message: 'Manifest missing version',
          severity: 'warning',
          category: 'manifest',
        });
      }

      if (!manifest.entry_point) {
        issues.push({
          code: 'MISSING_ENTRY_POINT',
          message: 'Manifest missing entry_point',
          severity: 'error',
          category: 'manifest',
          suggestion: 'Add entry_point field (typically "index.html")',
        });
      }

      if (!manifest.files || manifest.files.length === 0) {
        issues.push({
          code: 'EMPTY_FILES_LIST',
          message: 'Manifest has no files listed',
          severity: 'warning',
          category: 'manifest',
        });
      }
    } catch (e) {
      issues.push({
        code: 'INVALID_MANIFEST_JSON',
        message: `Failed to parse manifest: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
        category: 'manifest',
      });
    }

    return { issues, manifest };
  }

  private validateConfig(configPath: string): { issues: ValidationIssue[]; config: Record<string, unknown> | null } {
    const issues: ValidationIssue[] = [];
    let config: Record<string, unknown> | null = null;

    if (!fs.existsSync(configPath)) {
      issues.push({
        code: 'MISSING_CONFIG',
        message: 'game_config.json not found',
        severity: 'error',
        category: 'config',
      });
      return { issues, config: null };
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(content) as Record<string, unknown>;

      // Validate required game config fields
      if (!config.template_id) {
        issues.push({
          code: 'MISSING_CONFIG_TEMPLATE_ID',
          message: 'Config missing template_id',
          severity: 'error',
          category: 'config',
        });
      }

      if (!config.settings) {
        issues.push({
          code: 'MISSING_CONFIG_SETTINGS',
          message: 'Config missing settings object',
          severity: 'error',
          category: 'config',
        });
      }

      if (!config.visuals) {
        issues.push({
          code: 'MISSING_CONFIG_VISUALS',
          message: 'Config missing visuals object',
          severity: 'warning',
          category: 'config',
        });
      }
    } catch (e) {
      issues.push({
        code: 'INVALID_CONFIG_JSON',
        message: `Failed to parse config: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
        category: 'config',
      });
    }

    return { issues, config };
  }

  private validateAssets(bundlePath: string, manifest: BundleManifest | null): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!manifest?.assets) {
      return issues;
    }

    // Check that all listed assets exist
    const allAssets = [...manifest.assets.images, ...manifest.assets.audio, ...manifest.assets.video, ...manifest.assets.models, ...manifest.assets.configs];

    for (const assetPath of allAssets) {
      const fullPath = path.join(bundlePath, assetPath);
      if (!fs.existsSync(fullPath)) {
        issues.push({
          code: 'MISSING_ASSET',
          message: `Asset not found: ${assetPath}`,
          severity: 'error',
          category: 'assets',
          file: assetPath,
        });
      }
    }

    return issues;
  }

  private validateChecksums(bundlePath: string, manifest: BundleManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!manifest.files) {
      return issues;
    }

    for (const file of manifest.files) {
      const fullPath = path.join(bundlePath, file.path);
      if (!fs.existsSync(fullPath)) {
        continue; // Already caught by asset validation
      }

      if (file.checksum) {
        const content = fs.readFileSync(fullPath);
        const actualChecksum = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);

        if (actualChecksum !== file.checksum) {
          issues.push({
            code: 'CHECKSUM_MISMATCH',
            message: `Checksum mismatch for ${file.path}`,
            severity: 'error',
            category: 'assets',
            file: file.path,
            suggestion: 'Regenerate the bundle to fix checksums',
          });
        }
      }
    }

    return issues;
  }

  private analyzePerformance(bundlePath: string): { metrics: BundlePerformanceMetrics; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    let totalSize = 0;
    let largestFile = { path: '', size_bytes: 0 };
    const breakdown = {
      images_bytes: 0,
      audio_bytes: 0,
      video_bytes: 0,
      models_bytes: 0,
      code_bytes: 0,
      other_bytes: 0,
    };

    const processDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          processDir(fullPath);
        } else {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;

          if (stats.size > largestFile.size_bytes) {
            largestFile = { path: path.relative(bundlePath, fullPath), size_bytes: stats.size };
          }

          // Categorize by extension
          const ext = path.extname(entry.name).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
            breakdown.images_bytes += stats.size;
          } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
            breakdown.audio_bytes += stats.size;
          } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
            breakdown.video_bytes += stats.size;
          } else if (['.glb', '.gltf', '.obj', '.fbx'].includes(ext)) {
            breakdown.models_bytes += stats.size;
          } else if (['.js', '.css', '.html', '.ts'].includes(ext)) {
            breakdown.code_bytes += stats.size;
          } else {
            breakdown.other_bytes += stats.size;
          }

          // Check for oversized files
          if (stats.size > MAX_SINGLE_FILE_SIZE_BYTES) {
            issues.push({
              code: 'OVERSIZED_FILE',
              message: `File exceeds recommended size: ${path.relative(bundlePath, fullPath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`,
              severity: 'warning',
              category: 'performance',
              file: path.relative(bundlePath, fullPath),
              suggestion: 'Consider compressing or optimizing this file',
            });
          }
        }
      }
    };

    processDir(bundlePath);

    // Check total size
    if (totalSize > MAX_RECOMMENDED_SIZE_BYTES) {
      issues.push({
        code: 'OVERSIZED_BUNDLE',
        message: `Bundle size exceeds recommended limit: ${(totalSize / 1024 / 1024).toFixed(2)}MB`,
        severity: 'warning',
        category: 'performance',
        suggestion: 'Consider optimizing assets or using lazy loading',
      });
    }

    // Estimate load time (rough calculation based on 3G connection ~1.5Mbps)
    const estimatedLoadTimeMs = Math.round((totalSize / (1.5 * 1024 * 1024)) * 8 * 1000);

    return {
      metrics: {
        total_size_bytes: totalSize,
        largest_file: largestFile,
        asset_breakdown: breakdown,
        estimated_load_time_ms: estimatedLoadTimeMs,
      },
      issues,
    };
  }

  private checkCompatibility(bundlePath: string, platforms: ('web' | 'mobile' | 'desktop')[], manifest: BundleManifest | null): ValidateGameBundleOutput['compatibility'] {
    const issuesByPlatform: Record<string, ValidationIssue[]> = {};

    // Check web compatibility
    const webIssues: ValidationIssue[] = [];
    const indexPath = path.join(bundlePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');

      // Check for viewport meta tag (mobile-friendly)
      if (!content.includes('viewport')) {
        webIssues.push({
          code: 'NO_VIEWPORT_META',
          message: 'Missing viewport meta tag',
          severity: 'warning',
          category: 'compatibility',
          suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        });
      }
    }
    issuesByPlatform['web'] = webIssues;

    // Check mobile compatibility
    const mobileIssues: ValidationIssue[] = [...webIssues];
    if (manifest?.metadata?.total_size_bytes && manifest.metadata.total_size_bytes > 10 * 1024 * 1024) {
      mobileIssues.push({
        code: 'LARGE_MOBILE_BUNDLE',
        message: 'Bundle size may be too large for mobile',
        severity: 'warning',
        category: 'compatibility',
        suggestion: 'Consider reducing bundle size for better mobile experience',
      });
    }
    issuesByPlatform['mobile'] = mobileIssues;

    // Desktop typically has fewer constraints
    issuesByPlatform['desktop'] = [];

    return {
      web: platforms.includes('web') && webIssues.filter((i) => i.severity === 'error').length === 0,
      mobile: platforms.includes('mobile') && mobileIssues.filter((i) => i.severity === 'error').length === 0,
      desktop: true,
      issues_by_platform: issuesByPlatform,
    };
  }

  private checkSecurity(bundlePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const checkFile = (filePath: string) => {
      if (!fs.existsSync(filePath)) return;

      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for potential eval usage
      if (content.includes('eval(')) {
        issues.push({
          code: 'EVAL_USAGE',
          message: `Potential eval() usage detected in ${path.basename(filePath)}`,
          severity: 'warning',
          category: 'security',
          file: path.relative(bundlePath, filePath),
          suggestion: 'Avoid using eval() as it can be a security risk',
        });
      }

      // Check for inline scripts without nonce/integrity
      if (filePath.endsWith('.html') && content.includes('<script>') && !content.includes('nonce=')) {
        issues.push({
          code: 'INLINE_SCRIPT',
          message: 'Inline scripts without CSP nonce',
          severity: 'info',
          category: 'security',
          file: path.relative(bundlePath, filePath),
          suggestion: 'Consider using external scripts or adding CSP nonces',
        });
      }
    };

    // Check key files
    checkFile(path.join(bundlePath, 'index.html'));

    // Check JavaScript files
    const scriptsDir = path.join(bundlePath, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      const entries = fs.readdirSync(scriptsDir);
      for (const entry of entries) {
        if (entry.endsWith('.js')) {
          checkFile(path.join(scriptsDir, entry));
        }
      }
    }

    return issues;
  }

  private countFiles(dir: string): number {
    let count = 0;

    const processDir = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          processDir(fullPath);
        } else {
          count++;
        }
      }
    };

    processDir(dir);
    return count;
  }

  private generateSummary(issues: ValidationIssue[], checks: Partial<ValidationChecks>): ValidationSummary {
    const byCategory: ValidationSummary['by_category'] = {
      structure: { passed: 0, failed: 0, warnings: 0 },
      manifest: { passed: 0, failed: 0, warnings: 0 },
      assets: { passed: 0, failed: 0, warnings: 0 },
      config: { passed: 0, failed: 0, warnings: 0 },
      performance: { passed: 0, failed: 0, warnings: 0 },
      compatibility: { passed: 0, failed: 0, warnings: 0 },
      security: { passed: 0, failed: 0, warnings: 0 },
    };

    let errors = 0;
    let warnings = 0;

    for (const issue of issues) {
      if (issue.severity === 'error') {
        errors++;
        byCategory[issue.category].failed++;
      } else if (issue.severity === 'warning') {
        warnings++;
        byCategory[issue.category].warnings++;
      }
    }

    // Count checks that passed (categories with no errors)
    // Note: verify_checksums is excluded because it reports issues under 'assets' category
    const checkCategories: (keyof ValidationChecks)[] = [
      'verify_structure',
      'verify_manifest',
      'verify_assets',
      'verify_config',
      'check_performance',
      'check_compatibility',
      'check_security',
    ];
    const totalChecks = checkCategories.filter((k) => checks[k] !== false).length;
    let passedChecks = 0;
    for (const [, stats] of Object.entries(byCategory)) {
      if (stats.failed === 0) {
        passedChecks++;
        stats.passed = 1;
      }
    }

    return {
      total_checks: totalChecks,
      passed_checks: passedChecks,
      failed_checks: totalChecks - passedChecks,
      warnings,
      errors,
      by_category: byCategory,
    };
  }
}
