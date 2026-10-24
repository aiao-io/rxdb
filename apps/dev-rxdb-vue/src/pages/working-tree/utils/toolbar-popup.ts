/** 工具栏换行后按弹层实际位置限制尺寸，保持右缘与底部都在视口内。 */
export function fitToolbarPopup(popup: HTMLElement): void {
  const section = popup.offsetParent;
  if (!(section instanceof HTMLElement)) return;
  popup.style.minWidth = '0';
  popup.style.maxWidth = `${window.innerWidth - 16}px`;
  const box = popup.getBoundingClientRect();
  const sectionLeft = section.getBoundingClientRect().left;
  popup.style.left = `${Math.max(8 - sectionLeft, Math.min(0, window.innerWidth - sectionLeft - box.width - 8))}px`;
  popup.style.maxHeight = `${Math.max(0, window.innerHeight - box.top - 8)}px`;
}
