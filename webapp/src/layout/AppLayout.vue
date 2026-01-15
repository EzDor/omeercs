<script setup lang="ts">
import { useLayout } from '@/layout/composables/layout';
import { computed, ref, watch } from 'vue';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';

const { layoutState, isSidebarActive } = useLayout();

const outsideClickListener = ref<((event: Event) => void) | null>(null);

watch(isSidebarActive, (newVal: boolean) => {
  if (newVal) {
    bindOutsideClickListener();
  } else {
    unbindOutsideClickListener();
  }
});

const containerClass = computed(() => {
  return {
    'layout-static': true,
    'layout-static-inactive': layoutState.staticMenuDesktopInactive,
    'layout-mobile-active': layoutState.staticMenuMobileActive,
  };
});

function bindOutsideClickListener(): void {
  if (!outsideClickListener.value) {
    outsideClickListener.value = (event: Event) => {
      if (isOutsideClicked(event)) {
        layoutState.staticMenuMobileActive = false;
        layoutState.menuHoverActive = false;
      }
    };
    document.addEventListener('click', outsideClickListener.value);
  }
}

function unbindOutsideClickListener(): void {
  if (outsideClickListener.value) {
    document.removeEventListener('click', outsideClickListener.value);
    outsideClickListener.value = null;
  }
}

function isOutsideClicked(event: Event): boolean {
  const sidebarEl = document.querySelector('.layout-sidebar') as HTMLElement;
  const topbarEl = document.querySelector('.layout-menu-button') as HTMLElement;

  if (!sidebarEl || !topbarEl || !event.target) {
    return false;
  }

  const target = event.target as HTMLElement;
  return !(sidebarEl.isSameNode(target) || sidebarEl.contains(target) || topbarEl.isSameNode(target) || topbarEl.contains(target));
}
</script>

<template>
  <div class="layout-wrapper" :class="containerClass">
    <app-topbar></app-topbar>
    <app-sidebar></app-sidebar>
    <div class="layout-main-container">
      <div class="layout-main">
        <router-view></router-view>
      </div>
    </div>
    <div class="layout-mask animate-fadein"></div>
  </div>
  <PrimeToast />
</template>
