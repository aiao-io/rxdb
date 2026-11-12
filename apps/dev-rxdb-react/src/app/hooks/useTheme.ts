import { getOrbitHost, parseResolvedTheme, requestHostTheme, subscribeHostTheme } from '@modules/orbit';
import { useSyncExternalStore } from 'react';

const THEME_KEY = 'theme';
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export type ThemeValue = 'light' | 'dark' | 'auto';

export function parseThemeValue(value: string | null): ThemeValue {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

function readInitialTheme(): ThemeValue {
  const host = getOrbitHost();
  if (host?.props && Object.hasOwn(host.props, 'theme')) {
    return parseResolvedTheme(host.props.theme);
  }
  if (typeof window === 'undefined') return 'auto';
  return parseThemeValue(localStorage.getItem(THEME_KEY));
}

interface UseThemeReturn {
  currentTheme: ThemeValue;
  setTheme: (theme: ThemeValue) => void;
  currentThemeIsDark: boolean;
  currentThemeLightDark: 'light' | 'dark';
  systemIsDark: boolean;
}

interface ThemeState {
  readonly currentTheme: ThemeValue;
  readonly systemIsDark: boolean;
}

const SERVER_STATE: ThemeState = { currentTheme: 'auto', systemIsDark: false };

// 同页所有 useTheme 共享一份主题（与 Vue 的模块级 ref、Angular 的单例 ThemeService 同口径）：
// 各自持有状态时一处切换通知不到别处，系统配色一变各份状态还会轮流改写 data-theme
const listeners = new Set<() => void>();
let state: ThemeState | undefined;
let disconnect: (() => void) | undefined;

function readState(): ThemeState {
  state ??= { currentTheme: readInitialTheme(), systemIsDark: window.matchMedia(SYSTEM_DARK_QUERY).matches };
  return state;
}

function resolveTheme({ currentTheme, systemIsDark }: ThemeState): 'light' | 'dark' {
  if (currentTheme === 'auto') return systemIsDark ? 'dark' : 'light';
  return currentTheme;
}

function updateState(patch: Partial<ThemeState>): void {
  state = { ...readState(), ...patch };
  document.documentElement.setAttribute('data-theme', resolveTheme(state));
  for (const listener of listeners) listener();
}

/** 第一个消费者挂载时接上系统配色与宿主主题；全程只有这一份监听。 */
function connect(): () => void {
  const media = window.matchMedia(SYSTEM_DARK_QUERY);
  const onSystemChange = (event: MediaQueryListEvent) => updateState({ systemIsDark: event.matches });
  media.addEventListener('change', onSystemChange);
  const stopHostTheme = subscribeHostTheme(theme => updateState({ currentTheme: theme }));
  updateState({ systemIsDark: media.matches });
  return () => {
    media.removeEventListener('change', onSystemChange);
    stopHostTheme();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  disconnect ??= connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    disconnect?.();
    disconnect = undefined;
    // 全部卸载后，下次挂载按当时的宿主 / localStorage 重新读初值
    state = undefined;
  };
}

export function useTheme(): UseThemeReturn {
  const { currentTheme, systemIsDark } = useSyncExternalStore(subscribe, readState, () => SERVER_STATE);

  // 只有用户主动切换才回推宿主；subscribeHostTheme 收到的下发不回推，否则两端互相触发
  const setTheme = (theme: ThemeValue) => {
    updateState({ currentTheme: theme });
    localStorage.setItem(THEME_KEY, theme);
    requestHostTheme(resolveTheme(readState()));
  };

  const currentThemeLightDark = resolveTheme({ currentTheme, systemIsDark });
  const currentThemeIsDark = currentThemeLightDark === 'dark';

  return {
    currentTheme,
    setTheme,
    currentThemeIsDark,
    currentThemeLightDark,
    systemIsDark
  };
}
