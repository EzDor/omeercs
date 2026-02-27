import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenCodeService } from './opencode.service';
import { CodeSafetyService } from './code-safety.service';

@Module({
  imports: [ConfigModule],
  providers: [OpenCodeService, CodeSafetyService],
  exports: [OpenCodeService, CodeSafetyService],
})
export class OpenCodeModule {}
