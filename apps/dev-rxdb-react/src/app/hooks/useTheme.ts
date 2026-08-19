import { getWujieHost, parseResolvedTheme, subscribeHostTheme } from '@aiao/utils';
import { useEffect, useState } from 'react';

const THEME_KEY = 'theme';

export type ThemeValue = 'light' | 'dark' | 'auto';

export function parseThemeValue(value: string | null): ThemeValue {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

function readInitialTheme(): ThemeValue {
  const host = getWujieHost();
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

export function useTheme(): UseThemeReturn {
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>(readInitialTheme);

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => subscribeHostTheme(theme => setCurrentTheme(theme)), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let effectiveTheme = currentTheme;
    if (currentTheme === 'auto') {
      effectiveTheme = systemIsDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [currentTheme, systemIsDark]);

  const setTheme = (theme: ThemeValue) => {
    setCurrentTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  };

  const currentThemeIsDark = currentTheme === 'auto' ? systemIsDark : currentTheme === 'dark';
  const currentThemeLightDark: 'light' | 'dark' = currentThemeIsDark ? 'dark' : 'light';

  return {
    currentTheme,
    setTheme,
    currentThemeIsDark,
    currentThemeLightDark,
    systemIsDark
  };
}
