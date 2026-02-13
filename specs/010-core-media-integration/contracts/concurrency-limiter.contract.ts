/**
 * Concurrency Limiter Contract
 * Per-tenant, per-provider concurrency control with unbounded queuing.
 */

export interface ConcurrencyLimits {
  video: number;
  audio_sfx: number;
  audio_bgm: number;
  model_3d: number;
  image: number;
}

export interface ConcurrencyLimiter {
  acquire(tenantId: string, mediaType: keyof ConcurrencyLimits): Promise<() => void>;

  getActiveCount(tenantId: string, mediaType: keyof ConcurrencyLimits): number;

  getQueueLength(tenantId: string, mediaType: keyof ConcurrencyLimits): number;
}
