import { useI18n } from '@aiao/rxdb-i18n-react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useI18n();

  return (
    <button
      onClick={toggleTheme}
      className='btn btn-ghost btn-sm btn-square'
      aria-label={t('common.toggleTheme')}
      title={isDark ? t('common.themeToLight') : t('common.themeToDark')}
    >
      {isDark ?
        <Sun size={16} />
      : <Moon size={16} />}
    </button>
  );
}
