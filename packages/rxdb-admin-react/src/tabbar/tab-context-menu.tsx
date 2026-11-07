import { useEffect, useRef, type ReactElement, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/** 右键菜单的锚点：屏幕坐标与目标页签。 */
export interface TabMenuAnchor {
  /** 屏幕 X。 */
  readonly x: number;
  /** 屏幕 Y。 */
  readonly y: number;
  /** 目标页签键。 */
  readonly key: string;
}

interface Item {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

/**
 * 页签右键菜单：关闭 / 刷新 / 固定 / 新窗口 / 关闭一侧 / 关闭其他 / 关闭全部 / 内容最大化。
 * @param props - 锚点与关闭回调。
 * @returns 菜单元素。
 */
export function TabContextMenu({ anchor, onClose }: { anchor: TabMenuAnchor; onClose: () => void }): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const { tabs } = useAdminStore(shell.tabs);
  const ui = useAdminStore(shell.ui);
  const { tabbar } = useAdminStore(shell.preferences);
  const ref = useRef<HTMLDivElement>(null);
  const index = tabs.findIndex(tab => tab.key === anchor.key);
  const tab = tabs[index];

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const dismiss = (event: Event): void => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  if (!tab) return <></>;
  const others = tabs.filter(candidate => candidate.key !== anchor.key && !candidate.pinned);
  const items: Item[] = [
    { id: 'close', label: t('tabbar.close'), disabled: tab.pinned, run: () => shell.closeTab(anchor.key) },
    {
      id: 'reload',
      label: t('tabbar.reload'),
      run: () => {
        shell.activateTab(anchor.key);
        shell.ui.refresh();
      }
    },
    { id: 'pin', label: tab.pinned ? t('tabbar.unpin') : t('tabbar.pin'), run: () => shell.tabs.togglePin(anchor.key) },
    { id: 'openNew', label: t('tabbar.openNew'), run: () => shell.openTabInNewWindow(anchor.key) },
    {
      id: 'closeLeft',
      label: t('tabbar.closeLeft'),
      disabled: !tabs.slice(0, index).some(candidate => !candidate.pinned),
      run: () => shell.closeLeftTabs(anchor.key)
    },
    {
      id: 'closeRight',
      label: t('tabbar.closeRight'),
      disabled: !tabs.slice(index + 1).some(candidate => !candidate.pinned),
      run: () => shell.closeRightTabs(anchor.key)
    },
    {
      id: 'closeOthers',
      label: t('tabbar.closeOthers'),
      disabled: others.length === 0,
      run: () => shell.closeOtherTabs(anchor.key)
    },
    {
      id: 'closeAll',
      label: t('tabbar.closeAll'),
      disabled: !tabs.some(candidate => !candidate.pinned),
      run: () => shell.closeAllTabs()
    },
    ...(tabbar.showMaximize ?
      [
        {
          id: 'maximize',
          label: ui.maximized ? t('tabbar.restore') : t('tabbar.maximize'),
          run: () => shell.ui.toggleMaximize()
        }
      ]
    : [])
  ];

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    const delta =
      event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
      : 0;
    if (delta === 0) return;
    event.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className='admin-context-menu'
      role='menu'
      aria-label={tab.title}
      data-testid='admin-tab-menu'
      style={{ left: Math.min(anchor.x, window.innerWidth - 190), top: Math.min(anchor.y, window.innerHeight - 330) }}
      onKeyDown={onKeyDown}
    >
      <ul className='menu menu-sm p-0'>
        {items.map(item => (
          <li key={item.id} className={item.disabled ? 'menu-disabled' : undefined}>
            <button
              type='button'
              role='menuitem'
              disabled={item.disabled}
              data-testid={`admin-tab-menu-${item.id}`}
              onClick={() => {
                onClose();
                item.run();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
