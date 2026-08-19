import { getWujieHost, parseResolvedTheme, requestHostTheme, subscribeHostTheme } from '@modules/wujie';
import { computed, effectScope, onScopeDispose, ref, watchEffect } from 'vue';

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
    // 状态是模块级单例，副作用也必须归单例所有：detached scope 让它们不挂在「第一个调用
    // useTheme 的组件」身上。否则 watchEffect 会绑进那个组件的 scope，它一卸载，全站主题
    // 就不再写 data-theme —— 今天只是恰好 App.vue 先调才没出事。
    const scope = effectScope(true);
    scope.run(() => {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      systemIsDark.value = media.matches;

      const stopHostTheme = subscribeHostTheme(theme => {
        currentTheme.value = theme;
      });

      // Listen for system changes
      const onSystemChange = (e: MediaQueryListEvent) => {
        systemIsDark.value = e.matches;
      };
      media.addEventListener('change', onSystemChange);

      onScopeDispose(() => {
        stopHostTheme();
        media.removeEventListener('change', onSystemChange);
      });

      // Apply theme
      watchEffect(() => {
        let effectiveTheme = currentTheme.value;
        if (effectiveTheme === 'auto') {
          effectiveTheme = systemIsDark.value ? 'dark' : 'light';
        }

        document.documentElement.setAttribute('data-theme', effectiveTheme);
      });
    });
  }

  // 只有用户主动切换才回推宿主；subscribeHostTheme 收到的下发不回推，否则两端互相触发
  const setTheme = (theme: ThemeValue) => {
    currentTheme.value = theme;
    localStorage.setItem(THEME_KEY, theme);
    requestHostTheme(
      theme === 'auto' ?
        systemIsDark.value ?
          'dark'
        : 'light'
      : theme
    );
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
