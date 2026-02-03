export interface ArtifactData {
  type: string;
  uri: string;
  hash: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  stepId: string;
}
