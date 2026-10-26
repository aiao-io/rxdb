/**
 * @fileoverview VTable 接键盘焦点的隐藏输入框的可读名（内部模块，不从包入口导出）。
 */

/** 输入框的值是当前单元格的文字，读屏念的就是它；名字说清它是什么。 */
const FOCUS_CONTROL_LABEL = '表格当前单元格';

/**
 * 给 VTable 接键盘焦点的隐藏输入框补上可读名。
 *
 * @param container - 表格的挂载容器
 *
 * @remarks
 * VTable 在挂载容器里放一个透明的 `<input class="table-focus-control">` 接键盘焦点，却不带标签：
 * axe 判 `label`（critical），读屏只念「编辑框，只读」。Node 下 VTable 不建这个输入框，那时什么都不做。
 */
export function labelTableFocusControl(container: HTMLElement): void {
  container.querySelector('input.table-focus-control')?.setAttribute('aria-label', FOCUS_CONTROL_LABEL);
}
