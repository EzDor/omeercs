import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PromptTemplateService } from '@agentic-template/common/src/llm/services/prompt-template.service';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [ChatService, PromptTemplateService],
  exports: [ChatService],
})
export class ChatModule {}
