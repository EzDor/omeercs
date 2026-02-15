<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useCampaignStore } from '@/stores/campaign.store';

const store = useCampaignStore();

const showCreateDialog = ref(false);
const newCampaignName = ref('');
const newCampaignTemplate = ref('spin-wheel');
const statusFilter = ref('');
const errorMessage = ref('');
const successMessage = ref('');

const templates = ['spin-wheel', 'scratch-card', 'quiz', 'memory-match'];

onMounted(async () => {
  await store.fetchCampaigns();
});

async function handleCreate(): Promise<void> {
  if (!newCampaignName.value.trim()) {
    errorMessage.value = 'Please enter a campaign name';
    return;
  }
  try {
    await store.createCampaign({ name: newCampaignName.value, templateId: newCampaignTemplate.value });
    showCreateDialog.value = false;
    newCampaignName.value = '';
    showSuccess('Campaign created');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to create campaign';
  }
}

async function handleGenerate(id: string): Promise<void> {
  try {
    await store.generateCampaign(id);
    showSuccess('Generation triggered');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to generate';
  }
}

async function handleDuplicate(id: string): Promise<void> {
  try {
    await store.duplicateCampaign(id);
    showSuccess('Campaign duplicated');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to duplicate';
  }
}

async function handleArchive(id: string): Promise<void> {
  try {
    await store.archiveCampaign(id);
    showSuccess('Campaign archived');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to archive';
  }
}

async function handleRestore(id: string): Promise<void> {
  try {
    await store.restoreCampaign(id);
    showSuccess('Campaign restored');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to restore';
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await store.deleteCampaign(id);
    showSuccess('Campaign deleted');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to delete';
  }
}

async function handleFilterChange(): Promise<void> {
  await store.fetchCampaigns(statusFilter.value ? { status: statusFilter.value } : undefined);
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
</script>

<template>
  <div class="campaigns-container">
    <header class="header">
      <h1>Campaigns</h1>
      <button class="create-button" @click="showCreateDialog = true">+ New Campaign</button>
    </header>

    <div v-if="successMessage" class="success-message">{{ successMessage }}</div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

    <div class="filter-bar">
      <select v-model="statusFilter" @change="handleFilterChange">
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="generating">Generating</option>
        <option value="live">Live</option>
        <option value="failed">Failed</option>
        <option value="archived">Archived</option>
      </select>
      <span class="total-count">{{ store.total }} campaigns</span>
    </div>

    <div v-if="store.loading" class="loading">Loading...</div>

    <div v-else-if="store.campaigns.length === 0" class="empty-state">No campaigns yet. Create one to get started.</div>

    <table v-else class="campaigns-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Template</th>
          <th>Status</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="campaign in store.campaigns" :key="campaign.id">
          <td class="name-cell">{{ campaign.name }}</td>
          <td>{{ campaign.templateId }}</td>
          <td><span :class="['status-badge', getStatusClass(campaign.status)]">{{ campaign.status }}</span></td>
          <td class="date-cell">{{ formatDate(campaign.updatedAt) }}</td>
          <td class="actions-cell">
            <button v-if="campaign.status === 'draft' || campaign.status === 'failed'" class="action-btn generate-btn" @click="handleGenerate(campaign.id)">Generate</button>
            <button class="action-btn duplicate-btn" @click="handleDuplicate(campaign.id)">Duplicate</button>
            <button v-if="campaign.status === 'live'" class="action-btn archive-btn" @click="handleArchive(campaign.id)">Archive</button>
            <button v-if="campaign.status === 'archived'" class="action-btn restore-btn" @click="handleRestore(campaign.id)">Restore</button>
            <button v-if="campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'archived'" class="action-btn delete-btn" @click="handleDelete(campaign.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <h2>New Campaign</h2>
        <div class="form-group">
          <label for="campaign-name">Name:</label>
          <input id="campaign-name" v-model="newCampaignName" type="text" placeholder="My Campaign" @keyup.enter="handleCreate" />
        </div>
        <div class="form-group">
          <label for="campaign-template">Template:</label>
          <select id="campaign-template" v-model="newCampaignTemplate">
            <option v-for="t in templates" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="showCreateDialog = false">Cancel</button>
          <button class="create-btn" @click="handleCreate">Create</button>
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
</style>
