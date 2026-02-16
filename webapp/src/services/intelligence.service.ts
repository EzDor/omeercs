import { apiClient } from './api/api-client.service';

interface PlanResponse {
  generation_id: string;
  plan: Record<string, unknown>;
  duration_ms: number;
}

interface AcceptPlanResponse {
  campaign_id: string;
  campaign_name: string;
  status: string;
  template_id: string;
  config: Record<string, unknown>;
}

interface CopyVariation {
  text: string;
  character_count: number;
  tone_match_score: number;
  tone?: string;
  notes?: string;
}

interface CopyTypeResult {
  copy_type: string;
  variations: CopyVariation[];
}

interface CopyResponse {
  generation_id: string;
  copies: CopyTypeResult[];
  compliance_warnings: Array<{
    copy_type: string;
    variation_index: number;
    term: string;
    category: string;
    severity: string;
    suggestion: string;
  }>;
  duration_ms: number;
}

interface ThemeResponse {
  generation_id: string;
  theme: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    mood: string;
    confidence: number;
    palette: string[];
    source: string;
    contrast_ratio: number;
    contrast_passes_aa: boolean;
    accessibility_warnings: Array<{ pair: string; ratio: number; required: number; suggestion: string }>;
  };
  duration_ms: number;
}

interface CopyDefaultsResponse {
  template_type: string;
  defaults: {
    cta_button: string[];
    win_message: string[];
    lose_message: string[];
  };
}

interface ThemePreset {
  id: string;
  name: string;
  industry: string;
  mood: string;
  theme: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
  };
}

interface HistoryEntry {
  id: string;
  campaign_id: string | null;
  generation_type: string;
  status: string;
  accepted: boolean;
  input_params: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  duration_ms: number | null;
  llm_model: string | null;
  attempts: number;
  created_at: string;
}

interface HistoryResponse {
  generations: HistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

class IntelligenceService {
  private basePath = '/intelligence';

  async generatePlan(brief: string, constraints?: Record<string, unknown>, campaignId?: string): Promise<PlanResponse> {
    const response = await apiClient.post<PlanResponse>(`${this.basePath}/plan`, {
      brief,
      constraints,
      campaign_id: campaignId,
    });
    return response.data;
  }

  async acceptPlan(generationId: string, campaignName?: string): Promise<AcceptPlanResponse> {
    const response = await apiClient.post<AcceptPlanResponse>(`${this.basePath}/plan/${generationId}/accept`, {
      campaign_name: campaignName,
    });
    return response.data;
  }

  async regeneratePlan(generationId: string): Promise<PlanResponse> {
    const response = await apiClient.post<PlanResponse>(`${this.basePath}/plan/${generationId}/regenerate`);
    return response.data;
  }

  async generateCopy(request: {
    campaign_id?: string;
    campaign_context: { template_type: string; brand_name?: string; product_name?: string; campaign_goal?: string; target_audience?: string };
    copy_types: string[];
    tone: string;
    variations_count?: number;
    constraints?: { avoid_words?: string[]; required_words?: string[] };
  }): Promise<CopyResponse> {
    const response = await apiClient.post<CopyResponse>(`${this.basePath}/copy`, request);
    return response.data;
  }

  async getCopyDefaults(templateType: string): Promise<CopyDefaultsResponse> {
    const response = await apiClient.get<CopyDefaultsResponse>(`${this.basePath}/copy/defaults/${templateType}`);
    return response.data;
  }

  async extractThemeFromBrief(brief: string, campaignId?: string): Promise<ThemeResponse> {
    const response = await apiClient.post<ThemeResponse>(`${this.basePath}/theme/from-brief`, {
      brief,
      campaign_id: campaignId,
    });
    return response.data;
  }

  async extractThemeFromImage(imageFile: File): Promise<ThemeResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await apiClient.post<ThemeResponse>(`${this.basePath}/theme/from-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getThemePresets(industry?: string, mood?: string): Promise<{ presets: ThemePreset[] }> {
    const response = await apiClient.get<{ presets: ThemePreset[] }>(`${this.basePath}/theme/presets`, {
      params: { industry, mood },
    });
    return response.data;
  }

  async validateTheme(colors: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
  }): Promise<{ valid: boolean; issues: Array<{ pair: string; ratio: number; required: number; suggestion: string }> }> {
    const response = await apiClient.post(`${this.basePath}/theme/validate`, colors);
    return response.data;
  }

  async getHistory(query?: { campaign_id?: string; type?: string; status?: string; limit?: number; offset?: number }): Promise<HistoryResponse> {
    const response = await apiClient.get<HistoryResponse>(`${this.basePath}/history`, { params: query });
    return response.data;
  }

  async getGenerationById(generationId: string): Promise<HistoryEntry> {
    const response = await apiClient.get<HistoryEntry>(`${this.basePath}/history/${generationId}`);
    return response.data;
  }
}

export const intelligenceService = new IntelligenceService();
