import { Injectable, Logger } from '@nestjs/common';
import { ChatCompletionRequest } from './interfaces/chat-completion-request.interface';
import { ChatCompletionResponse } from './interfaces/chat-completion-response.interface';
import { ImageGenerationRequest, ImageGenerationResponse } from './interfaces/image-generation-request.interface';

@Injectable()
export class LiteLLMHttpClient {
  private readonly logger = new Logger(LiteLLMHttpClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private normalizeModelName(model: string): string {
    if (model.includes('/')) {
      const parts = model.split('/');
      const normalizedModel = parts[parts.length - 1];
      this.logger.log(`Normalized model name from "${model}" to "${normalizedModel}" for LiteLLM alias`);
      return normalizedModel;
    }
    return model;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as ChatCompletionResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM chat completion API', error);
      throw error;
    }
  }

  async deleteFile(fileId: string, customLlmProvider?: string): Promise<void> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };

      if (customLlmProvider) {
        headers['custom-llm-provider'] = customLlmProvider;
      }

      const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM file delete error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to delete file ${fileId}: ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting file ${fileId}`, error);
      throw error;
    }
  }

  async fileExists(fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error(`Error checking file existence for ${fileId}`, error);
      return false;
    }
  }

  async imageGeneration(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM image generation API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM image generation API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as ImageGenerationResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM image generation API', error);
      throw error;
    }
  }
}
