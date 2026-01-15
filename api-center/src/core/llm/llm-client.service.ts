import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import type { LlmMessage } from './interfaces/llm-message.interface';
import { LlmConstants } from '@agentic-template/common/src/constants/llm.constants';

interface MessageEvent {
  data: string;
}

@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  constructor(private readonly configService: ConfigService) {}

  streamCompletion(messages: LlmMessage[], model?: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const startTime = Date.now();
      const litellmBaseUrl = this.configService.get<string>('LITELLM_BASE_URL', 'http://litellm-proxy:4000');
      const litellmMasterKey = this.configService.get<string>('LITELLM_MASTER_KEY');
      const defaultModel = this.configService.get<string>('CHAT_LLM_MODEL', LlmConstants.DEFAULT_CHAT_MODEL);

      const url = `${litellmBaseUrl}/v1/chat/completions`;
      const rawModel = model || defaultModel;
      const selectedModel = this.extractModelName(rawModel);

      const estimatedTokens = messages.reduce((acc, msg) => acc + (msg.content?.length || 0) / 4, 0);
      this.logger.log(`Starting LLM request - model: ${selectedModel}, estimated_tokens: ${Math.round(estimatedTokens)}, message_count: ${messages.length}`);

      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${litellmMasterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          stream: true,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new HttpException(`LiteLLM API error: ${response.statusText}`, response.status);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          const readStream = async () => {
            if (!reader) {
              subscriber.error(new Error('Response body is null'));
              return;
            }

            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  const latencyMs = Date.now() - startTime;
                  this.logger.log(`LLM stream completed - latency: ${latencyMs}ms, model: ${selectedModel}`);
                  subscriber.next({ data: '[DONE]' });
                  subscriber.complete();
                  break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter((line) => line.trim() !== '');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                      subscriber.next({ data: '[DONE]' });
                      subscriber.complete();
                      return;
                    }

                    try {
                      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
                      const content = parsed.choices?.[0]?.delta?.content;
                      if (content) {
                        subscriber.next({ data: content });
                      }
                    } catch (parseError) {
                      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
                      const errorStack = parseError instanceof Error ? parseError.stack : undefined;
                      this.logger.warn(`Failed to parse SSE data: ${errorMessage}`, errorStack);
                    }
                  }
                }
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const errorStack = error instanceof Error ? error.stack : undefined;
              this.logger.error(`Stream reading error: ${errorMessage}`, errorStack);
              subscriber.error(new HttpException('Stream reading failed', HttpStatus.INTERNAL_SERVER_ERROR));
            }
          };

          void readStream();
        })
        .catch((error: Error) => {
          this.logger.error(`LiteLLM fetch error: ${error.message}`, error.stack);
          subscriber.error(new HttpException('Failed to connect to LLM service', HttpStatus.SERVICE_UNAVAILABLE));
        });
    });
  }

  private extractModelName(model: string): string {
    if (model.includes('/')) {
      return model.split('/').slice(1).join('/');
    }
    return model;
  }
}
