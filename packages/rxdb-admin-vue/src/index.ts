/**
 * rxdb-admin-vue - 后台外壳的 Vue 绑定
 *
 * 把无头核心 `@aiao/rxdb-admin` 的 `AdminShell` 绑定为 Vue 组件：布局（侧栏 / 顶栏 / 页签栏 / 页脚）、偏好抽屉、
 * 命令面板、锁屏与水印。命名、DOM 结构、CSS 类名与 `data-testid` 与 React / Angular 绑定一致，样式共用
 * `@aiao/rxdb-admin/admin.css`。菜单图标是 Vue 组件（`AdminShell<Component>`）。
 *
 * @packageDocumentation
 */

export { useAdminShell, useAdminStore, useAdminText } from './context.js';
export { interceptNavigation } from './layout/intercept-navigation.js';
export type {
  AdminLayoutProps,
  AdminShellProviderProps,
  BrandProps,
  HeaderProps,
  MenuTreeProps,
  RenderMenuExtra,
  SidebarProps
} from './types.js';

/** 为子树提供外壳，并在挂载期间把外壳绑定到浏览器（快捷键、主题、布局变量、标题）。 */
export { default as AdminShellProvider } from './admin-shell-provider.vue';
/** 后台外壳布局：侧栏 / 顶栏 / 页签栏 / 内容区 / 页脚，外加偏好抽屉、命令面板、锁屏与水印。 */
export { default as AdminLayout } from './layout/admin-layout.vue';
/** 品牌区：Logo 图片、图标与应用名，点击回首页。 */
export { default as Brand } from './layout/brand.vue';
/** 面包屑：当前页在菜单中的路径。 */
export { default as Breadcrumb } from './layout/breadcrumb.vue';
/** 页脚：版权信息与备案号。 */
export { default as Footer } from './layout/footer.vue';
/** 顶栏：菜单开关、品牌、水平菜单、面包屑与部件。 */
export { default as Header } from './layout/header.vue';
/** 顶部导航的水平菜单：分组悬停展开子项。 */
export { default as HeaderMenu } from './layout/header-menu.vue';
/** 侧栏菜单树：分组可折叠，当前页高亮，折叠为图标轨时压平。 */
export { default as MenuTree } from './layout/menu-tree.vue';
/** 侧栏：品牌、菜单树、折叠按钮、宽度拖拽；折叠时可悬停展开，移动端是抽屉。 */
export { default as Sidebar } from './layout/sidebar.vue';
/** 锁屏：模态 `<dialog>` 遮住界面，Esc 不能关闭。 */
export { default as LockScreen } from './lock/lock-screen.vue';
/** 命令面板：聚合菜单、命令与应用注册的来源，键盘上下选择、回车执行。 */
export { default as CommandPalette } from './palette/command-palette.vue';
/** 偏好抽屉：由 schema 驱动的五个页签，页脚提供重置 / 复制 / 导入配置。 */
export { default as PreferencesDrawer } from './preferences/preferences-drawer.vue';
/** 页签栏：多页签、固定、拖拽 / 键盘排序、右键菜单、中键关闭、滚轮横向滚动。 */
export { default as Tabbar } from './tabbar/tabbar.vue';
/** 水印：平铺的旋转文字覆盖层，不拦截任何交互。 */
export { default as Watermark } from './watermark.vue';
/** 顶栏部件区：按偏好的顺序与显隐渲染。 */
export { default as HeaderWidgets } from './widgets/header-widgets.vue';
