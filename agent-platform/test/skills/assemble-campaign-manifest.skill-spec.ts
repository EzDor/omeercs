import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AssembleCampaignManifestHandler } from '../../src/skills/handlers/assemble-campaign-manifest.handler';
import { AssembleCampaignManifestInput, AssembleCampaignManifestOutput, CampaignManifest } from '@agentic-template/dto/src/skills/assemble-campaign-manifest.dto';
import { SkillExecutionContext } from '../../src/skills/interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const VIDEOS_DIR = path.join(FIXTURES_DIR, 'videos');

const createTestContext = (overrides: Partial<SkillExecutionContext> = {}): SkillExecutionContext => ({
  tenantId: 'test-tenant-001',
  executionId: `exec-${Date.now()}`,
  runId: 'run-test-001',
  stepId: 'manifest',
  ...overrides,
});

const loadFixture = <T>(filename: string): T => {
  const fixturePath = path.join(FIXTURES_DIR, filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as T;
};

const createTempGameBundle = (executionId: string): string => {
  const bundleDir = path.join('/tmp/skills/test-output', executionId, 'bundle');
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'index.html'), '<html><body>Game</body></html>');
  fs.writeFileSync(path.join(bundleDir, 'game_config.json'), '{"template_id": "test"}');
  return bundleDir;
};

const cleanupTempDir = (dir: string): void => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('AssembleCampaignManifestHandler (US4)', () => {
  let handler: AssembleCampaignManifestHandler;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    process.env.SKILLS_OUTPUT_DIR = '/tmp/skills/test-output';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.local',
          load: [() => ({ SKILLS_OUTPUT_DIR: '/tmp/skills/test-output' })],
        }),
      ],
      providers: [AssembleCampaignManifestHandler],
    }).compile();

    handler = moduleFixture.get<AssembleCampaignManifestHandler>(AssembleCampaignManifestHandler);
  });

  afterAll(() => {
    tempDirs.forEach(cleanupTempDir);
  });

  describe('AC1: Manifest with All URI References', () => {
    it('should create manifest with all required URI references', async () => {
      const executionId = `test-manifest-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-001',
        campaign_name: 'Test Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;
        const manifest = output.manifest;

        expect(manifest.assets.intro_video.uri).toBe(input.intro_video_uri);
        expect(manifest.assets.intro_video.type).toBe('video');
        expect(manifest.assets.intro_video.required).toBe(true);

        expect(manifest.assets.win_video.uri).toBe(input.outcome_videos.win_video_uri);
        expect(manifest.assets.win_video.type).toBe('video');

        expect(manifest.assets.lose_video.uri).toBe(input.outcome_videos.lose_video_uri);
        expect(manifest.assets.lose_video.type).toBe('video');

        expect(manifest.assets.game_bundle.uri).toBe(bundleDir);
        expect(manifest.assets.game_bundle.type).toBe('bundle');

        expect(manifest.campaign_id).toBe(input.campaign_id);
        expect(manifest.campaign_name).toBe(input.campaign_name);
      }
    });

    it('should include additional assets when provided', async () => {
      const executionId = `test-manifest-additional-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-002',
        campaign_name: 'Test Campaign with Branding',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
          click_sound_uri: 'https://example.com/click.mp3',
        },
        branding: {
          brand_name: 'Test Brand',
          logo_uri: 'https://example.com/logo.png',
          primary_color: '#ff0000',
          secondary_color: '#00ff00',
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;
        const manifest = output.manifest;

        expect(manifest.assets.additional.length).toBeGreaterThan(0);
        expect(manifest.branding?.brand_name).toBe('Test Brand');
        expect(manifest.branding?.logo_uri).toBe('https://example.com/logo.png');
      }
    });
  });

  describe('AC2: Schema Validation', () => {
    it('should produce manifest that validates against schema', async () => {
      const executionId = `test-manifest-schema-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-003',
        campaign_name: 'Schema Test Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
        rules: {
          require_login: false,
          max_plays_per_user: 5,
        },
        analytics: {
          track_impressions: true,
          track_completions: true,
          tracking_id: 'GA-12345',
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;
        const manifest = output.manifest;

        expect(manifest.manifest_version).toBeDefined();
        expect(manifest.manifest_version).toBe('1.0.0');
        expect(manifest.campaign_id).toBeDefined();
        expect(manifest.campaign_name).toBeDefined();
        expect(manifest.created_at).toBeDefined();
        expect(manifest.updated_at).toBeDefined();
        expect(manifest.version).toBeDefined();

        expect(manifest.assets).toBeDefined();
        expect(manifest.assets.intro_video).toBeDefined();
        expect(manifest.assets.win_video).toBeDefined();
        expect(manifest.assets.lose_video).toBeDefined();
        expect(manifest.assets.game_bundle).toBeDefined();

        expect(manifest.interaction).toBeDefined();
        expect(manifest.interaction.button).toBeDefined();
        expect(manifest.interaction.button.bounds).toBeDefined();
        expect(manifest.interaction.game_container).toBeDefined();
        expect(manifest.interaction.game_container.entry_point).toBe('index.html');
        expect(manifest.interaction.game_container.config_path).toBe('game_config.json');

        expect(manifest.flow).toBeDefined();
        expect(manifest.flow.sequence).toEqual(['intro', 'game', 'outcome']);
        expect(manifest.flow.intro_to_game_trigger).toBe('button_click');
        expect(manifest.flow.game_to_outcome_trigger).toBe('game_complete');

        expect(manifest.rules).toBeDefined();
        expect(manifest.rules.active).toBe(true);
        expect(manifest.rules.require_login).toBe(false);

        expect(manifest.analytics).toBeDefined();
        expect(manifest.analytics.enabled).toBe(true);
        expect(manifest.analytics.tracking_id).toBe('GA-12345');
        expect(manifest.analytics.events.length).toBeGreaterThan(0);

        expect(manifest.checksum).toBeDefined();
        expect(manifest.checksum.length).toBe(64);
      }
    });

    it('should write valid JSON manifest file', async () => {
      const executionId = `test-manifest-file-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-004',
        campaign_name: 'File Test Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;

        expect(fs.existsSync(output.manifest_uri)).toBe(true);

        const fileContent = fs.readFileSync(output.manifest_uri, 'utf-8');
        const parsedManifest = JSON.parse(fileContent) as CampaignManifest;

        expect(parsedManifest.campaign_id).toBe(input.campaign_id);
        expect(parsedManifest.manifest_version).toBe('1.0.0');
      }
    });
  });

  describe('Missing URI Error Handling', () => {
    it('should report missing assets in validation output', async () => {
      const executionId = `test-manifest-missing-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-005',
        campaign_name: 'Missing Assets Campaign',
        intro_video_uri: '/nonexistent/intro.mp4',
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: '/nonexistent/lose.mp4',
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;

        expect(output.validation.all_assets_valid).toBe(false);
        expect(output.validation.missing_assets.length).toBeGreaterThan(0);
        expect(output.validation.missing_assets.some((m) => m.includes('intro_video'))).toBe(true);
        expect(output.validation.missing_assets.some((m) => m.includes('lose_video'))).toBe(true);
        expect(output.deployment_ready).toBe(false);
      }
    });

    it('should report warnings for optional missing assets', async () => {
      const executionId = `test-manifest-warnings-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-006',
        campaign_name: 'Warnings Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
          click_sound_uri: '/nonexistent/click.mp3',
        },
        branding: {
          brand_name: 'Test Brand',
          logo_uri: '/nonexistent/logo.png',
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;

        expect(output.validation.warnings.length).toBeGreaterThan(0);
        expect(output.validation.warnings.some((w) => w.includes('click sound') || w.includes('Click sound'))).toBe(true);
        expect(output.validation.warnings.some((w) => w.includes('logo') || w.includes('Brand logo'))).toBe(true);
      }
    });

    it('should validate button bounds', async () => {
      const executionId = `test-manifest-bounds-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-007',
        campaign_name: 'Invalid Bounds Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 0, height: -10 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;
        expect(output.validation.warnings.some((w) => w.includes('bounds') || w.includes('width') || w.includes('height'))).toBe(true);
      }
    });
  });

  describe('Artifact Production', () => {
    it('should produce json/campaign-manifest artifact', async () => {
      const executionId = `test-manifest-artifact-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-008',
        campaign_name: 'Artifact Test Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifacts).toBeDefined();
        expect(result.artifacts?.length).toBe(1);
        expect(result.artifacts?.[0].artifact_type).toBe('json/campaign-manifest');
        expect(result.artifacts?.[0].metadata?.campaign_id).toBe(input.campaign_id);
        expect(result.artifacts?.[0].metadata?.campaign_name).toBe(input.campaign_name);
        expect(result.artifacts?.[0].metadata?.deployment_ready).toBeDefined();
      }
    });
  });

  describe('Diagnostics', () => {
    it('should include timing information for all phases', async () => {
      const executionId = `test-manifest-timing-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const input: AssembleCampaignManifestInput = {
        campaign_id: 'test-campaign-009',
        campaign_name: 'Timing Test Campaign',
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
        button_config: {
          bounds: { x: 100, y: 200, width: 150, height: 50 },
        },
      };

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.debug).toBeDefined();
        expect(result.debug?.timings_ms).toBeDefined();
        expect(result.debug?.timings_ms?.total).toBeGreaterThanOrEqual(0);
        expect(result.debug?.timings_ms?.setup).toBeDefined();
        expect(result.debug?.timings_ms?.validate_assets).toBeDefined();
        expect(result.debug?.timings_ms?.build_asset_refs).toBeDefined();
        expect(result.debug?.timings_ms?.build_manifest).toBeDefined();
        expect(result.debug?.timings_ms?.write_manifest).toBeDefined();
      }
    });
  });

  describe('Fixture Input', () => {
    it('should process fixture input correctly', async () => {
      const executionId = `test-manifest-fixture-${Date.now()}`;
      const bundleDir = createTempGameBundle(executionId);
      tempDirs.push(path.dirname(bundleDir));

      const fixtureInput = loadFixture<Record<string, unknown>>('manifest-input.json');

      const input: AssembleCampaignManifestInput = {
        ...fixtureInput,
        intro_video_uri: path.join(VIDEOS_DIR, 'placeholder-intro.mp4'),
        outcome_videos: {
          win_video_uri: path.join(VIDEOS_DIR, 'placeholder-win.mp4'),
          lose_video_uri: path.join(VIDEOS_DIR, 'placeholder-lose.mp4'),
        },
        game_bundle_uri: bundleDir,
      } as AssembleCampaignManifestInput;

      const context = createTestContext({ executionId });
      const result = await handler.execute(input, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.data as AssembleCampaignManifestOutput;
        expect(output.manifest.campaign_id).toBe(fixtureInput['campaign_id']);
        expect(output.manifest.campaign_name).toBe(fixtureInput['campaign_name']);
      }
    });
  });
});

export { createTestContext, loadFixture, createTempGameBundle, cleanupTempDir };
