import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { campaignBuildWorkflow } from './campaign-build.workflow';
import { campaignBuildMinimalWorkflow } from './campaign-build-minimal.workflow';
import { campaignUpdateAudioWorkflow } from './campaign-update-audio.workflow';
import { campaignUpdateIntroWorkflow } from './campaign-update-intro.workflow';
import { campaignUpdateOutcomeWorkflow } from './campaign-update-outcome.workflow';
import { campaignUpdateGameConfigWorkflow } from './campaign-update-game-config.workflow';
import { campaignReplace3dAssetWorkflow } from './campaign-replace-3d-asset.workflow';

export const ALL_WORKFLOWS: WorkflowSpec[] = [
  campaignBuildWorkflow,
  campaignBuildMinimalWorkflow,
  campaignUpdateAudioWorkflow,
  campaignUpdateIntroWorkflow,
  campaignUpdateOutcomeWorkflow,
  campaignUpdateGameConfigWorkflow,
  campaignReplace3dAssetWorkflow,
];
