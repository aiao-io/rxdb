import { findMenuPath } from '@aiao/rxdb-admin';
import { History, Pin, X } from 'lucide-react';
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent
} from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { interceptNavigation } from '../layout/menu-tree.js';
import { TabContextMenu, type TabMenuAnchor } from './tab-context-menu.js';

function HistoryMenu(): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const { tabs, history } = useAdminStore(shell.tabs);
  const titled = history.flatMap(key => {
    const tab = tabs.find(candidate => candidate.key === key);
    return tab ? [tab] : [];
  });
  if (titled.length === 0) return null;
  return (
    <div className='dropdown'>
      <button
        type='button'
        tabIndex={0}
        className='btn btn-ghost btn-xs btn-square'
        aria-label={t('tabbar.history')}
        aria-haspopup='menu'
        data-testid='admin-tab-history'
      >
        <History size={14} />
      </button>
      <ul
        tabIndex={0}
        className='dropdown-content menu menu-sm bg-base-100 rounded-box z-50 max-h-72 w-56 overflow-y-auto p-1 shadow'
      >
        {titled.map(tab => (
          <li key={tab.key}>
            <a href={tab.url} onClick={event => interceptNavigation(event, () => shell.activateTab(tab.key))}>
              {tab.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 页签栏：多页签、固定、拖拽 / 键盘排序、右键菜单、中键关闭、滚轮横向滚动。
 * @returns 页签栏元素；偏好关闭或还没有页签时为空。
 */
export function Tabbar(): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const layout = useAdminStore(shell.layout);
  const { tabbar } = useAdminStore(shell.preferences);
  const { tabs, activeKey } = useAdminStore(shell.tabs);
  const menu = useAdminStore(shell.menu);
  const [anchor, setAnchor] = useState<TabMenuAnchor | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const scroller = useRef<HTMLUListElement>(null);
  const closeMenu = useCallback(() => setAnchor(null), []);

  if (!layout.showTabbar || tabs.length === 0) return null;

  const move = (key: string, toIndex: number): void => shell.tabs.reorder(key, toIndex);
  const openMenu = (key: string, x: number, y: number): void => setAnchor({ key, x, y });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>, key: string, index: number): void => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      openMenu(key, box.left, box.bottom);
    } else if (tabbar.draggable && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      move(key, index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  };

  const onDrop = (event: DragEvent, target: string): void => {
    event.preventDefault();
    const source = dragKey;
    setDragKey(null);
    setDropKey(null);
    const to = tabs.findIndex(tab => tab.key === target);
    if (source && source !== target && to >= 0) move(source, to);
  };

  const onAuxClick = (event: MouseEvent, key: string, pinned: boolean): void => {
    if (event.button === 1 && tabbar.middleClickToClose && !pinned) {
      event.preventDefault();
      shell.closeTab(key);
    }
  };

  const onWheel = (event: WheelEvent<HTMLUListElement>): void => {
    if (tabbar.wheelable) scroller.current?.scrollBy?.({ left: event.deltaY });
  };

  return (
    <nav
      className='admin-tabbar'
      data-style={tabbar.styleType}
      aria-label={t('tabbar.label')}
      data-testid='admin-tabbar'
    >
      {tabbar.visitHistory && <HistoryMenu />}
      <ul ref={scroller} className='admin-tabbar-scroll' onWheel={onWheel}>
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey;
          const icon = findMenuPath(menu, tab.url).at(-1)?.icon;
          return (
            <li
              key={tab.key}
              className='admin-tab'
              data-active={active}
              data-pinned={tab.pinned}
              data-dragging={dragKey === tab.key}
              data-drop-target={dropKey === tab.key && dragKey !== tab.key}
              data-testid='admin-tab'
              draggable={tabbar.draggable}
              onContextMenu={event => {
                event.preventDefault();
                openMenu(tab.key, event.clientX, event.clientY);
              }}
              onMouseDown={event => event.button === 1 && tabbar.middleClickToClose && event.preventDefault()}
              onAuxClick={event => onAuxClick(event, tab.key, tab.pinned)}
              onDragStart={event => {
                event.dataTransfer?.setData('text/plain', tab.key);
                setDragKey(tab.key);
              }}
              onDragOver={event => {
                if (dragKey === null) return;
                event.preventDefault();
                setDropKey(tab.key);
              }}
              onDrop={event => onDrop(event, tab.key)}
              onDragEnd={() => {
                setDragKey(null);
                setDropKey(null);
              }}
            >
              <a
                className='admin-tab-title'
                href={tab.url}
                aria-current={active ? 'page' : undefined}
                title={tab.title}
                onClick={event => interceptNavigation(event, () => shell.activateTab(tab.key))}
                onKeyDown={event => onKeyDown(event, tab.key, index)}
              >
                {tab.pinned && <Pin size={12} aria-hidden='true' />}
                {tabbar.showIcon && icon}
                <span>{tab.title}</span>
              </a>
              {!tab.pinned && (
                <button
                  type='button'
                  className='admin-tab-close'
                  aria-label={`${t('tabbar.close')}：${tab.title}`}
                  data-testid='admin-tab-close'
                  onClick={() => shell.closeTab(tab.key)}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {anchor && <TabContextMenu anchor={anchor} onClose={closeMenu} />}
    </nav>
  );
}
