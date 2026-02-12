import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsController } from './assets.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AssetsController],
})
export class AssetsModule {}
