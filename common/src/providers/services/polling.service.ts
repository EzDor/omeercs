import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GenerationJob } from '@agentic-template/dao/src/entities/generation-job.entity';
import type { GenerationJobStatus } from '@agentic-template/dao/src/entities/generation-job.entity';
import { ConcurrencyLimiterService, ConcurrencyLimits } from './concurrency-limiter.service';

export interface PollingConfig {
  pollIntervalMs: number;
  timeoutMs: number;
  providerId: string;
  mediaType: string;
}

export interface SubmitJobParams {
  tenantId: string;
  runId: string;
  runStepId: string;
  providerId: string;
  providerJobId: string;
  mediaType: string;
  inputParams: Record<string, unknown>;
  pollingConfig: PollingConfig;
}

export interface ProviderJobStatus {
  status: GenerationJobStatus;
  resultUri?: string;
  costUsd?: number;
  error?: string;
}

@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name);

  constructor(
    @InjectRepository(GenerationJob)
    private readonly generationJobRepository: Repository<GenerationJob>,
    private readonly concurrencyLimiter: ConcurrencyLimiterService,
  ) {}

  async submitAndTrack(params: SubmitJobParams): Promise<string> {
    const job = this.generationJobRepository.create({
      tenantId: params.tenantId,
      runId: params.runId,
      runStepId: params.runStepId,
      providerId: params.providerId,
      providerJobId: params.providerJobId,
      mediaType: params.mediaType,
      status: 'pending',
      pollIntervalMs: params.pollingConfig.pollIntervalMs,
      timeoutMs: params.pollingConfig.timeoutMs,
      inputParams: params.inputParams,
    });

    const saved = await this.generationJobRepository.save(job);
    this.logger.log(`Submitted generation job ${saved.id} for provider ${params.providerId} (${params.mediaType})`);
    return saved.id;
  }

  async pollUntilComplete(jobId: string, checkStatus: (providerJobId: string) => Promise<ProviderJobStatus>): Promise<void> {
    const job = await this.generationJobRepository.findOneByOrFail({ id: jobId });
    const startTime = Date.now();

    const mediaType = this.mapMediaType(job.mediaType);
    const release = mediaType ? await this.concurrencyLimiter.acquire(job.tenantId, mediaType) : undefined;

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      await this.generationJobRepository.save(job);

      while (true) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= job.timeoutMs) {
          job.status = 'timed_out';
          job.completedAt = new Date();
          await this.generationJobRepository.save(job);
          this.logger.warn(`Job ${jobId} timed out after ${elapsed}ms`);
          return;
        }

        await this.sleep(job.pollIntervalMs);
        job.attempts += 1;

        try {
          const providerStatus = await checkStatus(job.providerJobId);

          if (providerStatus.status === 'completed') {
            job.status = 'completed';
            job.resultUri = providerStatus.resultUri;
            job.costUsd = providerStatus.costUsd ? Number(providerStatus.costUsd) : undefined;
            job.completedAt = new Date();
            await this.generationJobRepository.save(job);
            this.logCost(job);
            this.logger.log(`Job ${jobId} completed successfully`);
            return;
          }

          if (providerStatus.status === 'failed') {
            job.status = 'failed';
            job.errorMessage = providerStatus.error;
            job.completedAt = new Date();
            await this.generationJobRepository.save(job);
            this.logger.warn(`Job ${jobId} failed: ${providerStatus.error}`);
            return;
          }

          await this.generationJobRepository.save(job);
        } catch (error) {
          this.logger.error(`Error polling job ${jobId}: ${(error as Error).message}`);
          job.status = 'failed';
          job.errorMessage = (error as Error).message;
          job.completedAt = new Date();
          await this.generationJobRepository.save(job);
          return;
        }
      }
    } finally {
      if (release) {
        release();
      }
    }
  }

  async recoverIncompleteJobs(): Promise<void> {
    const incompleteJobs = await this.generationJobRepository.find({
      where: {
        status: In(['pending', 'processing']),
      },
    });

    const now = Date.now();
    const recoverableJobs = incompleteJobs.filter((job) => {
      const createdAt = job.createdAt.getTime();
      return now - createdAt < job.timeoutMs;
    });

    this.logger.log(`Found ${recoverableJobs.length} recoverable incomplete jobs out of ${incompleteJobs.length} total`);

    for (const job of incompleteJobs) {
      if (!recoverableJobs.includes(job)) {
        job.status = 'timed_out';
        job.completedAt = new Date();
        await this.generationJobRepository.save(job);
      }
    }
  }

  validateMediaFile(buffer: Buffer, expectedMediaType: string): void {
    if (!buffer || buffer.length === 0) {
      throw new Error(`Downloaded file is empty for media type '${expectedMediaType}'`);
    }

    const detectedMime = this.detectMimeFromBuffer(buffer);
    if (detectedMime && !this.mimeMatchesMediaType(detectedMime, expectedMediaType)) {
      throw new Error(`MIME type mismatch: expected '${expectedMediaType}' but detected '${detectedMime}'`);
    }
  }

  private detectMimeFromBuffer(buffer: Buffer): string | undefined {
    if (buffer.length < 4) return undefined;

    const header = buffer.subarray(0, 12);

    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return 'image/png';
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) return 'audio/wav';
    if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) return 'audio/mpeg';
    if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return 'audio/mpeg';
    if (header.length >= 8 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) return 'video/mp4';
    if (header[0] === 0x67 && header[1] === 0x6c && header[2] === 0x54 && header[3] === 0x46) return 'model/gltf-binary';
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return 'video/webm';

    return undefined;
  }

  private mimeMatchesMediaType(detectedMime: string, expectedMediaType: string): boolean {
    const mediaTypeToMimePrefixes: Record<string, string[]> = {
      video: ['video/'],
      audio_sfx: ['audio/'],
      audio_bgm: ['audio/'],
      image: ['image/'],
      texture: ['image/'],
      environment_map: ['image/'],
      model_3d: ['model/', 'application/octet-stream'],
    };

    const allowedPrefixes = mediaTypeToMimePrefixes[expectedMediaType];
    if (!allowedPrefixes) return true;
    return allowedPrefixes.some((prefix) => detectedMime.startsWith(prefix));
  }

  private logCost(job: GenerationJob): void {
    if (job.costUsd) {
      this.logger.log(`[Cost] Job ${job.id} provider=${job.providerId} media=${job.mediaType} cost=$${job.costUsd}`);
    }
  }

  private mapMediaType(mediaType: string): keyof ConcurrencyLimits | undefined {
    const mapping: Record<string, keyof ConcurrencyLimits> = {
      video: 'video',
      audio_sfx: 'audio_sfx',
      audio_bgm: 'audio_bgm',
      model_3d: 'model_3d',
      image: 'image',
      texture: 'image',
      environment_map: 'image',
    };
    return mapping[mediaType];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
