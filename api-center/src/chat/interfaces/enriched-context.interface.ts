export interface EnrichedContext {
  systemPrompt: string;
  contextData: {
    scrapedContent?: string;
  };
}
