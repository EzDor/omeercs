<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useLayout } from '@/layout/composables/layout';
import { UserButton } from '@clerk/vue';

const { t } = useI18n();
const { toggleMenu, toggleDarkMode, isDarkTheme } = useLayout();
</script>

<template>
  <div class="layout-topbar">
    <div class="layout-topbar-logo-container">
      <button class="layout-menu-button layout-topbar-action" @click="toggleMenu">
        <i class="pi pi-bars"></i>
      </button>
      <router-link to="/" class="layout-topbar-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
          <!--!Font Awesome Free v7.0.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
          <path
            d="M497.4 473.4L584.5 323.2L552.5 322.9L497.4 417.9L291.2 64L55 471.4L87 471.7L291.2 119.6L497.4 473.4zM142.1 429.3L174.2 429.3L291.6 226.8L495 575.9L527.5 576L291.7 171.4L142.1 429.3z"
            fill="var(--primary-color)"
          />
        </svg>

        <span>{{ t('app.brand') }}</span>
      </router-link>
    </div>

    <div class="layout-topbar-actions">
      <div class="layout-config-menu">
        <button type="button" class="layout-topbar-action" @click="toggleDarkMode">
          <i :class="['pi', { 'pi-moon': isDarkTheme, 'pi-sun': !isDarkTheme }]"></i>
        </button>
        <UserButton
          :appearance="{
            variables: {
              colorPrimary: 'var(--primary-color)',
              colorBackground: 'var(--surface-ground)',
              colorText: 'var(--text-color)',
            },
            elements: {
              userButtonBox: {
                backgroundColor: 'var(--surface-card)',
                color: 'var(--text-color)',
                borderRadius: '100px',
                padding: '4px',
                boxShadow: '0 1px 4px rgba(0,0,0,.05)',
              },
              userButtonPopoverCard: {
                backgroundColor: 'var(--surface-card)',
                color: 'var(--text-color)',
                border: '1px solid var(--surface-border)',
              },
              userButtonPopoverActionButton: {
                color: 'var(--text-color)',
                ':hover': {
                  backgroundColor: 'var(--surface-hover)',
                },
              },
            },
          }"
        />
      </div>
    </div>
  </div>
</template>
