<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCampaignStore } from '@/stores/campaign.store';

const { t } = useI18n();
const store = useCampaignStore();

const PAGE_SIZE = 20;

const showCreateDialog = ref(false);
const newCampaignName = ref('');
const newCampaignTemplate = ref('spin-wheel');
const statusFilter = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const currentPage = ref(0);
const operationInProgress = ref<{ id: string; action: string } | null>(null);

const templates = ['spin-wheel', 'scratch-card', 'quiz', 'memory-match'];

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / PAGE_SIZE)));
const hasPreviousPage = computed(() => currentPage.value > 0);
const hasNextPage = computed(() => currentPage.value < totalPages.value - 1);

function isOperationActive(campaignId: string): boolean {
  return operationInProgress.value?.id === campaignId;
}

function getOperationAction(campaignId: string): string | null {
  if (operationInProgress.value?.id === campaignId) return operationInProgress.value.action;
  return null;
}

async function fetchCurrentPage(): Promise<void> {
  const query: { status?: string; limit: number; offset: number } = {
    limit: PAGE_SIZE,
    offset: currentPage.value * PAGE_SIZE,
  };
  if (statusFilter.value) query.status = statusFilter.value;
  await store.fetchCampaigns(query);
}

onMounted(async () => {
  await fetchCurrentPage();
});

async function handleCreate(): Promise<void> {
  if (!newCampaignName.value.trim()) {
    errorMessage.value = t('campaigns.validationNameRequired');
    return;
  }
  try {
    await store.createCampaign({ name: newCampaignName.value, templateId: newCampaignTemplate.value });
    showCreateDialog.value = false;
    newCampaignName.value = '';
    showSuccess(t('campaigns.successCreated'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorCreate');
  }
}

async function handleGenerate(id: string): Promise<void> {
  operationInProgress.value = { id, action: 'generate' };
  try {
    await store.generateCampaign(id);
    showSuccess(t('campaigns.successGenerated'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorGenerate');
  } finally {
    operationInProgress.value = null;
  }
}

async function handleDuplicate(id: string): Promise<void> {
  operationInProgress.value = { id, action: 'duplicate' };
  try {
    await store.duplicateCampaign(id);
    showSuccess(t('campaigns.successDuplicated'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorDuplicate');
  } finally {
    operationInProgress.value = null;
  }
}

async function handleArchive(id: string): Promise<void> {
  if (!window.confirm(t('campaigns.confirmArchive'))) return;
  operationInProgress.value = { id, action: 'archive' };
  try {
    await store.archiveCampaign(id);
    showSuccess(t('campaigns.successArchived'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorArchive');
  } finally {
    operationInProgress.value = null;
  }
}

async function handleRestore(id: string): Promise<void> {
  operationInProgress.value = { id, action: 'restore' };
  try {
    await store.restoreCampaign(id);
    showSuccess(t('campaigns.successRestored'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorRestore');
  } finally {
    operationInProgress.value = null;
  }
}

async function handleDelete(campaign: { id: string; version: number }): Promise<void> {
  if (!window.confirm(t('campaigns.confirmDelete'))) return;
  operationInProgress.value = { id: campaign.id, action: 'delete' };
  try {
    await store.deleteCampaign(campaign.id, campaign.version);
    showSuccess(t('campaigns.successDeleted'));
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('campaigns.errorDelete');
  } finally {
    operationInProgress.value = null;
  }
}

async function handleFilterChange(): Promise<void> {
  currentPage.value = 0;
  await fetchCurrentPage();
}

async function handlePreviousPage(): Promise<void> {
  if (!hasPreviousPage.value) return;
  currentPage.value--;
  await fetchCurrentPage();
}

async function handleNextPage(): Promise<void> {
  if (!hasNextPage.value) return;
  currentPage.value++;
  await fetchCurrentPage();
}

function showSuccess(msg: string): void {
  successMessage.value = msg;
  errorMessage.value = '';
  setTimeout(() => {
    successMessage.value = '';
  }, 3000);
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString();
}

function getStatusClass(status: string): string {
  return `status-${status}`;
}

const statusLabelMap: Record<string, string> = {
  draft: 'campaigns.statusDraft',
  generating: 'campaigns.statusGenerating',
  live: 'campaigns.statusLive',
  failed: 'campaigns.statusFailed',
  archived: 'campaigns.statusArchived',
};

function getStatusLabel(status: string): string {
  return t(statusLabelMap[status] || status);
}
</script>

<template>
  <div class="campaigns-container">
    <header class="header">
      <h1>{{ t('campaigns.title') }}</h1>
      <button class="create-button" @click="showCreateDialog = true">{{ t('campaigns.newCampaign') }}</button>
    </header>

    <div v-if="successMessage" class="success-message">{{ successMessage }}</div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

    <div class="filter-bar">
      <select v-model="statusFilter" @change="handleFilterChange">
        <option value="">{{ t('campaigns.allStatuses') }}</option>
        <option value="draft">{{ t('campaigns.statusDraft') }}</option>
        <option value="generating">{{ t('campaigns.statusGenerating') }}</option>
        <option value="live">{{ t('campaigns.statusLive') }}</option>
        <option value="failed">{{ t('campaigns.statusFailed') }}</option>
        <option value="archived">{{ t('campaigns.statusArchived') }}</option>
      </select>
      <span class="total-count">{{ t('campaigns.totalCount', { count: store.total }) }}</span>
    </div>

    <div v-if="store.loading" class="loading">{{ t('campaigns.loading') }}</div>

    <div v-else-if="store.campaigns.length === 0" class="empty-state">{{ t('campaigns.emptyState') }}</div>

    <table v-else class="campaigns-table">
      <thead>
        <tr>
          <th>{{ t('campaigns.columnName') }}</th>
          <th>{{ t('campaigns.columnTemplate') }}</th>
          <th>{{ t('campaigns.columnStatus') }}</th>
          <th>{{ t('campaigns.columnUpdated') }}</th>
          <th>{{ t('campaigns.columnActions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="campaign in store.campaigns" :key="campaign.id">
          <td class="name-cell">{{ campaign.name }}</td>
          <td>{{ campaign.templateId }}</td>
          <td>
            <span :class="['status-badge', getStatusClass(campaign.status)]">{{ getStatusLabel(campaign.status) }}</span>
          </td>
          <td class="date-cell">{{ formatDate(campaign.updatedAt) }}</td>
          <td class="actions-cell">
            <button
              v-if="campaign.status === 'draft' || campaign.status === 'failed'"
              class="action-btn generate-btn"
              :disabled="isOperationActive(campaign.id)"
              @click="handleGenerate(campaign.id)"
            >
              {{ getOperationAction(campaign.id) === 'generate' ? t('campaigns.actionGenerating') : t('campaigns.actionGenerate') }}
            </button>
            <button class="action-btn duplicate-btn" :disabled="isOperationActive(campaign.id)" @click="handleDuplicate(campaign.id)">
              {{ getOperationAction(campaign.id) === 'duplicate' ? t('campaigns.actionDuplicating') : t('campaigns.actionDuplicate') }}
            </button>
            <button v-if="campaign.status === 'live'" class="action-btn archive-btn" :disabled="isOperationActive(campaign.id)" @click="handleArchive(campaign.id)">
              {{ getOperationAction(campaign.id) === 'archive' ? t('campaigns.actionArchiving') : t('campaigns.actionArchive') }}
            </button>
            <button v-if="campaign.status === 'archived'" class="action-btn restore-btn" :disabled="isOperationActive(campaign.id)" @click="handleRestore(campaign.id)">
              {{ getOperationAction(campaign.id) === 'restore' ? t('campaigns.actionRestoring') : t('campaigns.actionRestore') }}
            </button>
            <button
              v-if="campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'archived'"
              class="action-btn delete-btn"
              :disabled="isOperationActive(campaign.id)"
              @click="handleDelete(campaign)"
            >
              {{ getOperationAction(campaign.id) === 'delete' ? t('campaigns.actionDeleting') : t('campaigns.actionDelete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="store.campaigns.length > 0" class="pagination">
      <button class="pagination-btn" :disabled="!hasPreviousPage" @click="handlePreviousPage">{{ t('campaigns.paginationPrevious') }}</button>
      <span class="pagination-info">{{ t('campaigns.paginationInfo', { page: currentPage + 1, pages: totalPages }) }}</span>
      <button class="pagination-btn" :disabled="!hasNextPage" @click="handleNextPage">{{ t('campaigns.paginationNext') }}</button>
    </div>

    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <h2>{{ t('campaigns.dialogTitle') }}</h2>
        <div class="form-group">
          <label for="campaign-name">{{ t('campaigns.labelName') }}</label>
          <input id="campaign-name" v-model="newCampaignName" type="text" :placeholder="t('campaigns.placeholderName')" @keyup.enter="handleCreate" />
        </div>
        <div class="form-group">
          <label for="campaign-template">{{ t('campaigns.labelTemplate') }}</label>
          <select id="campaign-template" v-model="newCampaignTemplate">
            <option v-for="tmpl in templates" :key="tmpl" :value="tmpl">{{ tmpl }}</option>
          </select>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showCreateDialog = false">{{ t('common.cancel') }}</button>
          <button class="create-btn" @click="handleCreate">{{ t('campaigns.newCampaign') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.campaigns-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 2px solid #eee;
  padding-bottom: 15px;
}

.header h1 {
  margin: 0;
  color: #333;
}

.create-button {
  padding: 10px 20px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.create-button:hover {
  background: #45a049;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}

.filter-bar select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.total-count {
  color: #888;
  font-size: 14px;
}

.success-message {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.loading {
  text-align: center;
  color: #888;
  padding: 40px;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 40px;
  background: #f5f5f5;
  border-radius: 8px;
}

.campaigns-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.campaigns-table th {
  background: #f5f5f5;
  text-align: left;
  padding: 12px 15px;
  font-weight: 600;
  color: #555;
  border-bottom: 2px solid #e0e0e0;
}

.campaigns-table td {
  padding: 12px 15px;
  border-bottom: 1px solid #f0f0f0;
}

.name-cell {
  font-weight: 500;
}

.date-cell {
  font-size: 13px;
  color: #888;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-draft {
  background: #f5f5f5;
  color: #757575;
}
.status-generating {
  background: #e3f2fd;
  color: #1565c0;
}
.status-live {
  background: #e8f5e9;
  color: #2e7d32;
}
.status-failed {
  background: #ffebee;
  color: #c62828;
}
.status-archived {
  background: #fff3e0;
  color: #e65100;
}

.actions-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: white;
}

.action-btn:hover {
  background: #f5f5f5;
}

.generate-btn {
  border-color: #4caf50;
  color: #4caf50;
}
.duplicate-btn {
  border-color: #1976d2;
  color: #1976d2;
}
.archive-btn {
  border-color: #e65100;
  color: #e65100;
}
.restore-btn {
  border-color: #2e7d32;
  color: #2e7d32;
}
.delete-btn {
  border-color: #c62828;
  color: #c62828;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  padding: 30px;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
}

.dialog h2 {
  margin: 0 0 20px;
  color: #333;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  color: #555;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn {
  padding: 8px 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.create-btn {
  padding: 8px 20px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.create-btn:hover {
  background: #45a049;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-top: 20px;
  padding: 10px 0;
}

.pagination-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
}

.pagination-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-info {
  color: #666;
  font-size: 14px;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
