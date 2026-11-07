import type { LayoutState } from '../layout/layout-state.js';

/** 根节点（`<html>`）的最小契约。 */
export interface RootTarget {
  /** 设置属性。 */
  setAttribute(name: string, value: string): void;
  /** 移除属性。 */
  removeAttribute(name: string): void;
  /** 内联样式。 */
  readonly style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): string;
  };
}

/**
 * 布局写入根节点的 CSS 变量，样式表与三端壳共用同一份数值。
 * @param layout - 推导出的布局。
 * @returns 变量名到值。
 */
export function computeLayoutVars(layout: LayoutState): Record<string, string> {
  const { top, right, bottom, left } = layout.contentPadding;
  return {
    '--admin-sidebar-width': `${layout.sidebarWidth}px`,
    '--admin-sidebar-expanded-width': `${layout.sidebarExpandedWidth}px`,
    '--admin-header-height': `${layout.headerHeight}px`,
    '--admin-footer-height': `${layout.footerHeight}px`,
    '--admin-content-max-width': layout.contentMaxWidth === null ? 'none' : `${layout.contentMaxWidth}px`,
    '--admin-content-padding': `${top}px ${right}px ${bottom}px ${left}px`
  };
}

/** 增量写入根节点属性与样式的绑定。 */
export interface RootBinding {
  /**
   * 写入属性与样式；上一次写过而这次没有的会被移除。
   * @param attributes - 属性。
   * @param style - 样式（自定义属性或普通 CSS 属性名）。
   */
  apply(attributes: Readonly<Record<string, string>>, style: Readonly<Record<string, string>>): void;
  /** 移除写入过的全部属性与样式。 */
  clear(): void;
}

/**
 * 创建根节点绑定。
 * @param root - 根节点。
 * @returns 绑定。
 */
export function createRootBinding(root: RootTarget): RootBinding {
  let attributes = new Set<string>();
  let properties = new Set<string>();
  const apply: RootBinding['apply'] = (nextAttributes, nextStyle) => {
    for (const name of attributes) if (!(name in nextAttributes)) root.removeAttribute(name);
    for (const name of properties) if (!(name in nextStyle)) root.style.removeProperty(name);
    for (const [name, value] of Object.entries(nextAttributes)) root.setAttribute(name, value);
    for (const [name, value] of Object.entries(nextStyle)) root.style.setProperty(name, value);
    attributes = new Set(Object.keys(nextAttributes));
    properties = new Set(Object.keys(nextStyle));
  };
  return { apply, clear: () => apply({}, {}) };
}
