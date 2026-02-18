import { Controller, Get, Param, Req, Res, NotFoundException, Logger, BadRequestException, ForbiddenException, Query } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const DEFAULT_SIGNED_URL_TTL_SEC = 3600;

@Controller('assets')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);
  private readonly outputDir: string;
  private readonly signingSecret: string;
  private readonly signedUrlTtlSec: number;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = this.configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.signingSecret = this.configService.get<string>('ASSET_SIGNING_SECRET', '');
    this.signedUrlTtlSec = this.configService.get<number>('ASSET_SIGNED_URL_TTL_SEC') || DEFAULT_SIGNED_URL_TTL_SEC;
    this.logger.log(`Assets controller serving from: ${this.outputDir}`);
  }

  @Public()
  @Get('sign/:runId')
  signUrl(@Param('runId') runId: string): { url: string; expires_at: string } {
    if (!this.isValidRunId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }
    if (!this.signingSecret) {
      throw new BadRequestException('Asset signing not configured');
    }

    const expires = Math.floor(Date.now() / 1000) + this.signedUrlTtlSec;
    const sig = this.computeSignature(runId, expires);

    return {
      url: `/api/assets/${runId}?expires=${expires}&sig=${sig}`,
      expires_at: new Date(expires * 1000).toISOString(),
    };
  }

  @Public()
  @Get(':runId/*')
  serveAsset(@Param('runId') runId: string, @Req() req: Request, @Res() res: Response, @Query('expires') expires?: string, @Query('sig') sig?: string): void {
    const prefix = `/api/assets/${runId}/`;
    const decodedPath = decodeURIComponent(req.path);
    const filePath = decodedPath.startsWith(prefix) ? decodedPath.slice(prefix.length) || 'index.html' : 'index.html';

    if (!this.isValidRunId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }

    this.validateSignedAccess(runId, expires, sig, req);

    if (this.containsPathTraversal(filePath)) {
      throw new BadRequestException('Invalid file path');
    }

    const fullPath = path.join(this.outputDir, runId, 'bundle', filePath);
    const normalizedPath = path.resolve(fullPath);
    const allowedBase = path.resolve(this.outputDir) + path.sep;

    if (!normalizedPath.startsWith(allowedBase)) {
      throw new BadRequestException('Access denied');
    }

    if (!fs.existsSync(normalizedPath)) {
      this.logger.warn(`Asset not found: ${normalizedPath}`);
      throw new NotFoundException(`Asset not found: ${filePath}`);
    }

    const stat = fs.statSync(normalizedPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(normalizedPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return this.streamFile(indexPath, res);
      }
      throw new NotFoundException('Directory listing not allowed');
    }

    return this.streamFile(normalizedPath, res);
  }

  @Public()
  @Get(':runId')
  serveRunIndex(@Param('runId') runId: string, @Req() req: Request, @Res() res: Response, @Query('expires') expires?: string, @Query('sig') sig?: string): void {
    if (!this.isValidRunId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }

    this.validateSignedAccess(runId, expires, sig, req);

    const redirectUrl = sig ? `/api/assets/${runId}/index.html?expires=${expires}&sig=${sig}` : `/api/assets/${runId}/index.html`;
    res.redirect(301, redirectUrl);
  }

  private validateSignedAccess(runId: string, expires?: string, sig?: string, req?: Request): void {
    if (!this.signingSecret) {
      return;
    }

    if (!expires || !sig) {
      throw new ForbiddenException('Signed URL required for asset access');
    }

    const expiresNum = parseInt(expires, 10);
    if (isNaN(expiresNum) || expiresNum < Math.floor(Date.now() / 1000)) {
      this.logger.warn(`Expired signed URL for runId=${runId}, ip=${req?.ip}`);
      throw new ForbiddenException('Signed URL has expired');
    }

    const expectedSig = this.computeSignature(runId, expiresNum);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      this.logger.warn(`Invalid signature for runId=${runId}, ip=${req?.ip}`);
      throw new ForbiddenException('Invalid signature');
    }

    this.logger.debug(`Signed asset access: runId=${runId}, ip=${req?.ip}`);
  }

  private computeSignature(runId: string, expires: number): string {
    return crypto.createHmac('sha256', this.signingSecret).update(`${runId}:${expires}`).digest('hex').substring(0, 32);
  }

  private streamFile(filePath: string, res: Response): void {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const corsOrigin = this.configService.get<string>('WEBAPP_URL') || '*';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      this.logger.error(`Stream error for ${filePath}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error reading file' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }

  private isValidRunId(runId: string): boolean {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(runId);
  }

  private containsPathTraversal(filePath: string): boolean {
    if (filePath.includes('..') || filePath.includes('\0')) {
      return true;
    }
    try {
      const decoded = decodeURIComponent(filePath);
      if (decoded.includes('..') || decoded.includes('\0') || path.isAbsolute(decoded)) {
        return true;
      }
    } catch {
      return true;
    }
    return false;
  }
}
