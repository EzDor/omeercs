/**
 * Campaign Context Service Contract
 *
 * Internal service interfaces for campaign context management.
 * This file documents the service contracts for implementation.
 *
 * Feature: 008-campaign-context
 * Date: 2026-02-03
 */

// ============================================================================
// Core Types
// ============================================================================

export type TriggerType = 'manual' | 'scheduled' | 'api';
export type QualityStatus = 'passed' | 'failed' | 'warning';

export interface TriggerInfo {
  type: TriggerType;
  payload?: Record<string, unknown>;
  timestamp: string;
  initiatedBy?: string;
}

export interface ArtifactData {
  type: string;
  uri: string;
  hash: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  stepId: string;
}

export interface QualityCheckResult {
  artifactId: string;
  checkType: string;
  status: QualityStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ComputedData {
  inputHashesByStep: Record<string, string>;
  qualityChecks: QualityCheckResult[];
}

export interface ArtifactReferences {
  planArtifactId?: string;
  introImageArtifactId?: string;
  introVideoArtifactId?: string;
  buttonSegmentationArtifactId?: string;
  bgmArtifactId?: string;
  sfxArtifactId?: string;
  audioManifestArtifactId?: string;
  gameConfigArtifactId?: string;
  gameBundleArtifactId?: string;
  outcomeWinVideoArtifactId?: string;
  outcomeLoseVideoArtifactId?: string;
  campaignManifestArtifactId?: string;
  [customRef: string]: string | undefined;
}

export type ArtifactMap = Record<string, ArtifactData>;

export interface CampaignContext {
  campaignId: string;
  runId: string;
  workflowName: string;
  trigger: TriggerInfo;
  refs: ArtifactReferences;
  artifacts: ArtifactMap;
  computed?: ComputedData;
}

// ============================================================================
// Service Input Types
// ============================================================================

export interface CreateContextParams {
  campaignId: string;
  runId: string;
  workflowName: string;
  trigger: TriggerInfo;
}

export interface StepArtifact {
  type: string;
  uri: string;
  hash: string;
  metadata?: Record<string, unknown>;
}

export interface AttachStepResultParams {
  stepId: string;
  artifacts: StepArtifact[];
}

export interface StoreInputHashParams {
  stepId: string;
  inputHash: string;
}

export interface StoreQualityCheckParams {
  artifactId: string;
  checkType: string;
  status: QualityStatus;
  message?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Service Result Types
// ============================================================================

export interface ContextResult<T> {
  ok: true;
  data: T;
}

export interface ContextError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ContextOperationResult<T> = ContextResult<T> | ContextError;

// ============================================================================
// Service Contracts
// ============================================================================

/**
 * CampaignContextService
 *
 * Main service for creating, updating, and persisting campaign context.
 * Used by workflow orchestrator to manage context throughout execution.
 */
export interface ICampaignContextService {
  /**
   * Create a new empty context for a workflow run.
   *
   * @param params - Context initialization parameters
   * @returns New CampaignContext with empty refs and artifacts
   *
   * @example
   * const context = contextService.create({
   *   campaignId: 'camp_123',
   *   runId: 'run_456',
   *   workflowName: 'create_campaign',
   *   trigger: { type: 'api', timestamp: new Date().toISOString() }
   * });
   */
  create(params: CreateContextParams): CampaignContext;

  /**
   * Load context from a previous run for update workflows.
   * Populates artifacts map and refs from the base run's completed steps.
   *
   * @param baseRunId - ID of the previous run to load from
   * @param tenantId - Tenant ID for authorization
   * @returns Result containing populated context or error
   *
   * @error BASE_RUN_NOT_FOUND - When baseRunId doesn't exist
   * @error UNAUTHORIZED - When run belongs to different tenant
   * @error INCOMPLETE_BASE_RUN - When base run is not in completed state
   *
   * @example
   * const result = await contextService.loadFromRun('run_previous', 'tenant_123');
   * if (result.ok) {
   *   // result.data contains context with pre-populated artifacts
   * }
   */
  loadFromRun(
    baseRunId: string,
    tenantId: string
  ): Promise<ContextOperationResult<CampaignContext>>;

  /**
   * Attach step result artifacts and update logical references.
   * Automatically maps artifact.type to the corresponding ref.
   *
   * @param context - Current context to update
   * @param params - Step ID and artifacts to attach
   * @returns Updated context with new artifacts and refs
   *
   * @error DUPLICATE_ARTIFACT_ID - When artifact ID collision detected
   * @error INVALID_ARTIFACT_TYPE - When artifact type not in registry
   * @error CONTEXT_CAPACITY_EXCEEDED - When 50 artifact limit reached
   *
   * @example
   * const updatedContext = contextService.attachStepResult(context, {
   *   stepId: 'generate_plan',
   *   artifacts: [{
   *     type: 'plan',
   *     uri: 's3://bucket/plan.json',
   *     hash: 'abc123...'
   *   }]
   * });
   * // updatedContext.refs.planArtifactId is now set
   */
  attachStepResult(
    context: CampaignContext,
    params: AttachStepResultParams
  ): ContextOperationResult<CampaignContext>;

  /**
   * Store input hash for a step in computed area.
   * Used for cache key computation.
   *
   * @param context - Current context to update
   * @param params - Step ID and computed input hash
   * @returns Updated context
   */
  storeInputHash(
    context: CampaignContext,
    params: StoreInputHashParams
  ): CampaignContext;

  /**
   * Store quality check result in computed area.
   *
   * @param context - Current context to update
   * @param params - Quality check parameters
   * @returns Updated context
   */
  storeQualityCheck(
    context: CampaignContext,
    params: StoreQualityCheckParams
  ): CampaignContext;

  /**
   * Persist context to database via Run entity update.
   * Called automatically after each step by workflow engine.
   *
   * @param context - Context to persist
   *
   * @example
   * await contextService.persist(context);
   */
  persist(context: CampaignContext): Promise<void>;
}

/**
 * ContextResolverService
 *
 * Service for resolving artifact references from context.
 * Used by input selectors to retrieve artifacts for step execution.
 */
export interface IContextResolverService {
  /**
   * Get artifact by logical reference name (e.g., "plan", "game_bundle").
   *
   * @param context - Context to resolve from
   * @param refName - Logical reference name (without _artifact_id suffix)
   * @returns ArtifactData if found, undefined if ref not set
   *
   * @example
   * const plan = resolver.getRef(context, 'plan');
   * if (plan) {
   *   // plan.uri contains location
   * }
   */
  getRef(context: CampaignContext, refName: string): ArtifactData | undefined;

  /**
   * Get artifact by direct artifact ID.
   *
   * @param context - Context to resolve from
   * @param artifactId - UUID of the artifact
   * @returns ArtifactData if found, undefined otherwise
   */
  getArtifact(
    context: CampaignContext,
    artifactId: string
  ): ArtifactData | undefined;

  /**
   * List all populated reference names.
   *
   * @param context - Context to inspect
   * @returns Array of reference names that have values
   *
   * @example
   * const refs = resolver.listRefs(context);
   * // ['plan', 'intro_image'] - only populated refs
   */
  listRefs(context: CampaignContext): string[];

  /**
   * Check if a reference is populated.
   *
   * @param context - Context to check
   * @param refName - Logical reference name
   * @returns true if ref exists and has artifact ID
   */
  hasRef(context: CampaignContext, refName: string): boolean;

  /**
   * Get all artifacts of a specific type.
   *
   * @param context - Context to search
   * @param type - Artifact type to filter by
   * @returns Array of matching artifacts
   */
  getArtifactsByType(context: CampaignContext, type: string): ArtifactData[];
}

/**
 * ReferenceTypeRegistryService
 *
 * Service for validating artifact reference types.
 * Loads standard types from enum and custom types from config.
 */
export interface IReferenceTypeRegistryService {
  /**
   * Check if artifact type is valid (standard or registered custom).
   *
   * @param type - Artifact type string
   * @returns true if type is registered
   */
  isValidType(type: string): boolean;

  /**
   * Get reference field name for artifact type.
   * Maps type (e.g., "plan") to ref name (e.g., "planArtifactId").
   *
   * @param artifactType - Artifact type
   * @returns Camel-case reference field name
   */
  getRefName(artifactType: string): string;

  /**
   * List all registered artifact types (standard + custom).
   *
   * @returns Array of type names
   */
  listTypes(): string[];

  /**
   * Get standard types only.
   *
   * @returns Array of standard type names
   */
  listStandardTypes(): string[];

  /**
   * Get custom types only.
   *
   * @returns Array of custom type names
   */
  listCustomTypes(): string[];
}

// ============================================================================
// Error Codes
// ============================================================================

export const ContextErrorCodes = {
  BASE_RUN_NOT_FOUND: 'BASE_RUN_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INCOMPLETE_BASE_RUN: 'INCOMPLETE_BASE_RUN',
  DUPLICATE_ARTIFACT_ID: 'DUPLICATE_ARTIFACT_ID',
  INVALID_ARTIFACT_TYPE: 'INVALID_ARTIFACT_TYPE',
  CONTEXT_CAPACITY_EXCEEDED: 'CONTEXT_CAPACITY_EXCEEDED',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
} as const;

export type ContextErrorCode =
  (typeof ContextErrorCodes)[keyof typeof ContextErrorCodes];

// ============================================================================
// Standard Artifact Types
// ============================================================================

export const StandardArtifactTypes = {
  PLAN: 'plan',
  INTRO_IMAGE: 'intro_image',
  INTRO_VIDEO: 'intro_video',
  BUTTON_SEGMENTATION: 'button_segmentation',
  BGM: 'bgm',
  SFX: 'sfx',
  AUDIO_MANIFEST: 'audio_manifest',
  GAME_CONFIG: 'game_config',
  GAME_BUNDLE: 'game_bundle',
  OUTCOME_WIN_VIDEO: 'outcome_win_video',
  OUTCOME_LOSE_VIDEO: 'outcome_lose_video',
  CAMPAIGN_MANIFEST: 'campaign_manifest',
} as const;

export type StandardArtifactType =
  (typeof StandardArtifactTypes)[keyof typeof StandardArtifactTypes];
