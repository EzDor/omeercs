import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageUploadParams {
  tenantId: string;
  runId: string;
  artifactType: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
}

export interface StorageUploadResult {
  uri: string;
  httpUrl: string;
  contentHash: string;
  sizeBytes: number;
  deduplicated: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageDir: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Artifact)
    private readonly artifactRepository: Repository<Artifact>,
  ) {
    this.storageDir = this.configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    this.logger.log(`StorageService initialized with storage dir: ${this.storageDir}`);
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const contentHash = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const ext = this.getExtensionFromMimeType(params.mimeType);
    const filename = `${contentHash}.${ext}`;

    const existingUri = await this.exists(contentHash);
    if (existingUri) {
      this.logger.debug(`Deduplicated asset: ${contentHash}`);
      return {
        uri: this.buildFilePath(params.tenantId, params.runId, params.artifactType, filename),
        httpUrl: this.getHttpUrl(params.tenantId, params.runId, params.artifactType, filename),
        contentHash,
        sizeBytes: params.buffer.length,
        deduplicated: true,
      };
    }

    const dirPath = path.join(this.storageDir, params.tenantId, params.runId, params.artifactType);
    await fs.promises.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, filename);
    await this.writeFileWithRetry(filePath, params.buffer);

    this.logger.log(`Stored asset: ${filePath} (${params.buffer.length} bytes)`);

    return {
      uri: this.buildFilePath(params.tenantId, params.runId, params.artifactType, filename),
      httpUrl: this.getHttpUrl(params.tenantId, params.runId, params.artifactType, filename),
      contentHash,
      sizeBytes: params.buffer.length,
      deduplicated: false,
    };
  }

  async exists(contentHash: string): Promise<string | null> {
    const artifact = await this.artifactRepository.findOne({
      where: { contentHash },
      select: ['uri'],
    });
    return artifact?.uri ?? null;
  }

  getHttpUrl(tenantId: string, runId: string, artifactType: string, filename: string): string {
    return `/api/media/${tenantId}/${runId}/${artifactType}/${filename}`;
  }

  validateTenantAccess(tenantId: string, requestedPath: string): boolean {
    const normalizedPath = path.normalize(requestedPath);
    return normalizedPath.startsWith(tenantId + path.sep) || normalizedPath === tenantId;
  }

  getAbsolutePath(tenantId: string, runId: string, artifactType: string, filename: string): string {
    return path.join(this.storageDir, tenantId, runId, artifactType, filename);
  }

  private buildFilePath(tenantId: string, runId: string, artifactType: string, filename: string): string {
    return path.join(tenantId, runId, artifactType, filename);
  }

  private async writeFileWithRetry(filePath: string, buffer: Buffer): Promise<void> {
    const retryableErrors = new Set(['ENOSPC', 'EACCES', 'EIO']);
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fs.promises.writeFile(filePath, buffer);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!code || !retryableErrors.has(code) || attempt === maxRetries) {
          throw error;
        }
        const delayMs = Math.pow(2, attempt) * 100;
        this.logger.warn(`Write failed (${code}), retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'model/gltf-binary': 'glb',
      'model/gltf+json': 'gltf',
      'application/octet-stream': 'bin',
    };
    return mimeMap[mimeType] || 'bin';
  }
}
