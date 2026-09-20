import type * as VTable from '@visactor/vtable';
import { getTableContainer } from './vtable-compat.js';

/**
 * 计算 tooltip 在页面上的绝对位置
 *
 * @param container tooltip 所在容器元素
 * @param rect 单元格矩形信息（x/left、y/top、height/bottom）
 * @returns 页面坐标（位于单元格下方）；容器、矩形或位置信息缺失时返回 null
 */
export function computeTooltipPosition(
  container: HTMLElement | null | undefined,
  rect: Record<string, number> | null | undefined
): { x: number; y: number } | null {
  if (!container || !rect || (typeof rect['x'] !== 'number' && typeof rect['left'] !== 'number')) return null;
  const br = container.getBoundingClientRect();
  const x = typeof rect['x'] === 'number' ? rect['x'] : (rect['left'] ?? 0);
  const y = typeof rect['y'] === 'number' ? rect['y'] : (rect['top'] ?? 0);
  const height =
    typeof rect['height'] === 'number' ? rect['height']
    : typeof rect['bottom'] === 'number' ? rect['bottom'] - y
    : 20;
  return { x: br.left + x, y: br.top + y + height + 4 };
}

/** 默认 tooltip 延迟（毫秒） */
const DEFAULT_TOOLTIP_DELAY = 800;

/** 单元格错误 tooltip 生命周期管理 */
export class CellTooltipManager {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #hoveredCell: { col: number; row: number } | null = null;

  /** 延迟显示错误 tooltip */
  showError(
    table: VTable.ListTable,
    col: number,
    row: number,
    content: string,
    setTooltip: (tip: { x: number; y: number; content: string } | null) => void,
    delay = DEFAULT_TOOLTIP_DELAY
  ): void {
    this.#hoveredCell = { col, row };
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (this.#hoveredCell?.col !== col || this.#hoveredCell?.row !== row) return;
      const containerEl = getTableContainer(table);
      const rect = table.getCellRect(col, row) as unknown as Record<string, number> | undefined;
      const pos = computeTooltipPosition(containerEl, rect);
      setTooltip(pos ? { ...pos, content } : { x: 0, y: 0, content });
    }, delay);
  }

  /** 隐藏 tooltip */
  hide(setTooltip: (tip: null) => void): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#hoveredCell = null;
    setTooltip(null);
  }

  /** 销毁时清理定时器 */
  cleanup(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#hoveredCell = null;
  }
}
