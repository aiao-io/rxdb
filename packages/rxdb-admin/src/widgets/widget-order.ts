import { PINNED_WIDGETS } from '../preferences/defaults.js';
import type { AdminPreferences, WidgetKey } from '../preferences/types.js';

/**
 * 顶栏上可见的部件，按用户排定的顺序。
 * @param widget - 偏好里的部件配置。
 * @returns 可见部件。
 */
export function visibleWidgets(widget: AdminPreferences['widget']): WidgetKey[] {
  return widget.order.filter(key => !widget.hidden.includes(key));
}

/**
 * 在可见部件列表内重排：只移动可见项，隐藏项相对顺序不变并保持在尾部。
 * @param widget - 偏好里的部件配置。
 * @param from - 可见列表内的起始下标。
 * @param to - 可见列表内的目标下标。
 * @returns 新的完整顺序；下标越界或不变时返回原顺序副本。
 */
export function moveVisibleWidget(widget: AdminPreferences['widget'], from: number, to: number): WidgetKey[] {
  const visible = visibleWidgets(widget);
  const hidden = widget.order.filter(key => widget.hidden.includes(key));
  const inRange = (index: number): boolean => index >= 0 && index < visible.length;
  if (!inRange(from) || !inRange(to) || from === to) return [...widget.order];
  const [moved] = visible.splice(from, 1);
  visible.splice(to, 0, moved);
  return [...visible, ...hidden];
}

/**
 * 切换部件的显隐；设置入口不可隐藏。
 * @param hidden - 当前隐藏集合。
 * @param key - 部件键。
 * @returns 新的隐藏集合。
 */
export function toggleWidgetHidden(hidden: readonly WidgetKey[], key: WidgetKey): WidgetKey[] {
  if (PINNED_WIDGETS.includes(key)) return [...hidden];
  return hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key];
}
