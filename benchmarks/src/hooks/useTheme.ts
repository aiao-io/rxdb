import { getWujieHost, parseResolvedTheme, subscribeHostTheme, type ResolvedTheme } from '@aiao/utils';
import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'rxdb-benchmarks-theme';
const LIGHT_THEME = 'light';
const DARK_THEME = 'dark';

export type Theme = typeof LIGHT_THEME | typeof DARK_THEME;

function isTheme(value: unknown): value is Theme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

/**
 * 从宿主 props、localStorage 或系统偏好中获取当前主题
 */
function getCurrentTheme(): Theme {
  const host = getWujieHost();
  if (host?.props && Object.hasOwn(host.props, 'theme')) {
    return parseResolvedTheme(host.props.theme);
  }
  if (typeof window === 'undefined') return LIGHT_THEME;
  const saved = localStorage.getItem(THEME_KEY);
  if (isTheme(saved)) return saved;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK_THEME : LIGHT_THEME;
}

/**
 * 主题切换 Hook
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getCurrentTheme);
  const hosted = Boolean(getWujieHost());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (!hosted) localStorage.setItem(THEME_KEY, theme);
  }, [hosted, theme]);

  useEffect(() => subscribeHostTheme(next => setThemeState(next as ResolvedTheme)), []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === LIGHT_THEME ? DARK_THEME : LIGHT_THEME));
  }, []);

  return {
    theme,
    toggleTheme,
    isDark: theme === DARK_THEME
  };
}
