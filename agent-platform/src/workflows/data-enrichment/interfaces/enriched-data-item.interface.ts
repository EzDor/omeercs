import { DataItem } from './data-item.interface';

export interface DataEnrichment {
  summary: string;
  keyTopics: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  suggestedTags: string[];
  qualityScore: number;
}

export interface EnrichedDataItem extends DataItem {
  enrichment: DataEnrichment;
  enrichedAt: Date;
}
