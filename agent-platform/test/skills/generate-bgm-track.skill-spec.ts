import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GenerateBgmTrackHandler } from '../../src/skills/handlers/generate-bgm-track.handler';
import { GenerateBgmTrackInput, GenerateBgmTrackOutput } from '@agentic-template/dto/src/skills/generate-bgm-track.dto';
import { SkillExecutionContext } from '../../src/skills/interfaces/skill-handler.interface';
import { ProvidersModule } from '@agentic-template/common/src/providers/providers.module';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

const createTestContext = (overrides: Partial<SkillExecutionContext> = {}): SkillExecutionContext => ({
  tenantId: 'test-tenant-001',
  executionId: `exec-${Date.now()}`,
  runId: 'run-test-001',
  stepId: 'bgm',
  ...overrides,
});

const loadFixture = <T>(filename: string): T => {
  const fixturePath = path.join(FIXTURES_DIR, filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as T;
};

const verifyWavHeader = (buffer: Buffer): { valid: boolean; sampleRate: number; channels: number; bitsPerSample: number } => {
  if (buffer.length < 44) {
    return { valid: false, sampleRate: 0, channels: 0, bitsPerSample: 0 };
  }

  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  const fmt = buffer.toString('ascii', 12, 16);

  if (riff !== 'RIFF' || wave !== 'WAVE' || fmt !== 'fmt ') {
    return { valid: false, sampleRate: 0, channels: 0, bitsPerSample: 0 };
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  return { valid: true, sampleRate, channels, bitsPerSample };
};

describe('GenerateBgmTrackHandler (US3)', () => {
  let handler: GenerateBgmTrackHandler;

  beforeAll(async () => {
    process.env.AUDIO_PROVIDER_STUB = 'true';
    process.env.SKILLS_OUTPUT_DIR = '/tmp/skills/test-output';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.local',
          load: [() => ({ AUDIO_PROVIDER_STUB: 'true', SKILLS_OUTPUT_DIR: '/tmp/skills/test-output' })],
        }),
        ProvidersModule,
      ],
      providers: [GenerateBgmTrackHandler],
    }).compile();

    handler = moduleFixture.get<GenerateBgmTrackHandler>(GenerateBgmTrackHandler);
  });

  afterAll(() => {
    delete process.env.AUDIO_PROVIDER_STUB;
  });

  describe('AC1: Audio Artifact Production', () => {
    it('should produce audio artifact with stub provider', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'electronic',
          mood: 'epic',
        },
        duration_sec: 30,
        loopable: true,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;

        expect(output.audio_uri).toBeDefined();
        expect(output.audio_uri).toContain('.wav');
        expect(output.duration_sec).toBe(30);
        expect(output.format).toBe('wav');
        expect(output.is_loopable).toBe(true);

        expect(result.artifacts).toBeDefined();
        expect(result.artifacts?.length).toBe(1);
        expect(result.artifacts?.[0].artifact_type).toBe('audio/bgm');
        expect(result.artifacts?.[0].uri).toBe(output.audio_uri);
        expect(result.artifacts?.[0].metadata?.provider).toBe('stub');
      }
    });

    it('should produce audio file that exists on filesystem', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'ambient',
        },
        duration_sec: 10,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;
        expect(fs.existsSync(output.audio_uri)).toBe(true);
      }
    });
  });

  describe('AC2: Duration Matching', () => {
    it('should generate audio file matching requested duration', async () => {
      const requestedDuration = 15;
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'chiptune',
          mood: 'playful',
        },
        duration_sec: requestedDuration,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;
        expect(output.duration_sec).toBe(requestedDuration);

        const fileBuffer = fs.readFileSync(output.audio_uri);
        const headerInfo = verifyWavHeader(fileBuffer);
        expect(headerInfo.valid).toBe(true);

        const expectedDataSize = requestedDuration * headerInfo.sampleRate * headerInfo.channels * (headerInfo.bitsPerSample / 8);
        const actualDataSize = fileBuffer.length - 44;
        expect(actualDataSize).toBe(expectedDataSize);
      }
    });

    it('should respect sample rate and channels parameters', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'orchestral',
        },
        duration_sec: 5,
        specs: {
          sample_rate: 44100,
          channels: 2,
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;
        expect(output.sample_rate).toBe(44100);
        expect(output.channels).toBe(2);

        const fileBuffer = fs.readFileSync(output.audio_uri);
        const headerInfo = verifyWavHeader(fileBuffer);
        expect(headerInfo.sampleRate).toBe(44100);
        expect(headerInfo.channels).toBe(2);
      }
    });
  });

  describe('WAV Header Validation', () => {
    it('should generate WAV file with correct RIFF/WAVE header', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'lofi',
        },
        duration_sec: 5,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;
        const fileBuffer = fs.readFileSync(output.audio_uri);

        expect(fileBuffer.toString('ascii', 0, 4)).toBe('RIFF');
        expect(fileBuffer.toString('ascii', 8, 12)).toBe('WAVE');
        expect(fileBuffer.toString('ascii', 12, 16)).toBe('fmt ');
        expect(fileBuffer.toString('ascii', 36, 40)).toBe('data');

        const headerInfo = verifyWavHeader(fileBuffer);
        expect(headerInfo.valid).toBe(true);
        expect(headerInfo.bitsPerSample).toBe(16);
      }
    });
  });

  describe('Metadata in Response', () => {
    it('should include complete metadata in output', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'cinematic',
          mood: 'epic',
          instruments: 'strings, brass, percussion',
        },
        duration_sec: 20,
        bpm: 120,
        loopable: true,
        seed: 12345,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;

        expect(output.generation_params).toBeDefined();
        expect(output.generation_params.style).toBe('cinematic');
        expect(output.generation_params.mood).toBe('epic');
        expect(output.generation_params.bpm).toBe(120);
        expect(output.generation_params.seed).toBe(12345);
        expect(output.generation_params.model).toBe('stub-generator');
      }
    });

    it('should include artifact metadata with provider info', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'jazz',
        },
        duration_sec: 10,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifacts?.[0].metadata?.duration_sec).toBe(10);
        expect(result.artifacts?.[0].metadata?.format).toBe('wav');
        expect(result.artifacts?.[0].metadata?.is_loopable).toBeDefined();
        expect(result.artifacts?.[0].metadata?.provider).toBe('stub');
      }
    });
  });

  describe('Diagnostics', () => {
    it('should include timing information', async () => {
      const input: GenerateBgmTrackInput = {
        style: {
          genre: 'electronic',
        },
        duration_sec: 5,
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.debug).toBeDefined();
        expect(result.debug?.timings_ms).toBeDefined();
        expect(result.debug?.timings_ms?.total).toBeGreaterThanOrEqual(0);
        expect(result.debug?.timings_ms?.generation).toBeGreaterThanOrEqual(0);

        expect(result.debug?.provider_calls).toBeDefined();
        expect(result.debug?.provider_calls?.length).toBe(1);
        expect(result.debug?.provider_calls?.[0].provider).toBe('stub');
        expect(result.debug?.provider_calls?.[0].model).toBe('stub-generator');
      }
    });
  });

  describe('Fixture Input', () => {
    it('should process fixture input correctly', async () => {
      const input = loadFixture<GenerateBgmTrackInput>('bgm-input.json');
      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GenerateBgmTrackOutput;
        expect(output.duration_sec).toBe(input.duration_sec);
        expect(output.generation_params.style).toBe(input.style.genre);
      }
    });
  });
});

export { createTestContext, loadFixture, verifyWavHeader };
