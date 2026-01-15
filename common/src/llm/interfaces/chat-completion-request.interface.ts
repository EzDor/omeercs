export interface ChatCompletionContentPart {
  type: string;
  text?: string;
  file?: {
    file_id: string;
    filename: string;
    format: string;
  };
}

export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatCompletionContentPart[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}
