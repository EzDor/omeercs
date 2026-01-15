import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantTransactionClsProvider } from '@agentic-template/common/src/tenant/tenant-transaction-cls.provider';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { Observable, from, concatMap, tap, map, catchError, of } from 'rxjs';
import { ChatSession } from '@agentic-template/dao/src/entities/chat-session.entity';
import { ChatMessage, ChatMessageRole } from '@agentic-template/dao/src/entities/chat-message.entity';
import { ListSessionsQueryDto } from '@agentic-template/dto/src/chat/list-sessions-query.dto';
import { LlmClientService } from '../core/llm/llm-client.service';
import type { LlmMessage } from '../core/llm/interfaces/llm-message.interface';

interface MessageEvent {
  data: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly txProvider: TenantTransactionClsProvider,
    private readonly tenantCls: TenantClsService,
    private readonly llmClientService: LlmClientService,
  ) {}

  async createSession(userId: string): Promise<ChatSession> {
    try {
      const tenantId = this.tenantCls.getTenantId();
      if (!tenantId) {
        throw new Error('Tenant context not available');
      }

      const em = await this.txProvider.getManager();
      const session = em.getRepository(ChatSession).create({
        userId,
        tenantId,
      });

      const saved = await em.getRepository(ChatSession).save(session);
      this.logger.debug(`Created chat session - session_id: ${saved.id}, tenant_id: ${tenantId?.substring(0, 8)}...`);
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create session - user_id: ${userId}, error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  async listSessions(userId: string, query: ListSessionsQueryDto): Promise<ChatSession[]> {
    const em = await this.txProvider.getManager();
    const sessions = await em.getRepository(ChatSession).find({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return sessions;
  }

  async getSession(sessionId: string, userId: string): Promise<ChatSession> {
    const em = await this.txProvider.getManager();
    const session = await em.getRepository(ChatSession).findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Access denied: session does not belong to user');
    }

    return session;
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    try {
      await this.getSession(sessionId, userId);
      const em = await this.txProvider.getManager();
      await em.getRepository(ChatSession).delete({ id: sessionId });
      this.logger.log(`Session deleted - session_id: ${sessionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete session - session_id: ${sessionId}, error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  async getSessionMessages(sessionId: string, userId: string): Promise<ChatMessage[]> {
    await this.getSession(sessionId, userId);

    const em = await this.txProvider.getManager();
    const messages = await em.getRepository(ChatMessage).find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    return messages;
  }

  async sendMessage(sessionId: string, content: string, userId: string): Promise<ChatMessage> {
    try {
      await this.getSession(sessionId, userId);

      const em = await this.txProvider.getManager();
      const userMessage = em.getRepository(ChatMessage).create({
        sessionId,
        role: ChatMessageRole.USER,
        content,
      });

      const saved = await em.getRepository(ChatMessage).save(userMessage);
      this.logger.log(`Message sent - session_id: ${sessionId}, message_length: ${content.length}`);
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to send message - session_id: ${sessionId}, error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  streamResponse(sessionId: string, userMessage: string, userId: string): Observable<MessageEvent> {
    return from(this.prepareStreamResponse(sessionId, userMessage, userId)).pipe(
      concatMap((observable) => {
        let accumulatedContent = '';

        return observable.pipe(
          tap((event) => {
            if (event.data && event.data !== '[DONE]') {
              accumulatedContent += event.data;
            }
          }),
          concatMap((event) => {
            if (event.data === '[DONE]' && accumulatedContent.length > 0) {
              return from(this.saveAssistantMessage(sessionId, accumulatedContent)).pipe(
                tap(() => this.logger.debug(`Saved assistant message to session ${sessionId}`)),
                map(() => event),
                catchError((error: Error) => {
                  this.logger.error(`Failed to save assistant message: ${error.message}`, error.stack);
                  return of(event);
                }),
              );
            }
            return of(event);
          }),
        );
      }),
    );
  }

  private async prepareStreamResponse(sessionId: string, userMessage: string, userId: string): Promise<Observable<MessageEvent>> {
    await this.getSession(sessionId, userId);

    const em = await this.txProvider.getManager();
    const historyMessages = await em.getRepository(ChatMessage).find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    const systemPrompt = 'You are a helpful AI assistant. Provide clear and concise responses.';

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: userMessage },
    ];

    return this.llmClientService.streamCompletion(messages);
  }

  async saveAssistantMessage(sessionId: string, content: string): Promise<ChatMessage> {
    try {
      const tenantId = this.tenantCls.getTenantId();
      this.logger.debug(`Saving assistant message - session_id: ${sessionId}, tenant_id: ${tenantId?.substring(0, 8)}..., content_length: ${content.length}`);

      if (!tenantId) {
        this.logger.error(`Tenant context missing when saving assistant message - session_id: ${sessionId}`);
        throw new Error('Tenant context not available');
      }

      const em = await this.txProvider.getManager();
      const assistantMessage = em.getRepository(ChatMessage).create({
        sessionId,
        role: ChatMessageRole.ASSISTANT,
        content,
      });

      const saved = await em.getRepository(ChatMessage).save(assistantMessage);

      await this.updateSessionTitle(sessionId);

      this.logger.debug(`Assistant message saved successfully - session_id: ${sessionId}, message_id: ${saved.id}`);
      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to save assistant message - session_id: ${sessionId}, error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  private async updateSessionTitle(sessionId: string): Promise<void> {
    const em = await this.txProvider.getManager();
    const session = await em.getRepository(ChatSession).findOne({ where: { id: sessionId } });

    if (!session || session.title) {
      return;
    }

    const messages = await em.getRepository(ChatMessage).find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 1,
    });

    if (messages.length > 0) {
      const firstMessage = messages[0];
      const title = firstMessage.content.length > 50 ? firstMessage.content.substring(0, 50) + '...' : firstMessage.content;

      await em.getRepository(ChatSession).update(sessionId, { title });
      this.logger.log(`Updated session title - session_id: ${sessionId}`);
    }
  }
}
