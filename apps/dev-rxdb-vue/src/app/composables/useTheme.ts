import { getWujieHost, parseResolvedTheme, subscribeHostTheme } from '@aiao/utils';
import { computed, ref, watchEffect } from 'vue';

const THEME_KEY = 'theme';
export type ThemeValue = 'light' | 'dark' | 'auto';

// 全局共享状态
const currentTheme = ref<ThemeValue>('auto');
const systemIsDark = ref(false);
let initialized = false;

export function useTheme() {
  // Initialize once
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;

    const host = getWujieHost();
    if (host?.props && Object.hasOwn(host.props, 'theme')) {
      currentTheme.value = parseResolvedTheme(host.props.theme);
    } else {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'auto') currentTheme.value = stored;
    }
    systemIsDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    subscribeHostTheme(theme => {
      currentTheme.value = theme;
    });

    // Listen for system changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      systemIsDark.value = e.matches;
    });

    // Apply theme
    watchEffect(() => {
      let effectiveTheme = currentTheme.value;
      if (effectiveTheme === 'auto') {
        effectiveTheme = systemIsDark.value ? 'dark' : 'light';
      }

      document.documentElement.setAttribute('data-theme', effectiveTheme);
    });
  }

  const setTheme = (theme: ThemeValue) => {
    currentTheme.value = theme;
    localStorage.setItem(THEME_KEY, theme);
  };

  const currentThemeIsDark = computed(() => {
    if (currentTheme.value === 'auto') return systemIsDark.value;
    return currentTheme.value === 'dark';
  });
  const currentThemeLightDark = computed<'light' | 'dark'>(() => (currentThemeIsDark.value ? 'dark' : 'light'));

  return {
    currentTheme,
    currentThemeIsDark,
    currentThemeLightDark,
    setTheme
  };
}
