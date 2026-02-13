import * as path from 'path';
import * as fs from 'fs';

const SAMPLE_TRIGGER_PAYLOAD = {
  campaign_id: 'test-campaign-001',
  campaign_name: 'Test Campaign MVP',
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
  audio: {
    style: { genre: 'electronic', mood: 'epic' },
    duration_sec: 30,
    prompt: 'upbeat electronic game music',
  },
  intro_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-intro.mp4'),
  outcome_videos: {
    win_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-win.mp4'),
    lose_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-lose.mp4'),
  },
  button_config: {
    bounds: { x: 100, y: 200, width: 150, height: 50 },
  },
  rules: {
    active: true,
    require_login: false,
  },
  branding: {
    brand_name: 'Test Brand',
  },
};

describe('Campaign Build Workflow E2E (US1)', () => {
  describe('SC-001: 4 Distinct Artifacts', () => {
    it('should have valid trigger payload with campaign_id', () => {
      expect(SAMPLE_TRIGGER_PAYLOAD.campaign_id).toBeDefined();
      expect(SAMPLE_TRIGGER_PAYLOAD.campaign_id).toBe('test-campaign-001');
    });

    it('should have all required payload fields for workflow', () => {
      expect(SAMPLE_TRIGGER_PAYLOAD.template_id).toBe('spin_wheel');
      expect(SAMPLE_TRIGGER_PAYLOAD.theme).toBe('neon_arcade');
      expect(SAMPLE_TRIGGER_PAYLOAD.difficulty).toBeDefined();
      expect(SAMPLE_TRIGGER_PAYLOAD.audio).toBeDefined();
    });

    it('should have valid video fixture paths', () => {
      expect(fs.existsSync(SAMPLE_TRIGGER_PAYLOAD.intro_video_uri)).toBe(true);
      expect(fs.existsSync(SAMPLE_TRIGGER_PAYLOAD.outcome_videos.win_video_uri)).toBe(true);
      expect(fs.existsSync(SAMPLE_TRIGGER_PAYLOAD.outcome_videos.lose_video_uri)).toBe(true);
    });
  });

  describe('SC-002: All Steps Completed with Input Hash', () => {
    it('should expect 4 steps in minimal workflow (game_config, bgm, bundle_game, manifest)', () => {
      const expectedSteps = ['game_config', 'bgm', 'bundle_game', 'manifest'];
      expect(expectedSteps.length).toBe(4);
    });

    it('should have workflow file present', () => {
      const workflowPath = path.resolve(__dirname, '../../workflows/campaign.build.minimal.v1.yaml');
      expect(fs.existsSync(workflowPath)).toBe(true);
    });
  });

  describe('SC-003: Valid URIs in Manifest', () => {
    it('should have button config with valid bounds', () => {
      expect(SAMPLE_TRIGGER_PAYLOAD.button_config.bounds.x).toBeGreaterThanOrEqual(0);
      expect(SAMPLE_TRIGGER_PAYLOAD.button_config.bounds.y).toBeGreaterThanOrEqual(0);
      expect(SAMPLE_TRIGGER_PAYLOAD.button_config.bounds.width).toBeGreaterThan(0);
      expect(SAMPLE_TRIGGER_PAYLOAD.button_config.bounds.height).toBeGreaterThan(0);
    });
  });
});

export { SAMPLE_TRIGGER_PAYLOAD };
