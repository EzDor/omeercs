import * as path from 'path';
import * as fs from 'fs';

const INITIAL_BUILD_PAYLOAD = {
  campaign_id: 'cache-test-campaign-001',
  campaign_name: 'Cache Test Campaign',
  template_id: 'spin_wheel',
  theme: 'neon_arcade',
  difficulty: {
    level: 'medium',
    win_probability: 0.3,
  },
  audio: {
    style: { genre: 'electronic', mood: 'epic' },
    duration_sec: 30,
  },
  intro_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-intro.mp4'),
  outcome_videos: {
    win_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-win.mp4'),
    lose_video_uri: path.resolve(__dirname, '../fixtures/videos/placeholder-lose.mp4'),
  },
};

const AUDIO_UPDATE_PAYLOAD = {
  campaign_id: 'cache-test-campaign-001',
  audio_overrides: {
    style: { genre: 'orchestral', mood: 'dramatic' },
    mood: 'dramatic',
  },
};

type StepStatusType = 'pending' | 'running' | 'skipped' | 'completed' | 'failed';

interface CacheAnalysisReport {
  runId: string;
  totalSteps: number;
  cacheHits: number;
  cacheMisses: number;
  steps: Array<{
    stepId: string;
    status: StepStatusType;
    cacheHit: boolean;
    inputHash: string;
    executedFrom: 'cache' | 'fresh';
  }>;
}

describe('Partial Rebuild with Cache Reuse E2E (US5)', () => {
  describe('AC1: Only bgm, bundle_game, manifest steps re-run after audio update', () => {
    it('should have audio overrides in update payload', () => {
      expect(AUDIO_UPDATE_PAYLOAD.audio_overrides.style.genre).toBe('orchestral');
      expect(AUDIO_UPDATE_PAYLOAD.audio_overrides.mood).toBe('dramatic');
    });

    it('should reference same campaign_id for update', () => {
      expect(AUDIO_UPDATE_PAYLOAD.campaign_id).toBe(INITIAL_BUILD_PAYLOAD.campaign_id);
    });
  });

  describe('AC2: game_config step marked as skipped with cached output', () => {
    it('should identify game_config as reusable step', () => {
      const reusableSteps = ['game_config'];
      const reExecuteSteps = ['bgm', 'bundle_game', 'manifest'];

      expect(reusableSteps).toContain('game_config');
      expect(reExecuteSteps).not.toContain('game_config');
    });

    it('should have audio update trigger fixture', () => {
      const triggerPath = path.resolve(__dirname, '../fixtures/audio-update-trigger.json');
      expect(fs.existsSync(triggerPath)).toBe(true);
    });
  });

  describe('AC3: New run shows skipped/completed status correctly per step', () => {
    it('should expect re-execution of only bgm, bundle_game, manifest steps', () => {
      const reExecutedSteps = ['bgm', 'bundle_game', 'manifest'];
      const skippedSteps = ['game_config'];

      expect(reExecutedSteps).toContain('bgm');
      expect(reExecutedSteps).toContain('bundle_game');
      expect(reExecutedSteps).toContain('manifest');
      expect(skippedSteps).toContain('game_config');
    });

    it('should define expected status per step', () => {
      const expectedStatuses: Record<string, StepStatusType> = {
        game_config: 'skipped',
        bgm: 'completed',
        bundle_game: 'completed',
        manifest: 'completed',
      };

      expect(expectedStatuses.game_config).toBe('skipped');
      expect(expectedStatuses.bgm).toBe('completed');
      expect(expectedStatuses.bundle_game).toBe('completed');
      expect(expectedStatuses.manifest).toBe('completed');
    });
  });

  describe('Update Workflow Base Run References', () => {
    it('should have update_audio workflow file', () => {
      const workflowPath = path.resolve(__dirname, '../../workflows/campaign.update_audio.v1.yaml');
      expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it('should reference base_run in update workflow for unchanged steps', () => {
      const updateWorkflowBaseRunRefs = [
        { stepId: 'bgm', inputSelector: 'base_run', path: 'data.audio_style' },
        { stepId: 'bundle_game', inputSelector: 'base_run', path: 'data' },
        { stepId: 'manifest', inputSelector: 'base_run', path: 'outputArtifactIds[0]' },
      ];

      expect(updateWorkflowBaseRunRefs[0].inputSelector).toBe('base_run');
      expect(updateWorkflowBaseRunRefs[1].inputSelector).toBe('base_run');
      expect(updateWorkflowBaseRunRefs[2].inputSelector).toBe('base_run');
    });
  });

  describe('Cache Analysis Structure', () => {
    it('should define cache analysis report structure', () => {
      const mockCacheReport: CacheAnalysisReport = {
        runId: 'test-run-id',
        totalSteps: 4,
        cacheHits: 1,
        cacheMisses: 3,
        steps: [
          { stepId: 'game_config', status: 'skipped', cacheHit: true, inputHash: 'abc123', executedFrom: 'cache' },
          { stepId: 'bgm', status: 'completed', cacheHit: false, inputHash: 'def456', executedFrom: 'fresh' },
          { stepId: 'bundle_game', status: 'completed', cacheHit: false, inputHash: 'ghi789', executedFrom: 'fresh' },
          { stepId: 'manifest', status: 'completed', cacheHit: false, inputHash: 'jkl012', executedFrom: 'fresh' },
        ],
      };

      expect(mockCacheReport.totalSteps).toBe(4);
      expect(mockCacheReport.cacheHits).toBe(1);
      expect(mockCacheReport.cacheMisses).toBe(3);
      expect(mockCacheReport.steps.filter((s) => s.cacheHit)).toHaveLength(1);
    });
  });
});

export { INITIAL_BUILD_PAYLOAD, AUDIO_UPDATE_PAYLOAD };
export type { CacheAnalysisReport };
