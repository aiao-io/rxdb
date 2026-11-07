import type { WidgetKey } from '@aiao/rxdb-admin';
import {
  LockKeyhole,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Palette,
  RotateCw,
  Search,
  Settings2,
  Sun
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { LanguageWidget, TimezoneWidget } from './menu-widgets.js';

function IconButton({
  label,
  testId,
  pressed,
  disabled,
  onClick,
  children
}: {
  label: string;
  testId: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactElement;
}): ReactElement {
  return (
    <button
      type='button'
      className='btn btn-ghost btn-sm btn-square'
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SearchWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const shortcut = useAdminStore(shell.shortcuts.list).find(info => info.id === 'palette');
  const keys = shortcut?.enabled ? shortcut.keys : [];
  return (
    <button
      type='button'
      className='btn btn-ghost btn-sm admin-search-trigger'
      aria-haspopup='dialog'
      data-testid='admin-widget-search'
      onClick={() => shell.palette.open()}
    >
      <Search size={16} />
      <span className='admin-search-label'>{t('widget.search')}</span>
      {keys.length > 0 && (
        <span className='ms-auto flex gap-0.5'>
          {keys.map(key => (
            <kbd key={key} className='kbd kbd-sm'>
              {key}
            </kbd>
          ))}
        </span>
      )}
    </button>
  );
}

function ThemeWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const { theme } = useAdminStore(shell.preferences);
  const isDark = useAdminStore(shell.theme.isDark);
  const Icon =
    theme.name === 'system' ? Monitor
    : theme.name === 'light' ? Sun
    : theme.name === 'dark' ? Moon
    : isDark ? Moon
    : Palette;
  return (
    <IconButton
      label={`${t('widget.theme')}：${shell.theme.label(theme.name)}`}
      testId='admin-widget-theme'
      onClick={() => shell.theme.cycle()}
    >
      <Icon size={18} />
    </IconButton>
  );
}

function FullscreenWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const fullscreen = useAdminStore(shell.fullscreen.isFullscreen);
  const unsupported = useAdminStore(shell.fullscreen.unsupported);
  return (
    <IconButton
      label={
        unsupported ? t('widget.fullscreenUnsupported')
        : fullscreen ?
          t('widget.exitFullscreen')
        : t('widget.fullscreen')
      }
      testId='admin-widget-fullscreen'
      pressed={fullscreen}
      disabled={unsupported}
      onClick={() => void shell.fullscreen.toggle()}
    >
      {fullscreen ?
        <Minimize2 size={18} />
      : <Maximize2 size={18} />}
    </IconButton>
  );
}

function renderWidget(key: WidgetKey): ReactElement | null {
  switch (key) {
    case 'search':
      return <SearchWidget />;
    case 'theme':
      return <ThemeWidget />;
    case 'language':
      return <LanguageWidget />;
    case 'timezone':
      return <TimezoneWidget />;
    case 'fullscreen':
      return <FullscreenWidget />;
    case 'refresh':
      return <RefreshWidget />;
    case 'lock':
      return <LockWidget />;
    case 'preferences':
      return <PreferencesWidget />;
  }
}

function RefreshWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  return (
    <IconButton label={t('widget.refresh')} testId='admin-widget-refresh' onClick={() => shell.ui.refresh()}>
      <RotateCw size={18} />
    </IconButton>
  );
}

function LockWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  return (
    <IconButton label={t('widget.lock')} testId='admin-widget-lock' onClick={() => shell.lock.lock()}>
      <LockKeyhole size={18} />
    </IconButton>
  );
}

function PreferencesWidget(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const hasDiff = useAdminStore(shell.preferences.hasDiff);
  return (
    <IconButton
      label={t('widget.preferences')}
      testId='admin-widget-preferences'
      onClick={() => shell.ui.setPreferencesOpen(true)}
    >
      <span className='relative inline-flex'>
        <Settings2 size={18} />
        {hasDiff && <span className='admin-reset-dot absolute -top-1 -right-1' aria-hidden='true' />}
      </span>
    </IconButton>
  );
}

/**
 * 顶栏部件区：按偏好的顺序与显隐渲染。
 * @returns 部件容器。
 */
export function HeaderWidgets(): ReactElement {
  const shell = useAdminShell();
  const keys = useAdminStore(shell.widgets);
  return (
    <div className='admin-widgets' data-testid='admin-widgets'>
      {keys.map(key => (
        <span key={key} className='admin-widget' data-widget={key}>
          {renderWidget(key)}
        </span>
      ))}
    </div>
  );
}
