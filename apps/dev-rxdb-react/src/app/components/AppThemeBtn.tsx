import { MoonStar, Palette, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function AppThemeBtn() {
  const { currentTheme, setTheme } = useTheme();

  const handleToggleTheme = () => {
    let nextTheme: 'auto' | 'dark' | 'light' = 'auto';
    switch (currentTheme) {
      case 'auto':
        nextTheme = 'dark';
        break;
      case 'dark':
        nextTheme = 'light';
        break;
      case 'light':
        nextTheme = 'auto';
        break;
    }
    setTheme(nextTheme);
  };

  const getIcon = () => {
    switch (currentTheme) {
      case 'light':
        return <Sun size={16} />;
      case 'dark':
        return <MoonStar size={16} />;
      default:
        return <Palette size={16} />;
    }
  };

  return (
    <button className='btn btn-ghost btn-sm px-2' onClick={handleToggleTheme} aria-label='theme'>
      {getIcon()}
    </button>
  );
}
