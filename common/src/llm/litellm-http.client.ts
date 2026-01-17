import { Injectable, Logger } from '@nestjs/common';
import { ChatCompletionRequest } from './interfaces/chat-completion-request.interface';
import { ChatCompletionResponse } from './interfaces/chat-completion-response.interface';
import { ImageGenerationRequest, ImageGenerationResponse } from './interfaces/image-generation-request.interface';
import {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationStatusRequest,
  VideoGenerationStatusResponse,
} from './interfaces/video-generation-request.interface';
import {
  AudioGenerationRequest,
  AudioGenerationResponse,
  AudioGenerationStatusRequest,
  AudioGenerationStatusResponse,
} from './interfaces/audio-generation-request.interface';
import {
  Model3DGenerationRequest,
  Model3DGenerationResponse,
  Model3DGenerationStatusRequest,
  Model3DGenerationStatusResponse,
  Model3DOptimizationRequest,
  Model3DOptimizationResponse,
  Model3DOptimizationStatusRequest,
  Model3DOptimizationStatusResponse,
} from './interfaces/model3d-generation-request.interface';

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

  /**
   * Generate video from image or text prompt
   * Note: Video generation may be async depending on provider
   */
  async videoGeneration(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/video/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM video generation API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM video generation API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as VideoGenerationResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM video generation API', error);
      throw error;
    }
  }

  /**
   * Check status of an async video generation
   */
  async getVideoGenerationStatus(request: VideoGenerationStatusRequest): Promise<VideoGenerationStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/video/generations/${request.generation_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM video status API error: ${response.status} ${response.statusText}`);
        throw new Error(`LiteLLM video status API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as VideoGenerationStatusResponse;
    } catch (error) {
      this.logger.error('Error checking video generation status', error);
      throw error;
    }
  }

  /**
   * Poll for video generation completion with timeout
   */
  async waitForVideoGeneration(generationId: string, timeoutMs: number = 300000, pollIntervalMs: number = 5000): Promise<VideoGenerationStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getVideoGenerationStatus({ generation_id: generationId });

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      this.logger.debug(`Video generation ${generationId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Video generation timeout after ${timeoutMs}ms for generation ${generationId}`);
  }

  /**
   * Generate audio from text prompt (music or SFX)
   * Note: Audio generation may be async depending on provider
   */
  async audioGeneration(request: AudioGenerationRequest): Promise<AudioGenerationResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/audio/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM audio generation API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM audio generation API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as AudioGenerationResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM audio generation API', error);
      throw error;
    }
  }

  /**
   * Check status of an async audio generation
   */
  async getAudioGenerationStatus(request: AudioGenerationStatusRequest): Promise<AudioGenerationStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/audio/generations/${request.generation_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM audio status API error: ${response.status} ${response.statusText}`);
        throw new Error(`LiteLLM audio status API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as AudioGenerationStatusResponse;
    } catch (error) {
      this.logger.error('Error checking audio generation status', error);
      throw error;
    }
  }

  /**
   * Poll for audio generation completion with timeout
   */
  async waitForAudioGeneration(generationId: string, timeoutMs: number = 300000, pollIntervalMs: number = 5000): Promise<AudioGenerationStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getAudioGenerationStatus({ generation_id: generationId });

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      this.logger.debug(`Audio generation ${generationId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Audio generation timeout after ${timeoutMs}ms for generation ${generationId}`);
  }

  /**
   * Generate 3D model from text prompt
   * Note: 3D generation may be async depending on provider
   */
  async model3DGeneration(request: Model3DGenerationRequest): Promise<Model3DGenerationResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/3d/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM 3D generation API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM 3D generation API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as Model3DGenerationResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM 3D generation API', error);
      throw error;
    }
  }

  /**
   * Check status of an async 3D generation
   */
  async getModel3DGenerationStatus(request: Model3DGenerationStatusRequest): Promise<Model3DGenerationStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/3d/generations/${request.generation_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM 3D status API error: ${response.status} ${response.statusText}`);
        throw new Error(`LiteLLM 3D status API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as Model3DGenerationStatusResponse;
    } catch (error) {
      this.logger.error('Error checking 3D generation status', error);
      throw error;
    }
  }

  /**
   * Poll for 3D generation completion with timeout
   */
  async waitForModel3DGeneration(generationId: string, timeoutMs: number = 600000, pollIntervalMs: number = 10000): Promise<Model3DGenerationStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getModel3DGenerationStatus({ generation_id: generationId });

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      this.logger.debug(`3D generation ${generationId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`3D generation timeout after ${timeoutMs}ms for generation ${generationId}`);
  }

  /**
   * Optimize existing 3D model
   * Note: Optimization may be async depending on provider
   */
  async model3DOptimization(request: Model3DOptimizationRequest): Promise<Model3DOptimizationResponse> {
    try {
      const normalizedRequest = {
        ...request,
        model: this.normalizeModelName(request.model),
      };

      const response = await fetch(`${this.baseUrl}/3d/optimizations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM 3D optimization API error: ${response.status} ${response.statusText}`);
        this.logger.error(`Response body: ${errorText}`);
        throw new Error(`LiteLLM 3D optimization API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as Model3DOptimizationResponse;
    } catch (error) {
      this.logger.error('Error calling LiteLLM 3D optimization API', error);
      throw error;
    }
  }

  /**
   * Check status of an async 3D optimization
   */
  async getModel3DOptimizationStatus(request: Model3DOptimizationStatusRequest): Promise<Model3DOptimizationStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/3d/optimizations/${request.optimization_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LiteLLM 3D optimization status API error: ${response.status} ${response.statusText}`);
        throw new Error(`LiteLLM 3D optimization status API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result as Model3DOptimizationStatusResponse;
    } catch (error) {
      this.logger.error('Error checking 3D optimization status', error);
      throw error;
    }
  }

  /**
   * Poll for 3D optimization completion with timeout
   */
  async waitForModel3DOptimization(optimizationId: string, timeoutMs: number = 600000, pollIntervalMs: number = 10000): Promise<Model3DOptimizationStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getModel3DOptimizationStatus({ optimization_id: optimizationId });

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      this.logger.debug(`3D optimization ${optimizationId} status: ${status.status}, progress: ${status.progress ?? 'unknown'}%`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`3D optimization timeout after ${timeoutMs}ms for optimization ${optimizationId}`);
  }
}
