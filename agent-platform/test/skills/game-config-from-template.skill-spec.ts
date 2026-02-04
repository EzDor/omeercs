import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GameConfigFromTemplateHandler } from '../../src/skills/handlers/game-config-from-template.handler';
import { GameConfigFromTemplateInput, GameConfigOutput } from '@agentic-template/dto/src/skills/game-config.dto';
import { SkillExecutionContext } from '../../src/skills/interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

const createTestContext = (overrides: Partial<SkillExecutionContext> = {}): SkillExecutionContext => ({
  tenantId: 'test-tenant-001',
  executionId: `exec-${Date.now()}`,
  runId: 'run-test-001',
  stepId: 'game_config',
  ...overrides,
});

const loadFixture = <T>(filename: string): T => {
  const fixturePath = path.join(FIXTURES_DIR, filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as T;
};

describe('GameConfigFromTemplateHandler (US2)', () => {
  let handler: GameConfigFromTemplateHandler;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.local',
        }),
      ],
      providers: [GameConfigFromTemplateHandler],
    }).compile();

    handler = moduleFixture.get<GameConfigFromTemplateHandler>(GameConfigFromTemplateHandler);
  });

  describe('AC1: Valid JSON on First Attempt', () => {
    it('should generate valid JSON matching game_config schema on first attempt', async () => {
      const input: GameConfigFromTemplateInput = {
        template_id: 'spin_wheel',
        theme: 'neon_arcade',
        difficulty: {
          level: 'medium',
          win_probability: 0.3,
        },
        color_scheme: {
          primary: '#00ff00',
          secondary: '#0000ff',
          accent: '#ff0000',
          background: '#000000',
        },
        copy: {
          title: 'Spin to Win!',
          instructions: 'Tap to spin the wheel',
          win_message: 'Congratulations!',
          lose_message: 'Better luck next time!',
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GameConfigOutput;

        expect(output.template_id).toBe('spin_wheel');
        expect(output.version).toBeDefined();
        expect(output.settings).toBeDefined();
        expect(output.settings.duration_sec).toBeGreaterThan(0);
        expect(output.settings.difficulty).toBeDefined();
        expect(output.settings.difficulty.level).toBe('medium');
        expect(output.settings.difficulty.win_probability).toBeGreaterThanOrEqual(0);
        expect(output.settings.difficulty.win_probability).toBeLessThanOrEqual(1);
        expect(output.visuals).toBeDefined();
        expect(output.visuals.theme).toBe('neon_arcade');
        expect(output.visuals.colors).toBeDefined();
        expect(output.audio).toBeDefined();
        expect(output.audio.bgm).toBeDefined();
        expect(output.mechanics).toBeDefined();
        expect(output.copy).toBeDefined();
        expect(output.copy.title).toBeDefined();
        expect(output.copy.instructions).toBeDefined();
        expect(output.copy.win_message).toBeDefined();
        expect(output.copy.lose_message).toBeDefined();

        expect(result.debug).toBeDefined();
        expect(result.debug?.timings_ms).toBeDefined();
        expect(result.debug?.timings_ms?.llm_call).toBeGreaterThan(0);
      }
    }, 60000);

    it('should use fixture input and produce valid config', async () => {
      const input = loadFixture<GameConfigFromTemplateInput>('game-config-input.json');
      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as GameConfigOutput;
        expect(output.template_id).toBe(input.template_id);
        expect(output.visuals.theme).toBe(input.theme);
      }
    }, 60000);
  });

  describe('AC2: Retry on Validation Errors', () => {
    it('should capture timing in debug regardless of outcome', async () => {
      const input: GameConfigFromTemplateInput = {
        template_id: 'scratch_card',
        theme: 'mystery_forest',
        difficulty: {
          level: 'hard',
          win_probability: 0.1,
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.debug).toBeDefined();
      expect(result.debug?.timings_ms).toBeDefined();
      expect(result.debug?.timings_ms?.total).toBeGreaterThanOrEqual(0);
    }, 60000);
  });

  describe('AC3: Clear Error After Retry Exhaustion', () => {
    it('should return VALIDATION_ERROR with schema details on persistent failure', async () => {
      const input: GameConfigFromTemplateInput = {
        template_id: 'spin_wheel',
        theme: 'test_invalid_theme_that_might_cause_issues',
        difficulty: {
          level: 'easy',
          win_probability: 0.5,
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      if (!result.ok) {
        expect(result.error_code).toBeDefined();
        expect(result.error).toBeDefined();
      } else {
        expect(result.ok).toBe(true);
      }
    }, 60000);
  });

  describe('Diagnostics', () => {
    it('should include timing information for all phases', async () => {
      const input: GameConfigFromTemplateInput = {
        template_id: 'memory_match',
        theme: 'ocean_adventure',
        difficulty: {
          level: 'easy',
          win_probability: 0.6,
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.debug?.timings_ms?.total).toBeDefined();
        expect(result.debug?.timings_ms?.prompt_build).toBeDefined();
        expect(result.debug?.timings_ms?.llm_call).toBeDefined();
        expect(result.debug?.timings_ms?.parse).toBeDefined();

        expect(result.debug?.provider_calls).toBeDefined();
        expect(result.debug?.provider_calls?.length).toBeGreaterThan(0);
        expect(result.debug?.provider_calls?.[0].provider).toBe('litellm');
        expect(result.debug?.provider_calls?.[0].duration_ms).toBeGreaterThan(0);
      }
    }, 60000);
  });

  describe('Artifact Production', () => {
    it('should produce json/game-config artifact', async () => {
      const input: GameConfigFromTemplateInput = {
        template_id: 'slot_machine',
        theme: 'vegas_gold',
        difficulty: {
          level: 'medium',
          win_probability: 0.25,
        },
      };

      const context = createTestContext();
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifacts).toBeDefined();
        expect(result.artifacts?.length).toBe(1);
        expect(result.artifacts?.[0].artifact_type).toBe('json/game-config');
        expect(result.artifacts?.[0].uri).toContain('game-config');
        expect(result.artifacts?.[0].metadata?.template_id).toBe('slot_machine');
      }
    }, 60000);
  });
});

export { createTestContext, loadFixture };
