export interface ChatCompletionContentPart {
  type: 'text' | 'image_url' | 'file';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
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

export interface ResponseFormat {
  type: 'text' | 'json_object' | 'json_schema';
  json_schema?: {
    name: string;
    description?: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: ResponseFormat;
}
