import { getWujieHost, parseResolvedTheme, requestHostTheme, subscribeHostTheme } from '@modules/wujie';
import { computed, effectScope, onScopeDispose, ref, watchEffect, type EffectScope } from 'vue';

const THEME_KEY = 'theme';
export type ThemeValue = 'light' | 'dark' | 'auto';

// 全局共享状态
const currentTheme = ref<ThemeValue>('auto');
const systemIsDark = ref(false);
// 同时充当「是否已初始化」标记：副作用活着 ⇔ scope 存在
let themeScope: EffectScope | undefined;

/**
 * 停止全局主题副作用：宿主主题订阅、`matchMedia` 监听、`data-theme` 写入。
 *
 * 正常运行期不需要调用 —— 这些副作用的生命周期就是页面。它存在是为了热更新：模块被
 * 替换时旧实例的订阅不会自动消失，两份同时写 `data-theme` 会互相打架。
 * 停止后再次调用 {@link useTheme} 会按当时的宿主 / localStorage 重新接线。
 */
export function stopTheme(): void {
  themeScope?.stop();
  themeScope = undefined;
}

export function useTheme() {
  // Initialize once
  if (!themeScope && typeof window !== 'undefined') {
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
    themeScope = effectScope(true);
    themeScope.run(() => {
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

// 热更新会留下旧模块的 bus 订阅与 matchMedia 监听，不停掉就是两份副作用同时写 data-theme
import.meta.hot?.dispose(stopTheme);
