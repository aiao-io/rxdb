import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { builtins } from '../core/catalog.js';
import { AppIcon, SymbolIcon, SystemMark } from '../ui/icons.js';
import { DockMotion } from './dock-motion.js';
import type { DesktopHost } from './runtime.js';

const names: Record<string, string> = Object.fromEntries(builtins.map(app => [app.id, app.name]));
const macDockApps = [
  'files',
  'launcher',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'editor',
  'calendar',
  'music',
  'terminal',
  'calculator',
  'settings',
  'trash'
] as const;
const macDockLabels: Record<string, string> = {
  files: 'Finder',
  launcher: 'Launchpad',
  safari: 'Safari',
  mail: 'Mail',
  messages: 'Messages',
  maps: 'Maps',
  photos: 'Photos',
  editor: 'Notes',
  calendar: 'Calendar',
  music: 'Music',
  terminal: 'Terminal',
  calculator: 'Calculator',
  settings: 'System Settings',
  trash: 'Trash'
};

export function AppBar({
  host,
  action,
  children
}: {
  host: DesktopHost;
  action: (operation: () => unknown | Promise<unknown>) => void;
  children: ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const running = [...host.instances.values()];
  const macos = host.model.mode === 'macos';
  const installed = new Set(host.state.installations.map(item => item.appId));
  const ids =
    macos ? [...macDockApps] : [...new Set([...host.state.profile.pinned, ...running.map(app => app.definition.id)])];
  const reducedMotion = host.state.profile.reducedMotion;
  const layoutKey = ids.join('|');
  useLayoutEffect(() => {
    if (!macos) return;
    const controller = new DockMotion(bar.current!, tooltip.current!, reducedMotion);
    return () => controller.dispose();
  }, [macos, reducedMotion, layoutKey]);

  function label(id: string) {
    return macDockLabels[id] ?? names[id] ?? id;
  }

  function launch(id: string) {
    if (id === 'trash') {
      action(() => host.launch('files'));
      return;
    }
    if (!installed.has(id)) {
      host.setPanel('launcher');
      return;
    }
    action(() => host.launch(id));
  }

  function application(id: string) {
    const instances = running.filter(app => app.definition.id === id);
    const active = host.model.windows.some(win => win.appId === id && win.id === host.model.activeId);
    return (
      <div
        className={`bar-app ${instances.length ? 'running' : ''} ${active ? 'current' : ''}`}
        key={id}
        data-dock-slot='icon'
        data-dock-item=''
        data-dock-id={id}
        data-dock-label={label(id)}
      >
        <button
          className='dock-action'
          aria-label={`打开 ${names[id] ?? label(id)}`}
          title={macos ? undefined : label(id)}
          onClick={() => launch(id)}
        >
          <span className='dock-art'>
            <AppIcon id={id === 'editor' ? 'notes' : id} />
          </span>
          <span className='bar-label'>{label(id)}</span>
        </button>
        {instances.length > 0 && (
          <details className='running-menu'>
            <summary aria-label={`${names[id] ?? label(id)} 的运行实例`}>⌃</summary>
            <div className='menu-popover'>
              {instances.map(app => (
                <button key={app.id} onClick={() => action(() => host.reveal(app.id))}>
                  {app.dirty ? '● ' : ''}
                  {app.title}
                  {host.model.windows.some(win => win.instanceId === app.id) ? '' : ' · 窗口已关闭'}
                </button>
              ))}
              <button onClick={() => action(() => host.launch(id, true))}>新建窗口</button>
              <button onClick={() => action(() => host.closeInstances(instances.map(app => app.id)))}>退出应用</button>
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <nav ref={bar} className='app-bar glass' aria-label='应用栏'>
      <div className='taskbar-apps'>
        {macos ?
          <>
            {ids.includes('files') && application('files')}
            <button
              className='start-button dock-action'
              aria-label='应用启动器'
              aria-expanded={host.launcherOpen}
              data-dock-slot='icon'
              data-dock-item=''
              data-dock-id='launcher'
              data-dock-label='Launchpad'
              onClick={() => host.setPanel('launcher')}
            >
              <span className='dock-art'>
                <AppIcon id='launcher' />
              </span>
            </button>
            {ids.filter(id => id !== 'files' && id !== 'launcher' && id !== 'trash').map(application)}
            <span className='bar-divider' data-dock-slot='divider' />
            <button
              className='start-button dock-action mac-trash-item'
              aria-label='打开 Trash'
              data-dock-slot='icon'
              data-dock-item=''
              data-dock-id='trash'
              data-dock-label='Trash'
              onClick={() => launch('trash')}
            >
              <span className='dock-art'>
                <AppIcon id='trash' />
              </span>
            </button>
          </>
        : <>
            <button
              className='start-button dock-action'
              aria-label='应用启动器'
              aria-expanded={host.launcherOpen}
              data-dock-slot='icon'
              data-dock-item=''
              data-dock-id='launcher'
              data-dock-label='应用启动器'
              onClick={() => host.setPanel('launcher')}
            >
              <span className='dock-art'>
                <SystemMark mode='windows' />
              </span>
            </button>
            <span className='bar-divider' />
            {ids.map(application)}
            <span className='bar-divider' data-dock-slot='divider' />
            <button
              className='dock-action overview-button'
              aria-label='窗口概览'
              aria-expanded={host.overviewOpen}
              data-dock-slot='icon'
              data-dock-item=''
              data-dock-id='overview'
              data-dock-label='窗口概览'
              onClick={() => host.setPanel('overview')}
            >
              <span className='dock-art'>
                <SymbolIcon name='overview' />
              </span>
            </button>
          </>
        }
      </div>
      {macos && <div ref={tooltip} className='dock-tooltip' role='tooltip' />}
      {children}
    </nav>
  );
}
