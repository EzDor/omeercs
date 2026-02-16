import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IntelligencePlanService } from './services/intelligence-plan.service';
import { CopyGenerationService } from './services/copy-generation.service';
import { ThemeBriefService } from './services/theme-brief.service';
import { ThemeImageService } from './services/theme-image.service';

@Controller('internal/intelligence')
export class IntelligenceController {
  private readonly logger = new Logger(IntelligenceController.name);

  constructor(
    private readonly planService: IntelligencePlanService,
    private readonly copyService: CopyGenerationService,
    private readonly themeBriefService: ThemeBriefService,
    private readonly themeImageService: ThemeImageService,
  ) {}

  @Post('plan')
  async generatePlan(@Body() body: { brief: string; constraints?: Record<string, unknown> }) {
    this.logger.log('POST /internal/intelligence/plan');
    return this.planService.generatePlan(body.brief, body.constraints);
  }

  @Post('copy')
  async generateCopy(
    @Body()
    body: {
      campaign_context: Record<string, unknown>;
      copy_types: string[];
      tone: string;
      variations_count?: number;
      constraints?: Record<string, unknown>;
    },
  ) {
    this.logger.log('POST /internal/intelligence/copy');
    return this.copyService.generateCopy(body.campaign_context, body.copy_types, body.tone, body.variations_count, body.constraints);
  }

  @Post('theme/from-brief')
  async extractThemeFromBrief(@Body() body: { brief: string }) {
    this.logger.log('POST /internal/intelligence/theme/from-brief');
    return this.themeBriefService.extractTheme(body.brief);
  }

  @Post('theme/from-image')
  async extractThemeFromImage(@Body() body: { imageBuffer: string; mimeType: string }) {
    this.logger.log('POST /internal/intelligence/theme/from-image');
    const buffer = Buffer.from(body.imageBuffer, 'base64');
    return this.themeImageService.extractTheme(buffer);
  }
}
