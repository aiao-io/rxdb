import { useEffect, useRef } from 'react';

/** 右键菜单里的一项（与 Angular 参考实现的类型逐字段一致）。 */
export interface WorkingTreeContextMenuItem {
  /** 页面上按它分发动作的键；分隔线占位项也用（互不重复即可）。 */
  readonly id: string;
  readonly label: string;
  /** 危险操作（丢弃）用红色字。 */
  readonly danger?: boolean;
  /** e2e 锚点；只有带测试语义的项才给。 */
  readonly testId?: string;
  /** 分隔线占位项：不渲染按钮（GitHub Desktop 菜单里动作与复制之间的横线）。 */
  readonly separator?: boolean;
}

/** 右键菜单的开合状态：位置 + 菜单项。 */
export interface WorkingTreeContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly WorkingTreeContextMenuItem[];
}

/** 菜单的预估尺寸；位置按它夹回视口内。 */
const MENU_WIDTH = 208;
const ITEM_HEIGHT = 30;
const SEPARATOR_HEIGHT = 9;

interface WorkingTreeContextMenuProps {
  readonly menu: WorkingTreeContextMenuState | null;
  readonly onCloseRequested: () => void;
  readonly onItemSelected: (item: WorkingTreeContextMenuItem) => void;
}

/**
 * GitHub Desktop 形态的右键菜单。
 *
 * @remarks
 * 内联渲染（fixed 定位在本页面 DOM 里），形态与分支下拉同源：透明背板点哪都关，
 * Escape 走 document 级监听。菜单项是 `<button role="menuitem">`，键盘可达。
 * 位置按视口夹回：贴边右键时菜单不会伸出窗口（GitHub Desktop 的同款行为）。
 */
export function WorkingTreeContextMenu({
  menu,
  onCloseRequested,
  onItemSelected
}: WorkingTreeContextMenuProps): React.JSX.Element | null {
  // Escape 走 document 级监听而不是挂在背板 div 上：焦点在菜单的任意子元素上时
  // 事件都能冒泡到 document（与 Angular 参考实现同一个理由）。
  //
  // 监听器与 Angular 的 `@HostListener` 同款：组件生命周期内**常驻**，回调里再查
  // menu 是否开着——当前值走 ref，而不是把 `onCloseRequested`（页面每次 render
  // 重建的内联箭头）放进依赖数组。放进依赖的话，页面每重渲染一次监听器就被摘掉
  // 重挂一次，重挂若与 React 的 effect flush 交错，会出现「菜单还开着、监听器
  // 却没了」的窗口（e2e 实测复现：右键菜单开着时按 Escape 有概率关不掉）。
  const menuRef = useRef(menu);
  const closeRequestedRef = useRef(onCloseRequested);
  useEffect(() => {
    menuRef.current = menu;
    closeRequestedRef.current = onCloseRequested;
  });
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && menuRef.current !== null) closeRequestedRef.current();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
    // 挂载时挂一次、卸载时摘掉；开合状态不参与（与 Angular 的 HostListener 同构）。
  }, []);

  if (menu === null) return null;

  const clampedX = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8));
  const height =
    menu.items.reduce((total, item) => total + (item.separator === true ? SEPARATOR_HEIGHT : ITEM_HEIGHT), 0) + 12;
  const clampedY = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));

  return (
    <>
      {/* 点外面关闭的透明背板（与分支菜单同一种形态） */}
      <div
        className='fixed inset-0 z-40'
        onClick={onCloseRequested}
        onKeyDown={event => {
          if (event.key === 'Escape') onCloseRequested();
        }}
        aria-label='Close context menu'
        role='button'
        tabIndex={0}
      ></div>
      <div
        className='gd-menu fixed z-50 py-1'
        style={{ left: clampedX, top: clampedY, width: MENU_WIDTH }}
        aria-label='Context menu'
        role='menu'
      >
        {menu.items.map(item =>
          item.separator === true ?
            <div className='gd-menu-divider' key={item.id} role='separator' />
          : <button
              className={`gd-menu-row ${item.danger === true ? 'gd-btn-danger' : ''}`}
              data-testid={item.testId ?? undefined}
              key={item.id}
              onClick={() => onItemSelected(item)}
              role='menuitem'
              type='button'
            >
              {item.label}
            </button>
        )}
      </div>
    </>
  );
}
