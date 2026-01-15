export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface StreamMetadata {
  model: string;
  tokensUsed?: number;
}
