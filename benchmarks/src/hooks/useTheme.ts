import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'rxdb-benchmarks-theme';
const LIGHT_THEME = 'light';
const DARK_THEME = 'dark';

export type Theme = typeof LIGHT_THEME | typeof DARK_THEME;

function isTheme(value: unknown): value is Theme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

/**
 * 从 localStorage 或系统偏好中获取当前主题
 */
function getCurrentTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (isTheme(saved)) return saved;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK_THEME : LIGHT_THEME;
}

/**
 * 主题切换 Hook
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // 监听来自父页面的主题同步消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'setTheme' && isTheme(event.data.theme)) {
        setThemeState(event.data.theme);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === LIGHT_THEME ? DARK_THEME : LIGHT_THEME));
  }, []);

  return {
    theme,
    toggleTheme,
    isDark: theme === DARK_THEME
  };
}
