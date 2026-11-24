/** 一个标签：当前地址加自己的前进后退栈；`pinned` 标签固定在最左侧，只显示站点图标、没有关闭钮。 */
export interface SafariTab {
  readonly url: string;
  readonly history: readonly string[];
  readonly index: number;
  readonly pinned: boolean;
}

/** 每个标签一个新对象：模板按对象身份区分标签，共用同一个对象会撞键。 */
export const blankTab = (): SafariTab => ({ url: '', history: [''], index: 0, pinned: false });

/**
 * 把 `from` 处的标签挪到 `to` 处（在它之前插入）。固定标签只能在固定区里移动，
 * 普通标签不能越过固定区；`from === to` 或下标越界时原样返回。其余标签保持对象身份。
 */
export function moveTab(tabs: readonly SafariTab[], from: number, to: number): readonly SafariTab[] {
  if (from < 0 || from >= tabs.length || from === to) return tabs;
  const tab = tabs[from];
  const pinnedCount = tabs.reduce((count, item) => count + (item.pinned ? 1 : 0), 0);
  const lo = tab.pinned ? 0 : pinnedCount;
  const hi = tab.pinned ? pinnedCount - 1 : tabs.length - 1;
  const clamped = Math.max(lo, Math.min(to, hi));
  const at = from < clamped ? clamped - 1 : clamped;
  const rest = tabs.filter((_, index) => index !== from);
  return [...rest.slice(0, at), tab, ...rest.slice(at)];
}

/**
 * 切换 `at` 处标签的固定状态：固定标签整体排到最前（组内保持原有顺序），其余标签保持对象身份；
 * 状态相同或下标越界时原样返回。
 */
export function setTabPinned(tabs: readonly SafariTab[], at: number, pinned: boolean): readonly SafariTab[] {
  if (at < 0 || at >= tabs.length || tabs[at].pinned === pinned) return tabs;
  const patched = tabs.map((tab, index) => (index === at ? { ...tab, pinned } : tab));
  return [...patched.filter(tab => tab.pinned), ...patched.filter(tab => !tab.pinned)];
}
