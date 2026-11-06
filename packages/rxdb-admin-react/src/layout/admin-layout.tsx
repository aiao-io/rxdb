import { menuTitleOf, type MenuNode } from '@aiao/rxdb-admin';
import { useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { LockScreen } from '../lock/lock-screen.js';
import { CommandPalette } from '../palette/command-palette.js';
import { PreferencesDrawer } from '../preferences/preferences-drawer.js';
import { Tabbar } from '../tabbar/tabbar.js';
import { Watermark } from '../watermark.js';
import { Footer } from './footer.js';
import { Header } from './header.js';
import type { RenderMenuExtra } from './menu-tree.js';
import { Sidebar } from './sidebar.js';

/** {@link AdminLayout} 的属性。 */
export interface AdminLayoutProps {
  /** 导航菜单。 */
  readonly menu: readonly MenuNode<ReactNode>[];
  /** 当前路由地址（路径 + 查询串），路由变化时外壳据此同步页签、标题与面包屑。 */
  readonly url: string;
  /** 路由出口。 */
  readonly children: ReactNode;
  /** 导航进行中（懒加载路由、loader），驱动顶部进度条与加载遮罩。 */
  readonly navigating?: boolean;
  /** 品牌图标（没有 Logo 图片时显示）。 */
  readonly brandIcon?: ReactNode;
  /** 菜单项右侧附加内容，如数量徽标。 */
  readonly renderMenuExtra?: RenderMenuExtra;
  /** 顶栏部件区之前的扩展内容。 */
  readonly headerStart?: ReactNode;
  /** 顶栏部件区之后的扩展内容。 */
  readonly headerEnd?: ReactNode;
}

function restartEnterAnimation(element: HTMLElement): void {
  element.removeAttribute('data-entering');
  void element.offsetWidth;
  element.setAttribute('data-entering', 'true');
}

/**
 * 后台外壳布局：侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚，外加偏好抽屉、命令面板、锁屏与水印。
 * 布局模式、尺寸、显隐全部由外壳偏好驱动；路由库无关，应用只需传入当前地址并在 `navigate` 回调里跳转。
 * @param props - 菜单、当前地址、路由出口与扩展槽。
 * @returns 外壳元素。
 */
export function AdminLayout({
  menu,
  url,
  children,
  navigating = false,
  brandIcon,
  renderMenuExtra,
  headerStart,
  headerEnd
}: AdminLayoutProps): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const layout = useAdminStore(shell.layout);
  const ui = useAdminStore(shell.ui);
  const prefs = useAdminStore(shell.preferences);
  const mobile = useAdminStore(shell.isMobile);
  const pageTitle = menuTitleOf(menu, url) ?? shell.brandTitle;
  const page = useRef<HTMLDivElement>(null);
  const lastPath = useRef(url.split(/[?#]/, 1)[0]);

  useLayoutEffect(() => shell.setMenu(menu), [shell, menu]);
  useLayoutEffect(() => shell.syncRoute(url), [shell, url]);
  useEffect(() => shell.ui.setNavigating(navigating), [shell, navigating]);

  useEffect(() => {
    const path = url.split(/[?#]/, 1)[0];
    if (path !== lastPath.current && page.current) restartEnterAnimation(page.current);
    lastPath.current = path;
  }, [url]);

  return (
    <div
      id='layout-main'
      className='admin-shell'
      data-layout={layout.mode}
      data-mobile={mobile}
      data-maximized={ui.maximized}
      data-testid='admin-shell'
    >
      <a className='btn btn-primary btn-sm admin-skip-link' href='#layout-content'>
        {t('layout.skipToContent')}
      </a>
      <Sidebar menu={menu} {...(brandIcon ? { brandIcon } : {})} {...(renderMenuExtra ? { renderMenuExtra } : {})} />
      <div id='layout-container' className='admin-main'>
        <Header
          menu={menu}
          {...(brandIcon ? { brandIcon } : {})}
          {...(headerStart ? { start: headerStart } : {})}
          {...(headerEnd ? { end: headerEnd } : {})}
        />
        <Tabbar />
        <main id='layout-content' className='admin-content' tabIndex={-1}>
          <h1 className='admin-sr-only' data-testid='admin-page-title'>
            {pageTitle}
          </h1>
          {prefs.transition.progress && ui.navigating && (
            <div className='admin-progress' role='progressbar' aria-label={t('layout.loading')} />
          )}
          {prefs.transition.loading && ui.navigating && (
            <div className='admin-loading-mask' data-testid='admin-loading-mask'>
              <span className='loading loading-spinner loading-lg' aria-label={t('layout.loading')} />
            </div>
          )}
          <div key={ui.refreshKey} ref={page} className='admin-page' data-testid='admin-page'>
            {children}
          </div>
        </main>
        <Footer />
      </div>
      <Watermark />
      <PreferencesDrawer />
      <CommandPalette />
      <LockScreen />
    </div>
  );
}
