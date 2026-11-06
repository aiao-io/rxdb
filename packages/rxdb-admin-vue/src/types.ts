import type { AdminShell, MenuNode } from '@aiao/rxdb-admin';
import type { Component } from 'vue';

/** {@link AdminShellProvider} 的属性。 */
export interface AdminShellProviderProps {
  /** 由 `createAdminShell` 创建的外壳，图标类型为 Vue 组件；挂载期间不可替换（需要替换时给 Provider 加 `key` 重建）。 */
  readonly shell: AdminShell<Component>;
}

/** {@link AdminLayout} 的属性；路由出口是默认插槽，其余扩展点见插槽签名。 */
export interface AdminLayoutProps {
  /** 导航菜单。 */
  readonly menu: readonly MenuNode<Component>[];
  /** 当前路由地址（路径 + 查询串），路由变化时外壳据此同步页签、标题与面包屑。 */
  readonly url: string;
  /** 导航进行中（懒加载路由、loader），驱动顶部进度条与加载遮罩。 */
  readonly navigating?: boolean;
}

/**
 * 菜单项右侧附加内容（徽标、计数）的作用域插槽签名，对应 React 的 `renderMenuExtra`。
 * 在 {@link AdminLayout} / {@link Sidebar} 上插槽名是 `menu-extra`，在 {@link MenuTree} 上是 `extra`。
 */
export type RenderMenuExtra = (props: { readonly node: MenuNode<Component> }) => unknown;

/** {@link Sidebar} 的属性；品牌图标与菜单项附加内容走 `brand-icon` / `menu-extra` 插槽。 */
export interface SidebarProps {
  /** 菜单树。 */
  readonly menu: readonly MenuNode<Component>[];
}

/** {@link Brand} 的属性：Vue 版没有属性，没有 Logo 图片时显示的图标走 `icon` 插槽。 */
export type BrandProps = Record<string, never>;

/** {@link MenuTree} 的属性；菜单项右侧附加内容走 `extra` 插槽。 */
export interface MenuTreeProps {
  /** 菜单树。 */
  readonly nodes: readonly MenuNode<Component>[];
  /** 折叠为图标轨（只渲染叶子的图标）。 */
  readonly rail: boolean;
}

/** {@link Header} 的属性；品牌图标与扩展内容走 `brand-icon` / `start` / `end` 插槽。 */
export interface HeaderProps {
  /** 菜单树（顶部导航模式渲染为水平菜单）。 */
  readonly menu: readonly MenuNode<Component>[];
}
