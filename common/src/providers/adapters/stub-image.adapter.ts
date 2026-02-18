import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { ImageProviderAdapter, ImageGenerationParams, ImageGenerationResult } from '@agentic-template/dto/src/providers/interfaces/image-provider.interface';

@Injectable()
export class StubImageAdapter implements ImageProviderAdapter {
  readonly providerId = 'stub';
  private readonly logger = new Logger(StubImageAdapter.name);
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

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const width = params.width || 1024;
    const height = params.height || 1024;

    this.logger.debug(`[${this.providerId}] Generating stub image: ${width}x${height}`);

    const pngBuffer = this.generateSolidPng(width, height, [100, 149, 237]);
    const filename = `stub-image-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
    const outputPath = path.join(this.outputDir, filename);

    fs.writeFileSync(outputPath, pngBuffer);

    const durationMs = Date.now() - startTime;
    this.logger.log(`[${this.providerId}] Stub image generated in ${durationMs}ms: ${outputPath} (${pngBuffer.length} bytes)`);

    return {
      uri: outputPath,
      metadata: {
        providerId: this.providerId,
        model: 'stub-generator',
        width,
        height,
        format: 'png',
      },
    };
  }

  supportsParams(params: ImageGenerationParams): boolean {
    if (params.width !== undefined && (params.width < 1 || params.width > 4096)) return false;
    if (params.height !== undefined && (params.height < 1 || params.height > 4096)) return false;
    return true;
  }

  private generateSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
    const rawData = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
      const rowOffset = y * (1 + width * 3);
      rawData[rowOffset] = 0;
      for (let x = 0; x < width; x++) {
        const pixelOffset = rowOffset + 1 + x * 3;
        rawData[pixelOffset] = rgb[0];
        rawData[pixelOffset + 1] = rgb[1];
        rawData[pixelOffset + 2] = rgb[2];
      }
    }

    const compressed = zlib.deflateSync(rawData);

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = this.buildChunk('IHDR', this.buildIhdrData(width, height));
    const idat = this.buildChunk('IDAT', compressed);
    const iend = this.buildChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
  }

  private buildIhdrData(width: number, height: number): Buffer {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data[8] = 8;
    data[9] = 2;
    data[10] = 0;
    data[11] = 0;
    data[12] = 0;
    return data;
  }

  private buildChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type);
    const crcInput = Buffer.concat([typeBuffer, data]);

    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(this.crc32(crcInput) >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  private crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return crc ^ 0xffffffff;
  }
}
