import { type MenuNode } from '@aiao/rxdb-admin';
import { ChevronDown, Menu } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { HeaderWidgets } from '../widgets/header-widgets.js';
import { interceptNavigation } from './menu-tree.js';
import { Brand } from './sidebar.js';

type Node = MenuNode<ReactNode>;

function HeaderLink({ node }: { node: Node }): ReactElement {
  const shell = useAdminShell();
  const url = useAdminStore(shell.currentUrl);
  const route = node.route as string;
  const active = route === '/' ? url === '/' : url === route || url.startsWith(`${route}/`);
  return (
    <a
      href={route}
      className={active ? 'btn btn-ghost btn-sm btn-active' : 'btn btn-ghost btn-sm'}
      aria-current={active ? 'page' : undefined}
      data-testid={node.testId ?? 'admin-header-link'}
      onClick={event => interceptNavigation(event, () => shell.navigate(route))}
    >
      {node.icon}
      {node.label}
    </a>
  );
}

function HeaderGroup({ node }: { node: Node }): ReactElement {
  return (
    <div className='dropdown dropdown-hover'>
      <div tabIndex={0} role='button' className='btn btn-ghost btn-sm'>
        {node.icon}
        {node.label}
        <ChevronDown size={14} />
      </div>
      <ul tabIndex={0} className='dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow'>
        {(node.children ?? []).map(child => (
          <li key={child.id}>
            <HeaderLink node={child} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 顶部导航的水平菜单：分组悬停展开子项。
 * @param props - 菜单树。
 * @returns 菜单元素。
 */
export function HeaderMenu({ nodes }: { nodes: readonly Node[] }): ReactElement {
  const t = useAdminText();
  return (
    <nav className='admin-header-menu' aria-label={t('layout.navigation')} data-testid='admin-header-menu'>
      {nodes.map(node =>
        node.children?.length ? <HeaderGroup key={node.id} node={node} /> : <HeaderLink key={node.id} node={node} />
      )}
    </nav>
  );
}

/**
 * 面包屑：当前页在菜单中的路径。
 * @returns 面包屑元素；偏好关闭、只有一级且要求隐藏、或没有匹配时为空。
 */
export function Breadcrumb(): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const items = useAdminStore(shell.breadcrumb);
  const { breadcrumb } = useAdminStore(shell.preferences);
  if (!breadcrumb.enable || items.length === 0 || (breadcrumb.hideOnlyOne && items.length <= 1)) return null;
  return (
    <nav aria-label={t('layout.breadcrumb')} data-testid='admin-breadcrumb'>
      <ol className='admin-breadcrumb' data-style={breadcrumb.styleType}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.id}>
              {item.route && !last ?
                <a
                  className='admin-breadcrumb-item link link-hover'
                  href={item.route}
                  onClick={event => interceptNavigation(event, () => shell.navigate(item.route as string))}
                >
                  {breadcrumb.showIcon && item.icon}
                  {item.label}
                </a>
              : <span className='admin-breadcrumb-item' aria-current={last ? 'page' : undefined}>
                  {breadcrumb.showIcon && item.icon}
                  {item.label}
                </span>
              }
              {!last && (
                <span className='admin-breadcrumb-sep' aria-hidden='true'>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** {@link Header} 的属性。 */
export interface HeaderProps {
  /** 菜单树（顶部导航模式渲染为水平菜单）。 */
  readonly menu: readonly Node[];
  /** 品牌图标。 */
  readonly brandIcon?: ReactNode;
  /** 顶栏部件区之前的扩展内容。 */
  readonly start?: ReactNode;
  /** 顶栏部件区之后的扩展内容。 */
  readonly end?: ReactNode;
}

/**
 * 顶栏：菜单开关、品牌（顶栏布局时）、水平菜单、面包屑与部件。
 * @param props - 菜单与扩展槽。
 * @returns 顶栏元素；内容最大化时为空。
 */
export function Header({ menu, brandIcon, start, end }: HeaderProps): ReactElement | null {
  const shell = useAdminShell();
  const t = useAdminText();
  const layout = useAdminStore(shell.layout);
  const ui = useAdminStore(shell.ui);
  const prefs = useAdminStore(shell.preferences);
  const isDark = useAdminStore(shell.theme.isDark);
  if (!layout.showHeader) return null;
  const semiDark = layout.semiDarkHeader && !isDark ? shell.theme.darkName : undefined;
  const expanded = shell.isMobile.value ? ui.drawerOpen : !layout.sidebarCollapsed;

  return (
    <header
      className='admin-header'
      data-menu-align={prefs.header.menuAlign}
      data-theme={semiDark}
      data-testid='admin-header'
    >
      {layout.showMenuToggle && (
        <button
          type='button'
          className='btn btn-ghost btn-sm btn-square'
          aria-label={t('layout.toggleMenu')}
          aria-expanded={expanded}
          aria-controls='admin-sidebar'
          data-testid='admin-menu-toggle'
          onClick={() => shell.toggleSidebar()}
        >
          <Menu size={18} />
        </button>
      )}
      {layout.brandInHeader && <Brand icon={brandIcon} />}
      {layout.headerMenu && <HeaderMenu nodes={menu} />}
      {layout.showBreadcrumb && <Breadcrumb />}
      <div className='admin-header-spacer' />
      {start}
      <HeaderWidgets />
      {end}
    </header>
  );
}
