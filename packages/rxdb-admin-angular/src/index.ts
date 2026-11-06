/**
 * RxDB Admin Angular - 后台外壳的 Angular 绑定
 * 布局（侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚）、偏好抽屉、命令面板、锁屏与水印，
 * 全部由 `@aiao/rxdb-admin` 的外壳运行时驱动；与 React / Vue 绑定同功能同 DOM 契约（共享 `admin.css`）。
 * @module @aiao/rxdb-admin-angular
 */
export {
  ADMIN_SHELL,
  injectAdminShell,
  injectAdminStore,
  injectAdminText,
  provideAdminShell,
  type AdminIcon
} from './context';
export { AdminLayoutComponent } from './layout/admin-layout.component';
export { AdminPageDirective } from './layout/admin-page.directive';
export { AdminBrandComponent } from './layout/brand.component';
export { AdminBreadcrumbComponent } from './layout/breadcrumb.component';
export { AdminFooterComponent } from './layout/footer.component';
export { AdminHeaderMenuComponent } from './layout/header-menu.component';
export { AdminHeaderComponent } from './layout/header.component';
export { interceptNavigation } from './layout/intercept-navigation';
export { AdminMenuTreeComponent, type MenuExtraContext, type MenuExtraTemplate } from './layout/menu-tree.component';
export { AdminSidebarComponent } from './layout/sidebar.component';
export { AdminLockScreenComponent } from './lock/lock-screen.component';
export { AdminCommandPaletteComponent } from './palette/command-palette.component';
export { AdminPreferencesDrawerComponent } from './preferences/preferences-drawer.component';
export { AdminTabbarComponent } from './tabbar/tabbar.component';
export { AdminWatermarkComponent } from './watermark.component';
export { AdminHeaderWidgetsComponent } from './widgets/header-widgets.component';
