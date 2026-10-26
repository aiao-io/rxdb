// @vitest-environment happy-dom
/**
 * @fileoverview VTable 接键盘焦点的隐藏输入框要有可读名（axe `label`：没有它时读屏只念「编辑框，只读」）。
 */

import { describe, expect, it } from 'vitest';
import { labelTableFocusControl } from '../../../entity-table/vtable/focus-control-label.js';

/** VTable 在挂载容器里放的那一截 DOM（`FocusInput` 的构造）。 */
const mountVTableFocusControl = (container: HTMLElement): HTMLInputElement => {
  const holder = document.createElement('div');
  holder.classList.add('input-container');
  const input = document.createElement('input');
  input.classList.add('table-focus-control');
  input.dataset.vtable = 'vtable';
  input.readOnly = true;
  holder.appendChild(input);
  container.appendChild(holder);
  return input;
};

describe('labelTableFocusControl', () => {
  it('给接焦点的输入框补上可读名：它的值是当前单元格的文字', () => {
    const container = document.createElement('div');
    const input = mountVTableFocusControl(container);

    labelTableFocusControl(container);

    expect(input.getAttribute('aria-label')).toBe('表格当前单元格');
  });

  it('Node 下 VTable 不建这个输入框：什么都不做', () => {
    const container = document.createElement('div');

    expect(() => labelTableFocusControl(container)).not.toThrow();
    expect(container.children).toHaveLength(0);
  });
});
