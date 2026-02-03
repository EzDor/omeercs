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
