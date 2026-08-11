import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className='btn btn-ghost btn-sm btn-square'
      aria-label='切换主题'
      title={isDark ? '切换到浅色主题' : '切换到深色主题'}
    >
      {isDark ?
        <Sun size={16} />
      : <Moon size={16} />}
    </button>
  );
}
