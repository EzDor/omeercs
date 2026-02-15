import { apiClient } from './api/api-client.service';
import type { CampaignResponse, CampaignListResponse, GenerateResponse, BulkOperationResponse, PublicCampaignResponse } from '@agentic-template/dto/src/campaign/campaign.dto';

class CampaignService {
  private basePath = '/campaigns';

  async list(query?: { status?: string; templateId?: string; search?: string; sortBy?: string; sortOrder?: string; limit?: number; offset?: number }): Promise<CampaignListResponse> {
    const response = await apiClient.get<CampaignListResponse>(this.basePath, { params: query });
    return response.data;
  }

  async getById(id: string): Promise<CampaignResponse> {
    const response = await apiClient.get<CampaignResponse>(`${this.basePath}/${id}`);
    return response.data;
  }

  async create(data: { name: string; templateId: string; config?: any }): Promise<CampaignResponse> {
    const response = await apiClient.post<CampaignResponse>(this.basePath, data);
    return response.data;
  }

  async update(id: string, data: { name?: string; config?: any; expectedVersion?: number }): Promise<CampaignResponse> {
    const response = await apiClient.patch<CampaignResponse>(`${this.basePath}/${id}`, data);
    return response.data;
  }

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${this.basePath}/${id}`);
  }

  async duplicate(id: string, name?: string): Promise<CampaignResponse> {
    const response = await apiClient.post<CampaignResponse>(`${this.basePath}/${id}/duplicate`, { name });
    return response.data;
  }

  async generate(id: string): Promise<GenerateResponse> {
    const response = await apiClient.post<GenerateResponse>(`${this.basePath}/${id}/generate`);
    return response.data;
  }

  async archive(id: string): Promise<CampaignResponse> {
    const response = await apiClient.post<CampaignResponse>(`${this.basePath}/${id}/archive`);
    return response.data;
  }

  async restore(id: string): Promise<CampaignResponse> {
    const response = await apiClient.post<CampaignResponse>(`${this.basePath}/${id}/restore`);
    return response.data;
  }

  async bulkArchive(ids: string[]): Promise<BulkOperationResponse> {
    const response = await apiClient.post<BulkOperationResponse>(`${this.basePath}/bulk-archive`, { campaignIds: ids });
    return response.data;
  }

  async bulkDelete(ids: string[]): Promise<BulkOperationResponse> {
    const response = await apiClient.post<BulkOperationResponse>(`${this.basePath}/bulk-delete`, { campaignIds: ids });
    return response.data;
  }

  async getPlayerData(id: string): Promise<PublicCampaignResponse> {
    const baseUrl = import.meta.env.VITE_API_CENTER_BASE_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/play/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch player data: ${response.status}`);
    return response.json();
  }

  async getCampaignRuns(campaignId: string, query?: { status?: string; limit?: number; offset?: number }): Promise<any> {
    const response = await apiClient.get(`${this.basePath}/${campaignId}/runs`, { params: query });
    return response.data;
  }
}

export const campaignService = new CampaignService();
