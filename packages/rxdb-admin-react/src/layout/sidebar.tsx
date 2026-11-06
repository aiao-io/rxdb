import type { MenuNode } from '@aiao/rxdb-admin';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  useRef,
  useState,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { interceptNavigation, MenuTree, type RenderMenuExtra } from './menu-tree.js';

const RESIZE_STEP = 16;

/** {@link Brand} 的属性。 */
export interface BrandProps {
  /** 没有 Logo 图片时显示的图标。 */
  readonly icon?: ReactNode;
}

/**
 * 品牌区：Logo 图片、图标与应用名，点击回首页。
 * @param props - 图标。
 * @returns 品牌元素；偏好关闭 Logo 时为空。
 */
export function Brand({ icon }: BrandProps): ReactElement | null {
  const shell = useAdminShell();
  const { logo } = useAdminStore(shell.preferences);
  if (!logo.enable) return null;
  return (
    <a
      className='admin-brand'
      href={shell.homeUrl}
      aria-label={shell.brandTitle}
      onClick={event => interceptNavigation(event, () => shell.navigate(shell.homeUrl))}
    >
      {logo.source ?
        <img className='admin-brand-logo' src={logo.source} alt='' />
      : icon}
      {(logo.showText || !logo.source) && <span className='admin-brand-text'>{shell.brandTitle}</span>}
    </a>
  );
}

function SidebarResizer(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const { sidebar } = useAdminStore(shell.preferences);
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: 0, width: 0 });

  const resizeTo = (width: number): void => shell.preferences.setPath('sidebar.width', width);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    origin.current = { x: event.clientX, width: sidebar.width };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragging) resizeTo(origin.current.width + event.clientX - origin.current.x);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const delta =
      event.key === 'ArrowRight' ? RESIZE_STEP
      : event.key === 'ArrowLeft' ? -RESIZE_STEP
      : 0;
    if (delta === 0) return;
    event.preventDefault();
    resizeTo(sidebar.width + delta);
  };

  return (
    <div
      className='admin-sidebar-resizer'
      role='separator'
      aria-orientation='vertical'
      aria-label={t('layout.resize')}
      aria-valuenow={sidebar.width}
      aria-valuemin={160}
      aria-valuemax={320}
      tabIndex={0}
      data-dragging={dragging}
      data-testid='admin-sidebar-resizer'
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={onKeyDown}
    />
  );
}

/** {@link Sidebar} 的属性。 */
export interface SidebarProps {
  /** 菜单树。 */
  readonly menu: readonly MenuNode<ReactNode>[];
  /** 品牌图标。 */
  readonly brandIcon?: ReactNode;
  /** 菜单项右侧附加内容。 */
  readonly renderMenuExtra?: RenderMenuExtra;
}

/**
 * 侧栏：品牌、菜单树、折叠按钮、宽度拖拽；折叠时可悬停展开，移动端是抽屉。
 * @param props - 菜单与品牌。
 * @returns 侧栏元素；布局不需要侧栏时为空。
 */
export function Sidebar({ menu, brandIcon, renderMenuExtra }: SidebarProps): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const layout = useAdminStore(shell.layout);
  const ui = useAdminStore(shell.ui);
  const prefs = useAdminStore(shell.preferences);
  const isDark = useAdminStore(shell.theme.isDark);
  const mobile = useAdminStore(shell.isMobile);
  if (!layout.showSidebar) return null;

  const collapsed = layout.sidebarCollapsed;
  const hoverExpanded = collapsed && ui.hoverExpanded;
  const semiDark = layout.semiDarkSidebar && !isDark ? shell.theme.darkName : undefined;
  const rail = collapsed && !hoverExpanded;

  return (
    <>
      <div className='admin-sidebar-slot'>
        <aside
          id='admin-sidebar'
          className='admin-sidebar'
          aria-label={t('layout.navigation')}
          data-testid='admin-sidebar'
          data-collapsed={collapsed}
          data-hover-expanded={hoverExpanded}
          data-open={ui.drawerOpen}
          data-show-title={prefs.sidebar.collapsedShowTitle}
          data-theme={semiDark}
          onMouseEnter={() => collapsed && prefs.sidebar.expandOnHover && shell.ui.setHoverExpanded(true)}
          onMouseLeave={() => shell.ui.setHoverExpanded(false)}
        >
          {!layout.brandInHeader && <Brand icon={brandIcon} />}
          <div className='admin-sidebar-body'>
            <MenuTree nodes={menu} rail={rail} {...(renderMenuExtra ? { extra: renderMenuExtra } : {})} />
          </div>
          {!mobile && (
            <div className='admin-sidebar-footer'>
              <button
                type='button'
                className='btn btn-ghost btn-sm btn-square'
                aria-label={collapsed ? t('layout.expand') : t('layout.collapse')}
                aria-expanded={!collapsed}
                aria-controls='admin-sidebar'
                data-testid='admin-sidebar-toggle'
                onClick={() => shell.toggleSidebar()}
              >
                {collapsed ?
                  <PanelLeftOpen size={16} />
                : <PanelLeftClose size={16} />}
              </button>
            </div>
          )}
          {prefs.sidebar.draggable && !collapsed && !mobile && <SidebarResizer />}
        </aside>
      </div>
      <div
        className='admin-backdrop'
        data-open={ui.drawerOpen}
        aria-hidden='true'
        onClick={() => shell.ui.setDrawer(false)}
      />
    </>
  );
}
