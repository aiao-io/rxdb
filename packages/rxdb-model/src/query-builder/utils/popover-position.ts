/**
 * 计算弹出层相对于触发元素的位置，优先下方展示，空间不足时向上。
 *
 * @param triggerRect 触发按钮的 DOMRect
 * @param gap 触发元素与弹出层之间的间距（单位 px，默认 2）
 * @param minSpaceBelow 判断下方空间是否充足的阈值（单位 px，默认 120）
 * @returns 弹出层定位信息：left、minWidth，以及 top（下方展示）或 bottom（上方展示）
 */
export function calcPopoverPosition(
  triggerRect: DOMRect,
  gap = 2,
  minSpaceBelow = 120
): { left: number; top?: number; bottom?: number; minWidth: number } {
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  if (spaceBelow > minSpaceBelow) {
    return { left: triggerRect.left, top: triggerRect.bottom + gap, minWidth: triggerRect.width };
  }
  return { left: triggerRect.left, bottom: window.innerHeight - triggerRect.top + gap, minWidth: triggerRect.width };
}

/**
 * 将 calcPopoverPosition 的结果直接应用到弹出层 DOM 元素。
 *
 * @param el 弹出层 DOM 元素
 * @param triggerRect 触发按钮的 DOMRect
 * @param gap 触发元素与弹出层之间的间距（单位 px，默认 2）
 * @param minSpaceBelow 判断下方空间是否充足的阈值（单位 px，默认 120）
 */
export function applyPopoverPosition(el: HTMLElement, triggerRect: DOMRect, gap = 2, minSpaceBelow = 120): void {
  const pos = calcPopoverPosition(triggerRect, gap, minSpaceBelow);
  el.style.position = 'fixed';
  el.style.margin = '0';
  el.style.inset = 'unset';
  el.style.minWidth = `${pos.minWidth}px`;
  el.style.left = `${pos.left}px`;
  if (pos.top != null) {
    el.style.top = `${pos.top}px`;
    el.style.bottom = 'unset';
  } else {
    el.style.top = 'unset';
    el.style.bottom = `${pos.bottom}px`;
  }
}

/**
 * 在弹出层选项列表中查找匹配项的 label。
 *
 * @param options 选项列表（value 为选中值、label 为显示文本）
 * @param selected 当前选中的 value
 * @param placeholder 未找到匹配项时返回的占位文本
 * @returns 匹配项的 label；未找到时返回 placeholder
 */
export function findOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  selected: string,
  placeholder: string
): string {
  return options.find(o => o.value === selected)?.label ?? placeholder;
}
