import { Controller, Get, Param, Res, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

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

@Controller('assets')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);
  private readonly outputDir: string;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = this.configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
    this.logger.log(`Assets controller serving from: ${this.outputDir}`);
  }

  @Public()
  @Get(':runId/*')
  serveAsset(@Param('runId') runId: string, @Param() params: Record<string, string>, @Res() res: Response): void {
    const filePath = params['0'] || 'index.html';

    if (!this.isValidRunId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }

    if (this.containsPathTraversal(filePath)) {
      throw new BadRequestException('Invalid file path');
    }

    const fullPath = path.join(this.outputDir, runId, 'bundle', filePath);
    const normalizedPath = path.normalize(fullPath);

    if (!normalizedPath.startsWith(this.outputDir)) {
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
  serveRunIndex(@Param('runId') runId: string, @Res() res: Response): void {
    if (!this.isValidRunId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }

    const indexPath = path.join(this.outputDir, runId, 'bundle', 'index.html');
    const normalizedPath = path.normalize(indexPath);

    if (!normalizedPath.startsWith(this.outputDir)) {
      throw new BadRequestException('Access denied');
    }

    if (!fs.existsSync(normalizedPath)) {
      throw new NotFoundException(`Run bundle not found for: ${runId}`);
    }

    return this.streamFile(normalizedPath, res);
  }

  private streamFile(filePath: string, res: Response): void {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

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
