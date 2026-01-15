import { computed, reactive, type ComputedRef } from 'vue';
import { updatePreset, updateSurfacePalette } from '@primeuix/themes';
import { Constants } from '@/constants/constants';

export interface LayoutConfig {
  darkTheme: boolean;
}

export interface LayoutState {
  staticMenuDesktopInactive: boolean;
  staticMenuMobileActive: boolean;
  menuHoverActive: boolean;
  activeMenuItem: string | null;
}

export interface MenuItem {
  value?: string;
  [key: string]: any;
}

export interface UseLayoutReturn {
  layoutConfig: LayoutConfig;
  layoutState: LayoutState;
  toggleMenu: () => void;
  isSidebarActive: ComputedRef<boolean>;
  isDarkTheme: ComputedRef<boolean>;
  setActiveMenuItem: (item: MenuItem | string) => void;
  toggleDarkMode: () => void;
}

function initSavedTheme(): boolean {
  const savedTheme = localStorage.getItem(Constants.APP_THEME_KEY);
  if (savedTheme) {
    return savedTheme === Constants.DARK_THEME_KEY;
  }
  return false;
}

const layoutConfig = reactive<LayoutConfig>({
  darkTheme: initSavedTheme(),
});

const layoutState = reactive<LayoutState>({
  staticMenuDesktopInactive: false,
  staticMenuMobileActive: false,
  menuHoverActive: false,
  activeMenuItem: null,
});

// Fixed color palettes
const colorPalettes = {
  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },
  pink: {
    50: '#fdf2f8',
    100: '#fce7f3',
    200: '#fbcfe8',
    300: '#f9a8d4',
    400: '#f472b6',
    500: '#ec4899',
    600: '#db2777',
    700: '#be185d',
    800: '#9d174d',
    900: '#831843',
    950: '#500724',
  },
};

const surfacePalettes = {
  slate: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  viva: {
    0: '#ffffff',
    50: '#f3f3f3',
    100: '#e7e7e8',
    200: '#cfd0d0',
    300: '#b7b8b9',
    400: '#9fa1a1',
    500: '#87898a',
    600: '#6e7173',
    700: '#565a5b',
    800: '#3e4244',
    900: '#262b2c',
    950: '#0e1315',
  },
};

function getPresetExt(primary: string) {
  const colorPalette = colorPalettes[primary as keyof typeof colorPalettes];

  return {
    semantic: {
      primary: colorPalette,
      colorScheme: {
        light: {
          primary: {
            color: '{primary.500}',
            contrastColor: '#ffffff',
            hoverColor: '{primary.600}',
            activeColor: '{primary.700}',
          },
          highlight: {
            background: '{primary.50}',
            focusBackground: '{primary.100}',
            color: '{primary.700}',
            focusColor: '{primary.800}',
          },
        },
        dark: {
          primary: {
            color: '{primary.400}',
            contrastColor: '{surface.900}',
            hoverColor: '{primary.300}',
            activeColor: '{primary.200}',
          },
          highlight: {
            background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
            focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
            color: 'rgba(255,255,255,.87)',
            focusColor: 'rgba(255,255,255,.87)',
          },
        },
      },
    },
  };
}

function applyTheme(isDark: boolean) {
  const primary = isDark ? 'teal' : 'pink';
  const surface = isDark ? 'viva' : 'slate';

  // Apply the theme
  updatePreset(getPresetExt(primary));
  updateSurfacePalette(surfacePalettes[surface]);
}

export function useLayout(): UseLayoutReturn {
  const setActiveMenuItem = (item: MenuItem | string): void => {
    if (typeof item === 'string') {
      layoutState.activeMenuItem = item;
    } else {
      layoutState.activeMenuItem = item.value || null;
    }
  };

  const toggleDarkMode = (): void => {
    if (!document.startViewTransition) {
      executeDarkModeToggle();
      return;
    }

    document.startViewTransition(() => executeDarkModeToggle());
  };

  const executeDarkModeToggle = (): void => {
    layoutConfig.darkTheme = !layoutConfig.darkTheme;
    document.documentElement.classList.toggle('app-dark');
    applyTheme(layoutConfig.darkTheme);

    const themeValue = layoutConfig.darkTheme ? Constants.DARK_THEME_KEY : Constants.LIGHT_THEME_KEY;
    localStorage.setItem(Constants.APP_THEME_KEY, themeValue);
  };

  const toggleMenu = (): void => {
    if (window.innerWidth > 991) {
      layoutState.staticMenuDesktopInactive = !layoutState.staticMenuDesktopInactive;
    } else {
      layoutState.staticMenuMobileActive = !layoutState.staticMenuMobileActive;
    }
  };

  const isSidebarActive = computed((): boolean => layoutState.staticMenuMobileActive);

  const isDarkTheme = computed((): boolean => layoutConfig.darkTheme);

  if (layoutConfig.darkTheme) {
    document.documentElement.classList.add('app-dark');
  }
  applyTheme(layoutConfig.darkTheme);

  return {
    layoutConfig,
    layoutState,
    toggleMenu,
    isSidebarActive,
    isDarkTheme,
    setActiveMenuItem,
    toggleDarkMode,
  };
}
