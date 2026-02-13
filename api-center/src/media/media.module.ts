import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '@agentic-template/common/src/storage/storage.module';
import { MediaController } from './media.controller';

@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [MediaController],
})
export class MediaModule {}
