<script setup lang="ts">
import AppMenu from './AppMenu.vue';

interface AppSidebarProps {
  showRootLabels?: boolean;
}

withDefaults(defineProps<AppSidebarProps>(), {
  showRootLabels: false,
});
</script>

<template>
  <div class="layout-sidebar">
    <app-menu :show-root-labels="showRootLabels"></app-menu>
  </div>
</template>

<style lang="scss" scoped></style>
