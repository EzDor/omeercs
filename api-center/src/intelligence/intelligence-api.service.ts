import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AiGeneration } from '@agentic-template/dao/src/entities/ai-generation.entity';
import { CampaignApiService } from '../campaign/campaign-api.service';
import { contrastRatio, meetsAA, suggestAccessibleColor } from '@agentic-template/common/src/intelligence/wcag-contrast.util';
import { checkAllCopies } from '@agentic-template/common/src/intelligence/copy-compliance.util';
import { getThemePresets } from '@agentic-template/common/src/intelligence/theme-presets';
import { getTemplateCopyDefaults } from '@agentic-template/common/src/intelligence/template-copy-defaults';
import { COPY_CHARACTER_LIMITS } from '@agentic-template/common/src/intelligence/copy-character-limits';
import type { GeneratePlanRequest, AcceptPlanRequest, GeneratePlanResponse, AcceptPlanResponse } from '@agentic-template/dto/src/intelligence/plan-generation.dto';
import type { GenerateCopyRequest, GenerateCopyResponse } from '@agentic-template/dto/src/intelligence/copy-generation.dto';
import type { ExtractThemeFromBriefRequest, ExtractThemeResponse, ValidateThemeRequest, ValidateThemeResponse } from '@agentic-template/dto/src/intelligence/theme-extraction.dto';
import type { GenerationHistoryQuery, GenerationHistoryResponse } from '@agentic-template/dto/src/intelligence/theme-presets.dto';
import type { CopyType } from '@agentic-template/dto/src/intelligence/intelligence-enums';

@Injectable()
export class IntelligenceApiService {
  private readonly logger = new Logger(IntelligenceApiService.name);
  private readonly agentPlatformUrl: string;

  constructor(
    @InjectRepository(AiGeneration)
    private readonly generationRepo: Repository<AiGeneration>,
    private readonly campaignService: CampaignApiService,
    private readonly configService: ConfigService,
  ) {
    this.agentPlatformUrl = this.configService.get<string>('AGENT_PLATFORM_URL', 'http://localhost:3002');
  }

  async generatePlan(tenantId: string, userId: string, dto: GeneratePlanRequest): Promise<GeneratePlanResponse> {
    const startTime = Date.now();

    const response = await this.callAgentPlatform<{ plan: Record<string, unknown>; duration_ms: number; model: string; attempts: number }>('/internal/intelligence/plan', {
      brief: dto.brief,
      constraints: dto.constraints,
    });

    const generation = this.generationRepo.create({
      tenantId,
      userId,
      campaignId: dto.campaign_id,
      generationType: 'plan',
      status: 'completed',
      inputParams: { brief: dto.brief, constraints: dto.constraints },
      output: response.plan,
      durationMs: Date.now() - startTime,
      llmModel: response.model,
      attempts: response.attempts,
    });
    const saved = await this.generationRepo.save(generation);

    return {
      generation_id: saved.id,
      plan: response.plan,
      duration_ms: saved.durationMs!,
    } as unknown as GeneratePlanResponse;
  }

  async acceptPlan(tenantId: string, userId: string, generationId: string, dto: AcceptPlanRequest): Promise<AcceptPlanResponse> {
    const generation = await this.findGenerationOrFail(tenantId, generationId);

    if (generation.generationType !== 'plan') {
      throw new BadRequestException('Generation is not a plan type');
    }
    if (generation.accepted) {
      throw new BadRequestException('This generation was already accepted');
    }

    const planOutput = generation.output as Record<string, unknown>;
    const recommendedTemplate = planOutput.recommended_template as { template_id: string };
    const theme = planOutput.theme as { primary_color: string; secondary_color: string; accent_color: string; background_color: string; text_color: string };

    const campaignName = dto.campaign_name || (planOutput.summary as string) || 'AI Generated Campaign';

    const campaign = await this.campaignService.create(tenantId, userId, {
      name: campaignName,
      templateId: recommendedTemplate.template_id,
      config: {
        theme: {
          primaryColor: theme.primary_color,
          secondaryColor: theme.secondary_color,
          accentColor: theme.accent_color,
          fontFamily: 'Inter',
          background: { type: 'solid', value: theme.background_color },
        },
        game: {},
        assets: [],
      },
    });

    generation.accepted = true;
    generation.campaignId = campaign.id;
    await this.generationRepo.save(generation);

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      status: 'draft',
      template_id: campaign.templateId,
      config: campaign.config as unknown as Record<string, unknown>,
    };
  }

  async regeneratePlan(tenantId: string, userId: string, generationId: string): Promise<GeneratePlanResponse> {
    const original = await this.findGenerationOrFail(tenantId, generationId);

    if (original.generationType !== 'plan') {
      throw new BadRequestException('Generation is not a plan type');
    }

    const inputParams = original.inputParams as { brief: string; constraints?: Record<string, unknown> };

    const response = await this.callAgentPlatform<{ plan: Record<string, unknown>; duration_ms: number; model: string; attempts: number }>('/internal/intelligence/plan', {
      brief: inputParams.brief,
      constraints: inputParams.constraints,
      previous_generation_id: generationId,
    });

    const generation = this.generationRepo.create({
      tenantId,
      userId,
      campaignId: original.campaignId,
      generationType: 'plan',
      status: 'completed',
      inputParams: { ...inputParams, previous_generation_id: generationId },
      output: response.plan,
      durationMs: response.duration_ms,
      llmModel: response.model,
      attempts: response.attempts,
    });
    const saved = await this.generationRepo.save(generation);

    return {
      generation_id: saved.id,
      plan: response.plan,
      duration_ms: saved.durationMs!,
    } as unknown as GeneratePlanResponse;
  }

  async generateCopy(tenantId: string, userId: string, dto: GenerateCopyRequest): Promise<GenerateCopyResponse> {
    const startTime = Date.now();

    const response = await this.callAgentPlatform<{
      copies: Array<{ copy_type: string; variations: Array<{ text: string; character_count: number; tone_match_score: number; notes?: string }> }>;
      duration_ms: number;
      model: string;
      attempts: number;
    }>('/internal/intelligence/copy', {
      campaign_context: dto.campaign_context,
      copy_types: dto.copy_types,
      tone: dto.tone,
      variations_count: dto.variations_count || 3,
      constraints: dto.constraints,
    });

    for (const copyResult of response.copies) {
      const limit = COPY_CHARACTER_LIMITS[copyResult.copy_type as CopyType];
      if (limit) {
        for (const variation of copyResult.variations) {
          if (variation.text.length > limit) {
            variation.text = variation.text.substring(0, limit);
            variation.character_count = limit;
          }
        }
      }
    }

    for (const copyResult of response.copies) {
      for (const variation of copyResult.variations) {
        (variation as Record<string, unknown>).tone = dto.tone;
      }
    }

    const complianceResults = checkAllCopies(response.copies);
    const complianceWarnings = complianceResults.flatMap((result) =>
      result.warnings.map((w) => ({
        copy_type: result.copyType,
        variation_index: result.variationIndex,
        term: w.term,
        category: w.category,
        severity: w.severity,
        suggestion: w.suggestion,
      })),
    );

    const generation = this.generationRepo.create({
      tenantId,
      userId,
      campaignId: dto.campaign_id,
      generationType: 'copy',
      status: 'completed',
      inputParams: {
        campaign_context: dto.campaign_context,
        copy_types: dto.copy_types,
        tone: dto.tone,
        variations_count: dto.variations_count || 3,
        constraints: dto.constraints,
      },
      output: { copies: response.copies, compliance_warnings: complianceWarnings },
      durationMs: Date.now() - startTime,
      llmModel: response.model,
      attempts: response.attempts,
    });
    const saved = await this.generationRepo.save(generation);

    return {
      generation_id: saved.id,
      copies: response.copies,
      compliance_warnings: complianceWarnings,
      duration_ms: saved.durationMs!,
    } as GenerateCopyResponse;
  }

  getCopyDefaults(templateType: string) {
    const defaults = getTemplateCopyDefaults(templateType);
    if (!defaults) {
      throw new NotFoundException(`Template type '${templateType}' not found`);
    }
    return { template_type: templateType, defaults };
  }

  async extractThemeFromBrief(tenantId: string, userId: string, dto: ExtractThemeFromBriefRequest): Promise<ExtractThemeResponse> {
    const startTime = Date.now();

    const response = await this.callAgentPlatform<{ theme: Record<string, unknown>; duration_ms: number; model: string; attempts: number }>(
      '/internal/intelligence/theme/from-brief',
      {
        brief: dto.brief,
      },
    );

    const theme = response.theme as {
      primary_color: string;
      secondary_color: string;
      accent_color: string;
      background_color: string;
      text_color: string;
      mood: string;
      confidence: number;
      palette: string[];
    };

    const enrichedTheme = this.enrichThemeWithAccessibility(theme, 'brief');

    const generation = this.generationRepo.create({
      tenantId,
      userId,
      campaignId: dto.campaign_id,
      generationType: 'theme_brief',
      status: 'completed',
      inputParams: { brief: dto.brief },
      output: enrichedTheme as unknown as Record<string, unknown>,
      durationMs: Date.now() - startTime,
      llmModel: response.model,
      attempts: response.attempts,
    });
    const saved = await this.generationRepo.save(generation);

    return {
      generation_id: saved.id,
      theme: enrichedTheme,
      duration_ms: saved.durationMs!,
    } as ExtractThemeResponse;
  }

  async extractThemeFromImage(tenantId: string, userId: string, req: unknown): Promise<ExtractThemeResponse> {
    const startTime = Date.now();

    const request = req as { file?: { buffer: Buffer; originalname: string; size: number; mimetype: string } };
    if (!request.file) {
      throw new BadRequestException('Image file is required');
    }

    const { buffer, originalname, size, mimetype } = request.file;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(mimetype)) {
      throw new BadRequestException('Unsupported image format. Use PNG, JPG, or WEBP');
    }
    if (size > 10 * 1024 * 1024) {
      throw new BadRequestException('Image must be under 10MB');
    }

    const response = await this.callAgentPlatform<{ theme: Record<string, unknown>; duration_ms: number }>('/internal/intelligence/theme/from-image', {
      imageBuffer: buffer.toString('base64'),
      mimeType: mimetype,
    });

    const theme = response.theme as {
      primary_color: string;
      secondary_color: string;
      accent_color: string;
      background_color: string;
      text_color: string;
      mood: string;
      confidence: number;
      palette: string[];
    };

    const enrichedTheme = this.enrichThemeWithAccessibility(theme, 'image');

    const generation = this.generationRepo.create({
      tenantId,
      userId,
      generationType: 'theme_image',
      status: 'completed',
      inputParams: { image_filename: originalname, image_size_bytes: size, image_mime_type: mimetype },
      output: enrichedTheme as unknown as Record<string, unknown>,
      durationMs: Date.now() - startTime,
    });
    const saved = await this.generationRepo.save(generation);

    return {
      generation_id: saved.id,
      theme: enrichedTheme,
      duration_ms: saved.durationMs!,
    } as ExtractThemeResponse;
  }

  validateTheme(dto: ValidateThemeRequest): ValidateThemeResponse {
    const pairs = [
      { pair: 'text-on-background', fg: dto.text_color, bg: dto.background_color, required: 4.5 },
      { pair: 'accent-on-background', fg: dto.accent_color, bg: dto.background_color, required: 3.0 },
      { pair: 'primary-on-background', fg: dto.primary_color, bg: dto.background_color, required: 3.0 },
    ];

    const issues = pairs
      .filter((p) => !meetsAA(p.fg, p.bg, p.required <= 3.0))
      .map((p) => ({
        pair: p.pair,
        ratio: Math.round(contrastRatio(p.fg, p.bg) * 100) / 100,
        required: p.required,
        suggestion: suggestAccessibleColor(p.fg, p.bg, p.required),
      }));

    return { valid: issues.length === 0, issues };
  }

  getThemePresets(industry?: string, mood?: string) {
    return { presets: getThemePresets(industry, mood) };
  }

  async getHistory(tenantId: string, query: GenerationHistoryQuery): Promise<GenerationHistoryResponse> {
    const qb = this.generationRepo.createQueryBuilder('gen').where('gen.tenantId = :tenantId', { tenantId });

    if (query.campaign_id) {
      qb.andWhere('gen.campaignId = :campaignId', { campaignId: query.campaign_id });
    }
    if (query.type) {
      qb.andWhere('gen.generationType = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('gen.status = :status', { status: query.status });
    }

    qb.orderBy('gen.createdAt', 'DESC');

    const limit = query.limit || 20;
    const offset = query.offset || 0;
    qb.take(limit).skip(offset);

    const [generations, total] = await qb.getManyAndCount();

    return {
      generations: generations.map((g) => ({
        id: g.id,
        campaign_id: g.campaignId || null,
        generation_type: g.generationType,
        status: g.status,
        accepted: g.accepted,
        input_params: g.inputParams,
        output: (g.output as Record<string, unknown>) || null,
        error: (g.error as Record<string, unknown>) || null,
        duration_ms: g.durationMs || null,
        llm_model: g.llmModel || null,
        attempts: g.attempts,
        created_at: g.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  async getGenerationById(tenantId: string, generationId: string) {
    const gen = await this.findGenerationOrFail(tenantId, generationId);
    return {
      id: gen.id,
      campaign_id: gen.campaignId || null,
      generation_type: gen.generationType,
      status: gen.status,
      accepted: gen.accepted,
      input_params: gen.inputParams,
      output: (gen.output as Record<string, unknown>) || null,
      error: (gen.error as Record<string, unknown>) || null,
      duration_ms: gen.durationMs || null,
      llm_model: gen.llmModel || null,
      attempts: gen.attempts,
      created_at: gen.createdAt.toISOString(),
    };
  }

  private enrichThemeWithAccessibility(
    theme: {
      primary_color: string;
      secondary_color: string;
      accent_color: string;
      background_color: string;
      text_color: string;
      mood: string;
      confidence: number;
      palette: string[];
    },
    source: 'brief' | 'image',
  ) {
    const textBgRatio = contrastRatio(theme.text_color, theme.background_color);
    const passesAA = meetsAA(theme.text_color, theme.background_color);

    const pairs = [
      { pair: 'text-on-background', fg: theme.text_color, bg: theme.background_color, required: 4.5 },
      { pair: 'accent-on-background', fg: theme.accent_color, bg: theme.background_color, required: 3.0 },
    ];

    const accessibilityWarnings = pairs
      .filter((p) => contrastRatio(p.fg, p.bg) < p.required)
      .map((p) => ({
        pair: p.pair,
        ratio: Math.round(contrastRatio(p.fg, p.bg) * 100) / 100,
        required: p.required,
        suggestion: suggestAccessibleColor(p.fg, p.bg, p.required),
      }));

    return {
      ...theme,
      source,
      contrast_ratio: Math.round(textBgRatio * 100) / 100,
      contrast_passes_aa: passesAA,
      accessibility_warnings: accessibilityWarnings,
    };
  }

  private async findGenerationOrFail(tenantId: string, generationId: string): Promise<AiGeneration> {
    const generation = await this.generationRepo.findOne({ where: { id: generationId, tenantId } });
    if (!generation) {
      throw new NotFoundException(`Generation ${generationId} not found`);
    }
    return generation;
  }

  private async callAgentPlatform<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.agentPlatformUrl}${path}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Agent platform call failed: ${response.status} - ${errorBody}`);
        throw new InternalServerErrorException(`Intelligence service call failed: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`Agent platform call error: ${(error as Error).message}`);
      throw new InternalServerErrorException('Intelligence service unavailable');
    }
  }
}
