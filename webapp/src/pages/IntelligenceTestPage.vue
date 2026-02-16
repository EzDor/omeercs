<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Dropdown from 'primevue/dropdown';
import Slider from 'primevue/slider';
import MultiSelect from 'primevue/multiselect';
import FileUpload from 'primevue/fileupload';
import ProgressSpinner from 'primevue/progressspinner';
import { intelligenceService } from '@/services/intelligence.service';

const { t } = useI18n();

const planBrief = ref('');
const planConstraints = ref('');
const planResult = ref<Record<string, unknown> | null>(null);
const planGenerationId = ref('');
const planLoading = ref(false);
const planError = ref('');

async function generatePlan() {
  planLoading.value = true;
  planError.value = '';
  planResult.value = null;
  try {
    let constraints: Record<string, unknown> | undefined;
    if (planConstraints.value.trim()) {
      constraints = JSON.parse(planConstraints.value);
    }
    const result = await intelligenceService.generatePlan(planBrief.value, constraints);
    planResult.value = result as unknown as Record<string, unknown>;
    planGenerationId.value = result.generation_id;
  } catch (e: unknown) {
    planError.value = (e as Error).message;
  } finally {
    planLoading.value = false;
  }
}

const acceptResult = ref<Record<string, unknown> | null>(null);
async function acceptPlan() {
  planLoading.value = true;
  try {
    const result = await intelligenceService.acceptPlan(planGenerationId.value);
    acceptResult.value = result as unknown as Record<string, unknown>;
  } catch (e: unknown) {
    planError.value = (e as Error).message;
  } finally {
    planLoading.value = false;
  }
}

async function regeneratePlan() {
  planLoading.value = true;
  planError.value = '';
  try {
    const result = await intelligenceService.regeneratePlan(planGenerationId.value);
    planResult.value = result as unknown as Record<string, unknown>;
    planGenerationId.value = result.generation_id;
  } catch (e: unknown) {
    planError.value = (e as Error).message;
  } finally {
    planLoading.value = false;
  }
}

const templateTypes = computed(() => [
  { label: t('intelligence.templateTypes.spinWheel'), value: 'spin_wheel' },
  { label: t('intelligence.templateTypes.scratchCard'), value: 'scratch_card' },
  { label: t('intelligence.templateTypes.quiz'), value: 'quiz' },
  { label: t('intelligence.templateTypes.memoryMatch'), value: 'memory_match' },
]);
const toneOptions = computed(() => [
  { label: t('intelligence.tones.playful'), value: 'playful' },
  { label: t('intelligence.tones.urgent'), value: 'urgent' },
  { label: t('intelligence.tones.professional'), value: 'professional' },
  { label: t('intelligence.tones.luxury'), value: 'luxury' },
  { label: t('intelligence.tones.friendly'), value: 'friendly' },
]);
const copyTypeOptions = computed(() => [
  { label: t('intelligence.copyTypeOptions.headline'), value: 'headline' },
  { label: t('intelligence.copyTypeOptions.subheadline'), value: 'subheadline' },
  { label: t('intelligence.copyTypeOptions.ctaButton'), value: 'cta_button' },
  { label: t('intelligence.copyTypeOptions.prizeDescription'), value: 'prize_description' },
  { label: t('intelligence.copyTypeOptions.winMessage'), value: 'win_message' },
  { label: t('intelligence.copyTypeOptions.loseMessage'), value: 'lose_message' },
  { label: t('intelligence.copyTypeOptions.instructions'), value: 'instructions' },
  { label: t('intelligence.copyTypeOptions.termsSummary'), value: 'terms_summary' },
]);
const selectedTemplate = ref('spin_wheel');
const selectedTone = ref('playful');
const selectedCopyTypes = ref(['headline', 'cta_button', 'win_message']);
const variationsCount = ref(3);
const copyResult = ref<Record<string, unknown> | null>(null);
const copyLoading = ref(false);
const copyError = ref('');

async function generateCopy() {
  copyLoading.value = true;
  copyError.value = '';
  copyResult.value = null;
  try {
    const result = await intelligenceService.generateCopy({
      campaign_context: { template_type: selectedTemplate.value },
      copy_types: selectedCopyTypes.value,
      tone: selectedTone.value,
      variations_count: variationsCount.value,
    });
    copyResult.value = result as unknown as Record<string, unknown>;
  } catch (e: unknown) {
    copyError.value = (e as Error).message;
  } finally {
    copyLoading.value = false;
  }
}

const themeBrief = ref('');
const themeResult = ref<Record<string, unknown> | null>(null);
const themeLoading = ref(false);
const themeError = ref('');
const presets = ref<Array<Record<string, unknown>>>([]);

async function extractThemeFromBrief() {
  themeLoading.value = true;
  themeError.value = '';
  themeResult.value = null;
  try {
    const result = await intelligenceService.extractThemeFromBrief(themeBrief.value);
    themeResult.value = result as unknown as Record<string, unknown>;
  } catch (e: unknown) {
    themeError.value = (e as Error).message;
  } finally {
    themeLoading.value = false;
  }
}

async function extractThemeFromImage(event: { files: File[] }) {
  if (!event.files.length) return;
  themeLoading.value = true;
  themeError.value = '';
  themeResult.value = null;
  try {
    const result = await intelligenceService.extractThemeFromImage(event.files[0]);
    themeResult.value = result as unknown as Record<string, unknown>;
  } catch (e: unknown) {
    themeError.value = (e as Error).message;
  } finally {
    themeLoading.value = false;
  }
}

async function loadPresets() {
  try {
    const result = await intelligenceService.getThemePresets();
    presets.value = result.presets as unknown as Array<Record<string, unknown>>;
  } catch (e: unknown) {
    themeError.value = (e as Error).message;
  }
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function getThemePalette(result: Record<string, unknown> | null): string[] {
  const theme = result?.theme as Record<string, unknown> | undefined;
  return (theme?.palette as string[]) || [];
}
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">{{ t('intelligence.title') }}</h1>

    <Tabs value="plan">
      <TabList>
        <Tab value="plan">{{ t('intelligence.tabs.plan') }}</Tab>
        <Tab value="copy">{{ t('intelligence.tabs.copy') }}</Tab>
        <Tab value="theme">{{ t('intelligence.tabs.theme') }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="plan">
          <div class="flex flex-col gap-4">
            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.plan.briefLabel') }}</label>
              <Textarea v-model="planBrief" rows="5" class="w-full" :placeholder="t('intelligence.plan.briefPlaceholder')" />
            </div>
            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.plan.constraintsLabel') }}</label>
              <Textarea v-model="planConstraints" rows="3" class="w-full" placeholder='{"template_preference": "spin_wheel"}' />
            </div>
            <div class="flex gap-2">
              <Button :label="t('intelligence.plan.generatePlan')" icon="pi pi-bolt" :loading="planLoading" :disabled="!planBrief.trim()" @click="generatePlan" />
              <Button v-if="planGenerationId" :label="t('intelligence.plan.acceptPlan')" icon="pi pi-check" severity="success" :loading="planLoading" @click="acceptPlan" />
              <Button v-if="planGenerationId" :label="t('intelligence.plan.regenerate')" icon="pi pi-refresh" severity="secondary" :loading="planLoading" @click="regeneratePlan" />
            </div>
            <ProgressSpinner v-if="planLoading" style="width: 40px; height: 40px" />
            <div v-if="planError" class="text-red-500">{{ planError }}</div>
            <pre v-if="planResult" class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">{{ formatJson(planResult) }}</pre>
            <pre v-if="acceptResult" class="bg-green-50 p-4 rounded overflow-auto max-h-48 text-sm">{{ formatJson(acceptResult) }}</pre>
          </div>
        </TabPanel>

        <TabPanel value="copy">
          <div class="flex flex-col gap-4">
            <div class="flex gap-4 flex-wrap">
              <div>
                <label class="block font-semibold mb-1">{{ t('intelligence.copy.templateType') }}</label>
                <Dropdown v-model="selectedTemplate" :options="templateTypes" optionLabel="label" optionValue="value" class="w-48" />
              </div>
              <div>
                <label class="block font-semibold mb-1">{{ t('intelligence.copy.tone') }}</label>
                <Dropdown v-model="selectedTone" :options="toneOptions" optionLabel="label" optionValue="value" class="w-48" />
              </div>
            </div>
            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.copy.copyTypes') }}</label>
              <MultiSelect v-model="selectedCopyTypes" :options="copyTypeOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.copy.variations', { count: variationsCount }) }}</label>
              <Slider v-model="variationsCount" :min="1" :max="5" class="w-64" />
            </div>
            <Button :label="t('intelligence.copy.generateCopy')" icon="pi pi-pencil" :loading="copyLoading" :disabled="!selectedCopyTypes.length" @click="generateCopy" />
            <ProgressSpinner v-if="copyLoading" style="width: 40px; height: 40px" />
            <div v-if="copyError" class="text-red-500">{{ copyError }}</div>
            <pre v-if="copyResult" class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">{{ formatJson(copyResult) }}</pre>
          </div>
        </TabPanel>

        <TabPanel value="theme">
          <div class="flex flex-col gap-4">
            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.theme.briefLabel') }}</label>
              <Textarea v-model="themeBrief" rows="4" class="w-full" :placeholder="t('intelligence.theme.briefPlaceholder')" />
            </div>
            <div class="flex gap-2">
              <Button
                :label="t('intelligence.theme.extractFromBrief')"
                icon="pi pi-palette"
                :loading="themeLoading"
                :disabled="!themeBrief.trim()"
                @click="extractThemeFromBrief"
              />
              <Button :label="t('intelligence.theme.loadPresets')" icon="pi pi-list" severity="secondary" @click="loadPresets" />
            </div>

            <div>
              <label class="block font-semibold mb-1">{{ t('intelligence.theme.uploadImageLabel') }}</label>
              <FileUpload
                mode="basic"
                accept="image/png,image/jpeg,image/webp"
                :maxFileSize="10000000"
                :chooseLabel="t('intelligence.theme.chooseImage')"
                @select="extractThemeFromImage"
              />
            </div>

            <ProgressSpinner v-if="themeLoading" style="width: 40px; height: 40px" />
            <div v-if="themeError" class="text-red-500">{{ themeError }}</div>

            <div v-if="themeResult" class="flex flex-col gap-2">
              <div class="flex gap-2 flex-wrap">
                <div v-for="color in getThemePalette(themeResult)" :key="color" class="w-16 h-16 rounded border" :style="{ backgroundColor: color }" :title="color" />
              </div>
              <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">{{ formatJson(themeResult) }}</pre>
            </div>

            <div v-if="presets.length" class="mt-4">
              <h3 class="font-semibold mb-2">{{ t('intelligence.theme.presetsTitle') }}</h3>
              <div class="grid grid-cols-2 gap-4">
                <div v-for="preset in presets" :key="String(preset.id)" class="border rounded p-3">
                  <div class="font-semibold">{{ preset.name }}</div>
                  <div class="text-sm text-gray-500">{{ preset.industry }} / {{ preset.mood }}</div>
                  <div class="flex gap-1 mt-2">
                    <div
                      v-for="(color, key) in preset.theme as Record<string, string>"
                      :key="key"
                      class="w-8 h-8 rounded"
                      :style="{ backgroundColor: String(color) }"
                      :title="`${key}: ${color}`"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
