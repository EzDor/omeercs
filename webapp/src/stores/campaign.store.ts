import { defineStore } from 'pinia';
import { ref } from 'vue';
import { campaignService } from '@/services/campaign.service';
import type { CampaignResponse } from '@agentic-template/dto/src/campaign/campaign.dto';
import type { CampaignConfig } from '@agentic-template/dto/src/campaign/campaign-config.interface';

export const useCampaignStore = defineStore('campaign', () => {
  const campaigns = ref<CampaignResponse[]>([]);
  const selectedCampaign = ref<CampaignResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const total = ref(0);

  const fetchCampaigns = async (query?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<void> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await campaignService.list(query);
      campaigns.value = result.campaigns;
      total.value = result.total;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch campaigns';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createCampaign = async (data: { name: string; templateId: string; config?: CampaignConfig }): Promise<CampaignResponse> => {
    const campaign = await campaignService.create(data);
    campaigns.value.unshift(campaign);
    total.value++;
    return campaign;
  };

  const updateCampaign = async (id: string, data: { name?: string; config?: Partial<CampaignConfig>; expectedVersion?: number }): Promise<CampaignResponse> => {
    const updated = await campaignService.update(id, data);
    const idx = campaigns.value.findIndex((c) => c.id === id);
    if (idx !== -1) campaigns.value[idx] = updated;
    if (selectedCampaign.value?.id === id) selectedCampaign.value = updated;
    return updated;
  };

  const deleteCampaign = async (id: string, expectedVersion?: number): Promise<void> => {
    await campaignService.remove(id, expectedVersion);
    campaigns.value = campaigns.value.filter((c) => c.id !== id);
    total.value--;
    if (selectedCampaign.value?.id === id) selectedCampaign.value = null;
  };

  const duplicateCampaign = async (id: string, name?: string): Promise<CampaignResponse> => {
    const copy = await campaignService.duplicate(id, name);
    campaigns.value.unshift(copy);
    total.value++;
    return copy;
  };

  const generateCampaign = async (id: string): Promise<void> => {
    await campaignService.generate(id);
    const idx = campaigns.value.findIndex((c) => c.id === id);
    if (idx !== -1) campaigns.value[idx] = { ...campaigns.value[idx], status: 'generating' };
  };

  const archiveCampaign = async (id: string): Promise<CampaignResponse> => {
    const archived = await campaignService.archive(id);
    const idx = campaigns.value.findIndex((c) => c.id === id);
    if (idx !== -1) campaigns.value[idx] = archived;
    return archived;
  };

  const restoreCampaign = async (id: string): Promise<CampaignResponse> => {
    const restored = await campaignService.restore(id);
    const idx = campaigns.value.findIndex((c) => c.id === id);
    if (idx !== -1) campaigns.value[idx] = restored;
    return restored;
  };

  return {
    campaigns,
    selectedCampaign,
    loading,
    error,
    total,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    duplicateCampaign,
    generateCampaign,
    archiveCampaign,
    restoreCampaign,
  };
});
