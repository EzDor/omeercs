import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { StorageService } from './storage.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Artifact])],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
