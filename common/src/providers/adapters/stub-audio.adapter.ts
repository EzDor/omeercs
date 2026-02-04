import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AudioProviderAdapter, AudioGenerationParams, AudioGenerationResult } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';

@Injectable()
export class StubAudioAdapter implements AudioProviderAdapter {
  readonly providerId = 'stub';
  private readonly logger = new Logger(StubAudioAdapter.name);
  private readonly outputDir: string;

  constructor() {
    this.outputDir = process.env.SKILLS_OUTPUT_DIR || '/tmp/skills/output';
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    const startTime = Date.now();
    const durationSec = params.durationSec || 30;
    const sampleRate = params.sampleRate || 44100;
    const channels = params.channels || 2;

    this.logger.debug(`[${this.providerId}] Generating stub audio: duration=${durationSec}s, sampleRate=${sampleRate}, channels=${channels}`);

    const wavBuffer = this.generateSilentWav(durationSec, sampleRate, channels);
    const filename = `stub-audio-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`;
    const outputPath = path.join(this.outputDir, filename);

    fs.writeFileSync(outputPath, wavBuffer);

    const durationMs = Date.now() - startTime;
    this.logger.log(`[${this.providerId}] Stub audio generated in ${durationMs}ms: ${outputPath} (${wavBuffer.length} bytes)`);

    return {
      uri: outputPath,
      metadata: {
        providerId: this.providerId,
        model: 'stub-generator',
        durationSec,
        format: 'wav',
        sampleRate,
        channels,
      },
    };
  }

  supportsParams(params: AudioGenerationParams): boolean {
    if (params.durationSec !== undefined && (params.durationSec < 1 || params.durationSec > 300)) {
      return false;
    }
    if (params.sampleRate !== undefined && ![22050, 44100, 48000].includes(params.sampleRate)) {
      return false;
    }
    if (params.channels !== undefined && ![1, 2].includes(params.channels)) {
      return false;
    }
    return true;
  }

  private generateSilentWav(durationSec: number, sampleRate: number, numChannels: number): Buffer {
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(durationSec * sampleRate);
    const dataSize = numSamples * numChannels * bytesPerSample;
    const byteRate = sampleRate * numChannels * bytesPerSample;
    const blockAlign = numChannels * bytesPerSample;

    const header = Buffer.alloc(44);
    let offset = 0;

    header.write('RIFF', offset);
    offset += 4;
    header.writeUInt32LE(36 + dataSize, offset);
    offset += 4;
    header.write('WAVE', offset);
    offset += 4;
    header.write('fmt ', offset);
    offset += 4;
    header.writeUInt32LE(16, offset);
    offset += 4;
    header.writeUInt16LE(1, offset);
    offset += 2;
    header.writeUInt16LE(numChannels, offset);
    offset += 2;
    header.writeUInt32LE(sampleRate, offset);
    offset += 4;
    header.writeUInt32LE(byteRate, offset);
    offset += 4;
    header.writeUInt16LE(blockAlign, offset);
    offset += 2;
    header.writeUInt16LE(bitsPerSample, offset);
    offset += 2;
    header.write('data', offset);
    offset += 4;
    header.writeUInt32LE(dataSize, offset);

    const data = Buffer.alloc(dataSize, 0);
    return Buffer.concat([header, data]);
  }
}
