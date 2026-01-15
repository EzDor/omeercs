import { Controller, Get, Post, Delete, Body, Param, Query, Request, HttpCode, HttpStatus, Logger, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { LlmConstants } from '@agentic-template/common/src/constants/llm.constants';
import { ChatService } from './chat.service';
import { SendMessageDto } from '@agentic-template/dto/src/chat/send-message.dto';
import { ListSessionsQueryDto } from '@agentic-template/dto/src/chat/list-sessions-query.dto';
import { ChatSessionResponseDto } from '@agentic-template/dto/src/chat/chat-session-response.dto';
import { ChatMessageResponseDto } from '@agentic-template/dto/src/chat/chat-message-response.dto';
import type { AuthRequestDto } from '@agentic-template/dto/src/auth/auth-request.dto';

interface MessageEvent {
  data: string;
}

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(@Request() req: AuthRequestDto): Promise<ChatSessionResponseDto> {
    const userId = req.auth!.userId;

    this.logger.debug(`POST /chat/sessions - user_id: ${userId}`);
    const session = await this.chatService.createSession(userId);

    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastMessageAt: session.lastMessageAt,
    };
  }

  @Get('sessions')
  async listSessions(@Query() query: ListSessionsQueryDto, @Request() req: AuthRequestDto): Promise<ChatSessionResponseDto[]> {
    const userId = req.auth!.userId;

    this.logger.debug(`GET /chat/sessions - user_id: ${userId}, limit: ${query.limit}, offset: ${query.offset}`);
    const sessions = await this.chatService.listSessions(userId, query);

    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastMessageAt: session.lastMessageAt,
    }));
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string, @Request() req: AuthRequestDto): Promise<ChatSessionResponseDto> {
    const userId = req.auth!.userId;

    const session = await this.chatService.getSession(id, userId);

    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastMessageAt: session.lastMessageAt,
    };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') id: string, @Request() req: AuthRequestDto): Promise<void> {
    const userId = req.auth!.userId;

    this.logger.debug(`DELETE /chat/sessions/${id} - user_id: ${userId}`);
    await this.chatService.deleteSession(id, userId);
  }

  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto, @Request() req: AuthRequestDto): Promise<ChatMessageResponseDto> {
    const userId = req.auth!.userId;

    this.logger.debug(`POST /chat/sessions/${id}/messages - user_id: ${userId}, content_length: ${dto.content.length}`);
    const userMessage = await this.chatService.sendMessage(id, dto.content, userId);

    return {
      id: userMessage.id,
      sessionId: userMessage.sessionId,
      role: userMessage.role,
      content: userMessage.content,
      createdAt: userMessage.createdAt,
    };
  }

  @Get('sessions/:id/messages')
  async getMessages(@Param('id') id: string, @Request() req: AuthRequestDto): Promise<ChatMessageResponseDto[]> {
    const userId = req.auth!.userId;

    const messages = await this.chatService.getSessionMessages(id, userId);

    return messages.map((msg) => ({
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }

  @Sse('sessions/:id/stream')
  streamResponse(@Param('id') id: string, @Query('message') message: string, @Request() req: AuthRequestDto): Observable<MessageEvent> {
    const userId = req.auth!.userId;

    this.logger.log(`Starting SSE stream for session ${id}`);

    return this.chatService.streamResponse(id, message, userId);
  }

  @Public()
  @Get('health')
  async healthCheck(): Promise<{
    status: string;
    llm: { status: string; model: string };
    database: string;
  }> {
    const model = this.configService.get<string>('CHAT_LLM_MODEL', LlmConstants.DEFAULT_CHAT_MODEL);

    try {
      const litellmBaseUrl = this.configService.get<string>('LITELLM_BASE_URL', 'http://litellm-proxy:4000');
      const response = await fetch(`${litellmBaseUrl}/health/liveliness`);

      const llmStatus = response.ok ? 'connected' : 'disconnected';

      return {
        status: 'ok',
        llm: {
          status: llmStatus,
          model,
        },
        database: 'healthy',
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        status: 'ok',
        llm: {
          status: 'disconnected',
          model,
        },
        database: 'healthy',
      };
    }
  }
}
