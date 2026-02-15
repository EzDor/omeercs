import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import puppeteer, { Browser } from 'puppeteer';

export interface ValidateBundleInput {
  bundle_dir: string;
  entry_point: string;
  timeout_ms?: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface ValidateBundleOutput {
  valid: boolean;
  checks: ValidationCheck[];
  total_size_bytes: number;
  load_time_ms: number;
  errors: string[];
}

const MAX_BUNDLE_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ValidateBundleHandler implements SkillHandler<ValidateBundleInput, ValidateBundleOutput> {
  private readonly logger = new Logger(ValidateBundleHandler.name);
  private readonly defaultTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultTimeoutMs = parseInt(configService.get<string>('BUNDLE_VALIDATION_TIMEOUT_MS') || '15000', 10);
  }

  async execute(input: ValidateBundleInput, context: SkillExecutionContext): Promise<SkillResult<ValidateBundleOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    const timeoutMs = input.timeout_ms || this.defaultTimeoutMs;

    this.logger.log(`Validating bundle at ${input.bundle_dir}, entry: ${input.entry_point}`);

    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    let browser: Browser | null = null;
    let server: http.Server | null = null;

    try {
      if (!fs.existsSync(input.bundle_dir)) {
        return skillFailure(`Bundle directory not found: ${input.bundle_dir}`, 'BUNDLE_NOT_FOUND', {
          timings_ms: { total: Date.now() - startTime },
        });
      }

      const sizeStart = Date.now();
      const totalSizeBytes = this.calculateDirectorySize(input.bundle_dir);
      timings['calculate_size'] = Date.now() - sizeStart;

      const sizeCheck: ValidationCheck = {
        name: 'bundle_size_under_5mb',
        passed: totalSizeBytes <= MAX_BUNDLE_SIZE_BYTES,
        details: `Bundle size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB (limit: 5MB)`,
      };
      checks.push(sizeCheck);
      if (!sizeCheck.passed) {
        errors.push(`Bundle size ${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit`);
      }

      const serverStart = Date.now();
      const { server: httpServer, port } = await this.startStaticServer(input.bundle_dir);
      server = httpServer;
      timings['start_server'] = Date.now() - serverStart;

      const browserStart = Date.now();
      browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions', '--disable-background-networking'],
      });
      timings['launch_browser'] = Date.now() - browserStart;

      const page = await browser.newPage();

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      page.on('pageerror', (err: Error) => {
        consoleErrors.push(err.message);
      });

      const navStart = Date.now();
      const url = `http://127.0.0.1:${port}/${input.entry_point}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const loadTimeMs = Date.now() - navStart;
      timings['page_load'] = loadTimeMs;

      const htmlLoads: ValidationCheck = {
        name: 'html_loads',
        passed: response !== null && response.ok(),
        details: response ? `Status: ${response.status()}` : 'No response',
      };
      checks.push(htmlLoads);
      if (!htmlLoads.passed) {
        errors.push('HTML failed to load');
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const webglCheck = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { found: false, context: null };
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return { found: true, context: gl ? 'available' : null };
      });

      const webglCreated: ValidationCheck = {
        name: 'webgl_context_created',
        passed: webglCheck.found && webglCheck.context === 'available',
        details: webglCheck.found ? `Canvas found, WebGL: ${webglCheck.context}` : 'No canvas element found',
      };
      checks.push(webglCreated);
      if (!webglCreated.passed) {
        errors.push('WebGL context not created');
      }

      const gameConfigAccessible = await page.evaluate(() => {
        return typeof (window as unknown as Record<string, unknown>).GAME_CONFIG !== 'undefined';
      });

      const configCheck: ValidationCheck = {
        name: 'game_config_accessible',
        passed: gameConfigAccessible,
        details: gameConfigAccessible ? 'window.GAME_CONFIG is defined' : 'window.GAME_CONFIG is undefined',
      };
      checks.push(configCheck);
      if (!configCheck.passed) {
        errors.push('window.GAME_CONFIG not accessible');
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const noJsErrors: ValidationCheck = {
        name: 'no_uncaught_js_errors',
        passed: consoleErrors.length === 0,
        details: consoleErrors.length > 0 ? `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 3).join('; ')}` : 'No errors detected',
      };
      checks.push(noJsErrors);
      if (!noJsErrors.passed) {
        errors.push(...consoleErrors.slice(0, 5));
      }

      const gameReadyFired = await page.evaluate(
        (timeout: number) => {
          return new Promise<boolean>((resolve) => {
            if ((window as unknown as Record<string, unknown>).__gameReady) {
              resolve(true);
              return;
            }
            const handler = () => {
              resolve(true);
              window.removeEventListener('gameReady', handler);
            };
            window.addEventListener('gameReady', handler);
            setTimeout(() => resolve(false), timeout);
          });
        },
        Math.max(Math.min(timeoutMs - (Date.now() - startTime), 5000), 1000),
      );

      const readyCheck: ValidationCheck = {
        name: 'game_ready_event',
        passed: gameReadyFired,
        details: gameReadyFired ? 'gameReady event fired' : 'gameReady event did not fire within timeout',
      };
      checks.push(readyCheck);
      if (!readyCheck.passed) {
        errors.push('gameReady event did not fire');
      }

      const allPassed = checks.every((c) => c.passed);

      const output: ValidateBundleOutput = {
        valid: allPassed,
        checks,
        total_size_bytes: totalSizeBytes,
        load_time_ms: loadTimeMs,
        errors,
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'json/validation-report',
          uri: `memory://headless-validation/${context.executionId}`,
          metadata: { valid: allPassed, checks_passed: checks.filter((c) => c.passed).length, checks_total: checks.length },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: Date.now() - startTime, ...timings },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Bundle validation failed: ${errorMsg}`);
      return skillFailure(errorMsg, 'VALIDATION_ERROR', {
        timings_ms: { total: Date.now() - startTime, ...timings },
      });
    } finally {
      if (browser) {
        await browser.close().catch((err: Error) => this.logger.warn(`Browser close error: ${err.message}`));
      }
      if (server) {
        await new Promise<void>((resolve) => {
          server!.close((err) => {
            if (err) this.logger.warn(`Server close error: ${err.message}`);
            resolve();
          });
        });
      }
    }
  }

  private async startStaticServer(bundleDir: string): Promise<{ server: http.Server; port: number }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const rawUrl = (req.url || '/').split('?')[0].split('#')[0];
        const urlPath = rawUrl === '/' ? '/index.html' : rawUrl;
        const decodedPath = decodeURIComponent(urlPath);
        const filePath = path.resolve(bundleDir, '.' + decodedPath);
        const resolvedBundleDir = path.resolve(bundleDir);

        if (!filePath.startsWith(resolvedBundleDir + path.sep) && filePath !== resolvedBundleDir) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.glb': 'model/gltf-binary',
          '.mp3': 'audio/mpeg',
          '.ogg': 'audio/ogg',
          '.wav': 'audio/wav',
        };

        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          resolve({ server, port: address.port });
        } else {
          reject(new Error('Failed to bind server'));
        }
      });

      server.on('error', reject);
    });
  }

  private calculateDirectorySize(dirPath: string): number {
    let totalSize = 0;

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          totalSize += fs.statSync(fullPath).size;
        }
      }
    };

    walk(dirPath);
    return totalSize;
  }
}
