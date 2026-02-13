import { Injectable, Logger } from '@nestjs/common';

const MAX_QUEUE_LENGTH = 100;

export interface ConcurrencyLimits {
  video: number;
  audio_sfx: number;
  audio_bgm: number;
  model_3d: number;
  image: number;
}

type MediaType = keyof ConcurrencyLimits;

interface QueuedRequest {
  resolve: (release: () => void) => void;
}

@Injectable()
export class ConcurrencyLimiterService {
  private readonly logger = new Logger(ConcurrencyLimiterService.name);
  private readonly activeCounts = new Map<string, number>();
  private readonly queues = new Map<string, QueuedRequest[]>();
  private readonly limits: ConcurrencyLimits = {
    video: 2,
    audio_sfx: 2,
    audio_bgm: 2,
    model_3d: 2,
    image: 5,
  };

  async acquire(tenantId: string, mediaType: MediaType): Promise<() => void> {
    const key = this.buildKey(tenantId, mediaType);
    const limit = this.limits[mediaType];
    const active = this.activeCounts.get(key) || 0;

    if (active < limit) {
      this.activeCounts.set(key, active + 1);
      this.logger.debug(`Acquired slot for ${key}: ${active + 1}/${limit}`);
      return this.createRelease(key);
    }

    const currentQueueLength = this.getQueueLength(tenantId, mediaType);
    if (currentQueueLength >= MAX_QUEUE_LENGTH) {
      throw new Error(`Concurrency queue full for ${key}: ${currentQueueLength}/${MAX_QUEUE_LENGTH} queued requests`);
    }

    this.logger.debug(`Queuing request for ${key}: ${active}/${limit} active, queue length: ${currentQueueLength}`);
    return new Promise<() => void>((resolve) => {
      const queue = this.queues.get(key) || [];
      queue.push({ resolve });
      this.queues.set(key, queue);
    });
  }

  getActiveCount(tenantId: string, mediaType: MediaType): number {
    return this.activeCounts.get(this.buildKey(tenantId, mediaType)) || 0;
  }

  getQueueLength(tenantId: string, mediaType: MediaType): number {
    return this.queues.get(this.buildKey(tenantId, mediaType))?.length || 0;
  }

  private createRelease(key: string): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const active = this.activeCounts.get(key) || 1;
      this.activeCounts.set(key, active - 1);

      const queue = this.queues.get(key);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        this.activeCounts.set(key, (this.activeCounts.get(key) || 0) + 1);
        next.resolve(this.createRelease(key));
      }
    };
  }

  private buildKey(tenantId: string, mediaType: MediaType): string {
    return `${tenantId}:${mediaType}`;
  }
}
