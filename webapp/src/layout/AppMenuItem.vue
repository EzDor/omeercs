<script setup lang="ts">
import { useLayout } from '@/layout/composables/layout';
import { onBeforeMount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

export interface MenuItemProps {
  item: {
    label?: string;
    icon?: string;
    to?: string;
    url?: string;
    target?: string;
    class?: string;
    command?: (event: { originalEvent: Event; item: any }) => void;
    items?: MenuItemProps['item'][];
    visible?: boolean;
    disabled?: boolean;
    [key: string]: any;
  };
  index: number;
  root: boolean;
  parentItemKey: string | null;
}

const route = useRoute();

const { layoutState, setActiveMenuItem, toggleMenu } = useLayout();

const props = withDefaults(defineProps<MenuItemProps>(), {
  item: () => ({}),
  index: 0,
  root: true,
  parentItemKey: null,
});

const isActiveMenu = ref<boolean>(false);
const itemKey = ref<string>('');

onBeforeMount(() => {
  itemKey.value = props.parentItemKey ? props.parentItemKey + '-' + props.index : String(props.index);

  const activeItem = layoutState.activeMenuItem;

  isActiveMenu.value = activeItem === itemKey.value || (activeItem ? activeItem.startsWith(itemKey.value + '-') : false);
});

watch(
  () => layoutState.activeMenuItem,
  (newVal: string | null) => {
    if (newVal) {
      isActiveMenu.value = newVal === itemKey.value || newVal.startsWith(itemKey.value + '-');
    } else {
      isActiveMenu.value = false;
    }
  },
);

function itemClick(event: Event, item: MenuItemProps['item']): void {
  if (item.disabled) {
    event.preventDefault();
    return;
  }

  if ((item.to || item.url) && layoutState.staticMenuMobileActive) {
    toggleMenu();
  }

  if (item.command) {
    item.command({ originalEvent: event, item: item });
  }

  const foundItemKey = item.items ? (isActiveMenu.value ? props.parentItemKey : itemKey.value) : itemKey.value;

  setActiveMenuItem(foundItemKey ?? '');
}

function checkActiveRoute(item: MenuItemProps['item']): boolean {
  return route.path === item.to;
}
</script>

<template>
  <li :class="{ 'layout-root-menuitem': root, 'active-menuitem': isActiveMenu }">
    <div v-if="root && item.visible !== false" class="layout-menuitem-root-text">{{ item.label }}</div>
    <a v-if="(!item.to || item.items) && item.visible !== false" :href="item.url" @click="itemClick($event, item)" :class="item.class" :target="item.target" tabindex="0">
      <i :class="item.icon" class="layout-menuitem-icon"></i>
      <span class="layout-menuitem-text">{{ item.label }}</span>
      <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items"></i>
    </a>
    <router-link
      v-if="item.to && !item.items && item.visible !== false"
      @click="itemClick($event, item)"
      :class="[item.class, { 'active-route': checkActiveRoute(item) }]"
      tabindex="0"
      :to="item.to"
    >
      <i :class="item.icon" class="layout-menuitem-icon"></i>
      <span class="layout-menuitem-text">{{ item.label }}</span>
      <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items"></i>
    </router-link>
    <Transition v-if="item.items && item.visible !== false" name="layout-submenu">
      <ul v-show="root ? true : isActiveMenu" class="layout-submenu">
        <app-menu-item v-for="(child, i) in item.items" :key="i" :index="i" :item="child" :parent-item-key="itemKey" :root="false"></app-menu-item>
      </ul>
    </Transition>
  </li>
</template>

<style lang="scss" scoped></style>
