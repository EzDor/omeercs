import { Injectable } from '@nestjs/common';
import { ReferenceTypeRegistryService } from './reference-type-registry.service';
import type { CampaignContext } from '@agentic-template/dto/src/campaign-context/campaign-context.interface';
import type { ArtifactData } from '@agentic-template/dto/src/campaign-context/artifact-data.interface';

@Injectable()
export class ContextResolverService {
  constructor(private readonly referenceTypeRegistry: ReferenceTypeRegistryService) {}

  getRef(context: CampaignContext, refName: string): ArtifactData | undefined {
    const refKey = this.referenceTypeRegistry.getRefName(refName);
    const artifactId = context.refs[refKey];
    if (!artifactId) {
      return undefined;
    }
    return context.artifacts[artifactId];
  }

  getArtifact(context: CampaignContext, artifactId: string): ArtifactData | undefined {
    return context.artifacts[artifactId];
  }

  hasRef(context: CampaignContext, refName: string): boolean {
    const refKey = this.referenceTypeRegistry.getRefName(refName);
    const artifactId = context.refs[refKey];
    return artifactId !== undefined && artifactId !== null && artifactId !== '';
  }

  listRefs(context: CampaignContext): string[] {
    const populatedRefs: string[] = [];
    for (const [refKey, artifactId] of Object.entries(context.refs)) {
      if (artifactId !== undefined && artifactId !== null && artifactId !== '') {
        const refName = this.extractRefNameFromKey(refKey);
        populatedRefs.push(refName);
      }
    }
    return populatedRefs;
  }

  getArtifactsByType(context: CampaignContext, type: string): ArtifactData[] {
    return Object.values(context.artifacts).filter((artifact) => artifact.type === type);
  }

  private extractRefNameFromKey(refKey: string): string {
    const suffix = 'ArtifactId';
    if (!refKey.endsWith(suffix)) {
      return refKey;
    }
    const withoutSuffix = refKey.slice(0, -suffix.length);
    return this.camelCaseToSnakeCase(withoutSuffix);
  }

  private camelCaseToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
