/**
 * @fileoverview 模态对话框的 Tab 焦点循环（看板 v2，三端共用）
 *
 * `aria-modal="true"` 只让读屏的虚拟光标停在对话框里，键盘 Tab 仍会走到背后的卡片上
 * （WAI-ARIA 模态对话框模式要求焦点不离开对话框）。三端在 document keydown 里收集对话框内的
 * 可聚焦元素，目标由这里换算：焦点到首尾时绕回另一端，其余交给浏览器默认的 Tab 顺序。
 */

/** 对话框内参与 Tab 循环的元素：未禁用的控件、链接与显式可聚焦元素。 */
export const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Tab 焦点循环目标。
 *
 * @param focusables - 对话框内可聚焦元素（文档顺序）
 * @param active - 当前焦点
 * @param backwards - 是否 `Shift + Tab`
 * @returns 需要接管时要聚焦的元素：首尾绕回，焦点不在序列里时拉回对话框；
 *   焦点在中间（交给浏览器默认顺序）或对话框里没有可聚焦元素时为 `null`
 */
export const trapTabFocus = <T>(focusables: readonly T[], active: T | null, backwards: boolean): T | null => {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active === null ? -1 : focusables.indexOf(active);
  if (index < 0) return backwards ? last : first;
  if (backwards) return index === 0 ? last : null;
  return index === focusables.length - 1 ? first : null;
};

/**
 * 将模态框的 Tab 限制在框内；空框聚焦容器，中间位置沿用浏览器顺序。
 * @param root - 当前看板的根元素
 * @param backwards - 是否按下 Shift + Tab
 * @returns 已接管焦点时为 true
 */
export const focusModalTab = (root: HTMLElement, backwards: boolean): boolean => {
  const dialog = root.querySelector<HTMLElement>('.rxb-dialog-backdrop [aria-modal="true"]');
  if (dialog === null) return false;
  const focusables = [...dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)].filter(
    element =>
      element.tabIndex >= 0 && !element.matches(':disabled, [type="hidden"]') && !element.closest('[hidden], [inert]')
  );
  const target = trapTabFocus(focusables, root.ownerDocument.activeElement as HTMLElement | null, backwards);
  if (target !== null) {
    target.focus();
    return true;
  }
  if (focusables.length > 0) return false;
  dialog.tabIndex = -1;
  dialog.focus();
  return true;
};
