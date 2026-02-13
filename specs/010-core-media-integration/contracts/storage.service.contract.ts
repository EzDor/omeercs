/**
 * Storage Service Contract
 * Abstraction for asset storage and retrieval.
 * Phase 1: local filesystem. Future: S3/CDN.
 */

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

export interface StorageService {
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;

  exists(contentHash: string): Promise<string | null>;

  getHttpUrl(tenantId: string, runId: string, artifactType: string, filename: string): string;

  validateTenantAccess(tenantId: string, requestedPath: string): boolean;
}
