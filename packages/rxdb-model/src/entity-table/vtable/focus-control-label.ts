import { modelText, type ModelI18n } from '../../i18n.js';
/**
 * @fileoverview VTable 接键盘焦点的隐藏输入框的可读名（内部模块，不从包入口导出）。
 */

/**
 * 给 VTable 接键盘焦点的隐藏输入框补上可读名。
 *
 * @param container - 表格的挂载容器
 *
 * @remarks
 * VTable 在挂载容器里放一个透明的 `<input class="table-focus-control">` 接键盘焦点，却不带标签：
 * axe 判 `label`（critical），读屏只念「编辑框，只读」。Node 下 VTable 不建这个输入框，那时什么都不做。
 */
export function labelTableFocusControl(container: HTMLElement, i18n?: ModelI18n): () => void {
  const refresh = () =>
    container
      .querySelector('input.table-focus-control')
      ?.setAttribute('aria-label', modelText('text.fc284c2a3e', undefined, i18n));
  refresh();
  const subscription = i18n?.changes$?.subscribe(refresh);
  return () => subscription?.unsubscribe();
}
