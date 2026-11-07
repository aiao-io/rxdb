/**
 * 普通左键点击由外壳接管为 SPA 导航；带修饰键、中键仍交给浏览器（新标签打开）。
 * @param event - 点击事件。
 * @param go - 导航动作。
 */
export function interceptNavigation(event: MouseEvent, go: () => void): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  go();
}
