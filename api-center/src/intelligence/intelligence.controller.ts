import { Controller, Post, Get, Body, Param, Query, Request, HttpCode, HttpStatus, Logger, ParseUUIDPipe, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IntelligenceApiService } from './intelligence-api.service';
import { GeneratePlanRequest, AcceptPlanRequest } from '@agentic-template/dto/src/intelligence/plan-generation.dto';
import { GenerateCopyRequest } from '@agentic-template/dto/src/intelligence/copy-generation.dto';
import { ExtractThemeFromBriefRequest, ValidateThemeRequest } from '@agentic-template/dto/src/intelligence/theme-extraction.dto';
import { ThemePresetsQuery, GenerationHistoryQuery } from '@agentic-template/dto/src/intelligence/theme-presets.dto';
import type { AuthRequestDto } from '@agentic-template/dto/src/auth/auth-request.dto';

@Controller('intelligence')
export class IntelligenceController {
  private readonly logger = new Logger(IntelligenceController.name);

  constructor(private readonly intelligenceService: IntelligenceApiService) {}

  @Post('plan')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generatePlan(@Body() dto: GeneratePlanRequest, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/plan - tenant: ${tenantId}`);
    return this.intelligenceService.generatePlan(tenantId, userId, dto);
  }

  @Post('plan/:generationId/accept')
  @HttpCode(HttpStatus.CREATED)
  async acceptPlan(@Param('generationId', ParseUUIDPipe) generationId: string, @Body() dto: AcceptPlanRequest, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/plan/${generationId}/accept - tenant: ${tenantId}`);
    return this.intelligenceService.acceptPlan(tenantId, userId, generationId, dto);
  }

  @Post('plan/:generationId/regenerate')
  async regeneratePlan(@Param('generationId', ParseUUIDPipe) generationId: string, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/plan/${generationId}/regenerate - tenant: ${tenantId}`);
    return this.intelligenceService.regeneratePlan(tenantId, userId, generationId);
  }

  @Post('copy')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generateCopy(@Body() dto: GenerateCopyRequest, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/copy - tenant: ${tenantId}`);
    return this.intelligenceService.generateCopy(tenantId, userId, dto);
  }

  @Get('copy/defaults/:templateType')
  getCopyDefaults(@Param('templateType') templateType: string) {
    this.logger.debug(`GET /intelligence/copy/defaults/${templateType}`);
    return this.intelligenceService.getCopyDefaults(templateType);
  }

  @Post('theme/from-brief')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async extractThemeFromBrief(@Body() dto: ExtractThemeFromBriefRequest, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/theme/from-brief - tenant: ${tenantId}`);
    return this.intelligenceService.extractThemeFromBrief(tenantId, userId, dto);
  }

  @Post('theme/from-image')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  async extractThemeFromImage(@UploadedFile() file: Express.Multer.File, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /intelligence/theme/from-image - tenant: ${tenantId}`);
    return this.intelligenceService.extractThemeFromImage(tenantId, userId, file);
  }

  @Post('theme/validate')
  validateTheme(@Body() dto: ValidateThemeRequest) {
    return this.intelligenceService.validateTheme(dto);
  }

  @Get('theme/presets')
  getThemePresets(@Query() query: ThemePresetsQuery) {
    return this.intelligenceService.getThemePresets(query.industry, query.mood);
  }

  @Get('history')
  async getHistory(@Query() query: GenerationHistoryQuery, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    return this.intelligenceService.getHistory(tenantId, query);
  }

  @Get('history/:generationId')
  async getGenerationById(@Param('generationId', ParseUUIDPipe) generationId: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    return this.intelligenceService.getGenerationById(tenantId, generationId);
  }
}
