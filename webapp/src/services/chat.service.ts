import { apiClient } from './api/api-client.service';
import type { ChatSessionResponseDto } from '@agentic-template/dto/src/chat/chat-session-response.dto';
import type { ChatMessageResponseDto } from '@agentic-template/dto/src/chat/chat-message-response.dto';
import type { SendMessageDto } from '@agentic-template/dto/src/chat/send-message.dto';

class ChatService {
  private basePath = '/chat';

  async createSession(): Promise<ChatSessionResponseDto> {
    const response = await apiClient.post<ChatSessionResponseDto>(`${this.basePath}/sessions`);
    return response.data;
  }

  async listSessions(limit = 50, offset = 0): Promise<ChatSessionResponseDto[]> {
    const response = await apiClient.get<ChatSessionResponseDto[]>(`${this.basePath}/sessions`, {
      params: { limit, offset },
    });
    return response.data;
  }

  async getSession(sessionId: string): Promise<ChatSessionResponseDto> {
    const response = await apiClient.get<ChatSessionResponseDto>(`${this.basePath}/sessions/${sessionId}`);
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`${this.basePath}/sessions/${sessionId}`);
  }

  async sendMessage(sessionId: string, content: string): Promise<ChatMessageResponseDto> {
    const data: SendMessageDto = { content };
    const response = await apiClient.post<ChatMessageResponseDto>(`${this.basePath}/sessions/${sessionId}/messages`, data);
    return response.data;
  }

  async getMessages(sessionId: string): Promise<ChatMessageResponseDto[]> {
    const response = await apiClient.get<ChatMessageResponseDto[]>(`${this.basePath}/sessions/${sessionId}/messages`);
    return response.data;
  }

  async connectStream(sessionId: string, message: string): Promise<EventSource> {
    const { authService } = await import('./api/auth.service');
    const token = await authService.getToken();
    const baseUrl = import.meta.env.VITE_API_CENTER_BASE_URL || 'http://localhost:3001';
    const url = `${baseUrl}/chat/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}&token=${token}`;
    return new EventSource(url);
  }
}

export const chatService = new ChatService();
