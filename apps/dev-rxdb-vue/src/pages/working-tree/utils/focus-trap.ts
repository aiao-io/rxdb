/**
 * @fileoverview 对话框外壳的焦点陷阱：可聚焦元素的判定、Tab 首尾回绕与关闭时还焦点（纯 DOM，三端同名移植）。
 */

/** 候选：天然进 Tab 序列的控件，加上写了 `tabindex` 的元素（滚动区、`role="button"` 的 div）。 */
const TABBABLE_CANDIDATES = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]'
].join(', ');

/**
 * 容器里能用 Tab 走到的元素。
 *
 * @param container - 对话框面板
 * @returns 按文档顺序，不含容器本身
 *
 * @remarks
 * 候选是带 `href` 的链接、按钮、输入框（`type="hidden"` 除外）、下拉、文本域、可编辑区，以及写了 `tabindex`
 * 的元素。候选里再去掉三种：写了负 `tabindex` 的（只能脚本聚焦，面板自己就是）、禁用的（`:disabled`）、
 * 看不见的（`checkVisibility`：自身或祖先 `display: none`、`visibility: hidden`）。
 * 不按正 `tabindex` 重排：demo 里没有正 `tabindex`。
 */
export const tabbableIn = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_CANDIDATES)).filter(
    element =>
      (!element.hasAttribute('tabindex') || element.tabIndex >= 0) &&
      !element.matches(':disabled') &&
      element.checkVisibility({ visibilityProperty: true })
  );

/** 焦点陷阱要读的那几样：原生 `KeyboardEvent` 与 React 的合成键盘事件都满足。 */
export type TabKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'target' | 'preventDefault'>;

/** Tab 回绕的落点；不在首尾时是 `null`，交给浏览器。 */
const wrapTargetOf = (panel: HTMLElement, tabbable: readonly HTMLElement[], event: TabKeyEvent): HTMLElement | null => {
  if (tabbable.length === 0) return panel;
  const first = tabbable[0];
  const last = tabbable[tabbable.length - 1];
  if (event.shiftKey) return event.target === first || event.target === panel ? last : null;
  return event.target === last ? first : null;
};

/**
 * 面板里的 Tab / Shift+Tab 在首尾回绕：焦点出不了面板，走不到背板与页面上。
 *
 * @param panel - 对话框面板（`tabindex="-1"`，打开时焦点落在它身上）
 * @param event - 面板 DOM 里发出的 keydown；React 外壳先滤掉从 portal 冒上来的
 *
 * @remarks
 * 只管首尾，中间照常交给浏览器的 Tab 序列：Tab 在最后一个可聚焦元素（见 {@link tabbableIn}）上回到第一个，
 * Shift+Tab 在第一个或面板本身上去最后一个；面板里没有可聚焦元素时焦点停在面板本身。
 */
export const trapTabKey = (panel: HTMLElement, event: TabKeyEvent): void => {
  if (event.key !== 'Tab') return;
  const next = wrapTargetOf(panel, tabbableIn(panel), event);
  if (next === null) return;
  event.preventDefault();
  next.focus();
};

/**
 * 把焦点还给对话框打开前持有它的元素。
 *
 * @param opener - 挂载后、焦点移进面板之前的 `document.activeElement`
 *
 * @remarks
 * 只还给还在文档里的元素：合并、对比与只读检出位查看器都从会关掉的菜单打开，对话框关闭时那个菜单项早已不在，
 * 焦点就留给浏览器（落到 body）。
 */
export const restoreFocus = (opener: Element | null): void => {
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
};
