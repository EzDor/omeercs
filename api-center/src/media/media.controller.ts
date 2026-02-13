import { Controller, Get, Param, Res, Req, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { containsPathTraversal } from '@agentic-template/common/src/storage/path-safety.utils';
import * as fs from 'fs';
import * as path from 'path';

const CONTENT_TYPES: Record<string, string> = {
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
  '.hdr': 'application/octet-stream',
};

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);
  private readonly storageDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantClsService: TenantClsService,
  ) {
    this.storageDir = this.configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    this.logger.log(`MediaController serving from: ${this.storageDir}`);
  }

  @Get(':tenantId/:runId/:artifactType/:filename')
  serveMedia(
    @Param('tenantId') tenantId: string,
    @Param('runId') runId: string,
    @Param('artifactType') artifactType: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const authenticatedTenantId = this.tenantClsService.getTenantId();
    if (!authenticatedTenantId) {
      throw new ForbiddenException('No tenant context');
    }

    if (authenticatedTenantId !== tenantId) {
      this.logger.warn(`Tenant mismatch: authenticated=${authenticatedTenantId}, requested=${tenantId}`);
      throw new ForbiddenException('Access denied');
    }

    if (containsPathTraversal(tenantId) || containsPathTraversal(runId) || containsPathTraversal(artifactType) || containsPathTraversal(filename)) {
      throw new BadRequestException('Invalid path');
    }

    if (!this.isValidUuidOrId(runId)) {
      throw new BadRequestException('Invalid run ID format');
    }

    const fullPath = path.join(this.storageDir, tenantId, runId, artifactType, filename);
    const normalizedPath = path.normalize(fullPath);

    if (!normalizedPath.startsWith(this.storageDir)) {
      throw new BadRequestException('Access denied');
    }

    if (!fs.existsSync(normalizedPath)) {
      throw new NotFoundException('Asset not found');
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(normalizedPath);
    stream.on('error', (err) => {
      this.logger.error(`Stream error for ${normalizedPath}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error reading file' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }

  private isValidUuidOrId(id: string): boolean {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(id);
  }
}
