<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppMenuItem from './AppMenuItem.vue';

const { t } = useI18n();

interface MenuItem {
  label?: string;
  icon?: string;
  to?: string;
  url?: string;
  target?: string;
  class?: string;
  items?: MenuItem[];
  visible?: boolean;
  disabled?: boolean;
  [key: string]: any;
}

const model = computed<MenuItem[]>(() => [
  {
    items: [
      {
        label: t('menu.chat'),
        icon: 'pi pi-fw pi-comment',
        to: '/chat',
      },
      {
        label: t('menu.gameCreation'),
        icon: 'pi pi-fw pi-play',
        to: '/game-creation',
      },
      {
        label: t('menu.campaigns'),
        icon: 'pi pi-fw pi-megaphone',
        to: '/campaigns',
      },
    ],
  },
]);
</script>

<template>
  <ul class="layout-menu">
    <template v-for="(item, i) in model" :key="i">
      <app-menu-item v-if="!item.separator" :item="item" :index="i" :root="true" :parent-item-key="null"></app-menu-item>
      <li v-if="item.separator" class="menu-separator"></li>
    </template>
  </ul>
</template>

<style lang="scss" scoped></style>
