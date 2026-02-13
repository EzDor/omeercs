import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { containsPathTraversal } from './path-safety.utils';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export interface StorageUploadParams {
  tenantId: string;
  runId: string;
  skillId: string;
  artifactType: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageUploadResult {
  uri: string;
  httpUrl: string;
  contentHash: string;
  sizeBytes: number;
  deduplicated: boolean;
  artifactId: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageDir: string;
  private readonly maxUploadSizeBytes: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Artifact)
    private readonly artifactRepository: Repository<Artifact>,
  ) {
    this.storageDir = this.configService.get<string>('ASSET_STORAGE_DIR') || '/tmp/skills/assets';
    this.maxUploadSizeBytes = this.configService.get<number>('MAX_UPLOAD_SIZE_BYTES') || DEFAULT_MAX_UPLOAD_SIZE_BYTES;
    this.logger.log(`StorageService initialized with storage dir: ${this.storageDir}`);
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    this.validateUploadSize(params.buffer);
    this.validatePathSegments(params.tenantId, params.runId, params.artifactType);

    const contentHash = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const ext = this.getExtensionFromMimeType(params.mimeType);
    const filename = `${contentHash}.${ext}`;

    const existingUri = await this.exists(contentHash);
    if (existingUri) {
      this.logger.debug(`Deduplicated asset: ${contentHash}`);
      const artifact = await this.persistArtifact(params, this.buildFilePath(params.tenantId, params.runId, params.artifactType, filename), contentHash);
      return {
        uri: this.buildFilePath(params.tenantId, params.runId, params.artifactType, filename),
        httpUrl: this.getHttpUrl(params.tenantId, params.runId, params.artifactType, filename),
        contentHash,
        sizeBytes: params.buffer.length,
        deduplicated: true,
        artifactId: artifact.id,
      };
    }

    const dirPath = path.join(this.storageDir, params.tenantId, params.runId, params.artifactType);
    this.validateResolvedPath(dirPath);

    await fs.promises.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, filename);
    this.validateResolvedPath(filePath);

    await this.writeFileWithRetry(filePath, params.buffer);

    const uri = this.buildFilePath(params.tenantId, params.runId, params.artifactType, filename);
    const artifact = await this.persistArtifact(params, uri, contentHash);

    this.logger.log(`Stored asset: ${filePath} (${params.buffer.length} bytes)`);

    return {
      uri,
      httpUrl: this.getHttpUrl(params.tenantId, params.runId, params.artifactType, filename),
      contentHash,
      sizeBytes: params.buffer.length,
      deduplicated: false,
      artifactId: artifact.id,
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

  getAbsolutePath(tenantId: string, runId: string, artifactType: string, filename: string): string {
    return path.join(this.storageDir, tenantId, runId, artifactType, filename);
  }

  private validateUploadSize(buffer: Buffer): void {
    if (buffer.length > this.maxUploadSizeBytes) {
      throw new Error(`Upload size ${buffer.length} bytes exceeds maximum allowed size of ${this.maxUploadSizeBytes} bytes`);
    }
  }

  private validatePathSegments(...segments: string[]): void {
    for (const segment of segments) {
      if (containsPathTraversal(segment)) {
        throw new Error(`Invalid path segment: contains path traversal characters`);
      }
    }
  }

  private validateResolvedPath(resolvedPath: string): void {
    const normalized = path.normalize(resolvedPath);
    if (!normalized.startsWith(this.storageDir)) {
      throw new Error('Resolved path escapes storage directory');
    }
  }

  private async persistArtifact(params: StorageUploadParams, uri: string, contentHash: string): Promise<Artifact> {
    const artifact = this.artifactRepository.create({
      tenantId: params.tenantId,
      runId: params.runId,
      skillId: params.skillId,
      type: params.artifactType,
      uri,
      contentHash,
      sizeBytes: params.buffer.length,
      filename: params.originalFilename,
      metadata: params.metadata,
    });
    return this.artifactRepository.save(artifact);
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
