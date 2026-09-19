// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnumEditor, type EnumItem } from '../../../entity-table/editors/enum-editor.js';

const PRESET: EnumItem[] = [
  { value: 'draft', text: '草稿' },
  { value: 'active', text: '生效中' },
  { value: 'archived', text: '已归档' }
];

interface EditorContextLike {
  col: number;
  row: number;
  value: unknown;
  container: HTMLElement;
  table: unknown;
  endEdit: () => void;
  referencePosition: { rect: { left: number; top: number; width: number; height: number } };
}

function createEditContext(overrides: Partial<EditorContextLike> = {}): EditorContextLike {
  const container = document.createElement('div');
  container.tabIndex = 0;
  document.body.appendChild(container);

  return {
    col: 1,
    row: 1,
    value: '',
    container,
    table: null,
    endEdit: vi.fn(),
    referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } },
    ...overrides
  };
}

function getRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div[data-idx]'));
}

function dispatchKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('EnumEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView ||= () => undefined;
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('declares the enum-editor type', () => {
    expect(new EnumEditor().editorType).toBe('enum-editor');
  });

  it('returns an empty string before editing starts', () => {
    expect(new EnumEditor(PRESET).getValue()).toBe('');
  });

  it('renders preset items as rows', () => {
    const editor = new EnumEditor(PRESET);
    editor.onStart(createEditContext({ value: 'active' }) as never);

    expect(getRows().map(r => r.textContent)).toEqual(['草稿', '生效中', '已归档']);

    editor.onEnd();
  });

  it('falls back to value as text when text is missing', () => {
    const editor = new EnumEditor([{ value: 'a' }, { value: 'b', text: 'B' }]);
    editor.onStart(createEditContext() as never);

    expect(getRows().map(r => r.textContent)).toEqual(['a', 'B']);

    editor.onEnd();
  });

  it('reads items from the column menuList when no preset is given', () => {
    const editor = new EnumEditor();
    editor.onStart(
      createEditContext({
        table: {
          getCellOriginValue: () => 'b',
          getColumnDefine: () => ({ menuList: [{ value: 'a' }, { value: 'b', text: '乙' }] })
        }
      }) as never
    );

    expect(getRows().map(r => r.textContent)).toEqual(['a', '乙']);
    expect(editor.getValue()).toBe('b');

    editor.onEnd();
  });

  it('auto-selects the first item when the current value is not in the list', () => {
    const ctx = createEditContext({ value: 'missing' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('Enter');
    expect(editor.getValue()).toBe('draft');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('auto-selects the first item when the current value is empty and null is not allowed', () => {
    const ctx = createEditContext({ value: '' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('Enter');
    expect(editor.getValue()).toBe('draft');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('keeps an empty current value when a null option exists', () => {
    const ctx = createEditContext({ value: '' });
    const editor = new EnumEditor([{ value: '', text: '(空)' }, ...PRESET]);
    editor.onStart(ctx as never);

    dispatchKey('Enter');
    expect(editor.getValue()).toBe('');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('renders the null option with dimmed italic styling', () => {
    const editor = new EnumEditor([{ value: '', text: '(空)' }, { value: 'a' }]);
    editor.onStart(createEditContext({ value: 'a' }) as never);

    const nullRow = getRows().find(r => r.dataset['value'] === '');
    expect(nullRow?.style.opacity).toBe('0.55');
    expect(nullRow?.style.fontStyle).toBe('italic');

    editor.onEnd();
  });

  it('ArrowDown / ArrowUp / Enter keyboard navigation', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('ArrowDown');
    dispatchKey('ArrowDown');
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('archived');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('ArrowUp wraps from the first row to the last', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('ArrowUp');
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('archived');

    editor.onEnd();
  });

  it('mouseenter focuses a row and Enter selects it', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    getRows()[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('active');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mousedown on a row selects it directly', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    getRows()[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(editor.getValue()).toBe('archived');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Escape closes without changing the value', () => {
    const ctx = createEditContext({ value: 'active' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('Escape');
    expect(editor.getValue()).toBe('active');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Delete clears the value only when a null option exists', () => {
    const ctx = createEditContext({ value: 'active' });
    const editor = new EnumEditor([{ value: '', text: '(空)' }, ...PRESET]);
    editor.onStart(ctx as never);

    dispatchKey('Delete');
    expect(editor.getValue()).toBe('');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Delete without a null option does nothing', () => {
    const ctx = createEditContext({ value: 'active' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    dispatchKey('Delete');
    expect(editor.getValue()).toBe('active');
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('Backspace behaves like Delete', () => {
    const ctx = createEditContext({ value: 'active' });
    const editor = new EnumEditor([{ value: '', text: '(空)' }, ...PRESET]);
    editor.onStart(ctx as never);

    dispatchKey('Backspace');
    expect(editor.getValue()).toBe('');

    editor.onEnd();
  });

  it('outside mousedown closes the editor', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mousedown on a row does not count as outside', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    getRows()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).toHaveBeenCalledTimes(1); // 行点击本身触发一次选中关闭

    editor.onEnd();
  });

  it('renders an empty-state message when there are no items', () => {
    const editor = new EnumEditor([]);
    editor.onStart(createEditContext() as never);

    expect(document.body.textContent).toContain('暂无可选项');

    dispatchKey('ArrowDown');
    dispatchKey('Enter');
    editor.onEnd();
  });

  it('renders an icon and color when both are provided', () => {
    const iconItem: EnumItem = {
      value: 'star',
      text: '星标',
      icon: [['path', { d: 'M1 1L23 23' }]],
      color: '#ff0000'
    };
    const editor = new EnumEditor([iconItem]);
    editor.onStart(createEditContext({ value: 'star' }) as never);

    const row = getRows()[0];
    expect(row.innerHTML).toContain('<svg');
    expect(row.textContent).toContain('星标');

    editor.onEnd();
  });

  it('isEditorElement reflects panel membership', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    expect(editor.isEditorElement(getRows()[0])).toBe(true);
    expect(editor.isEditorElement(ctx.container)).toBe(false);

    editor.onEnd();
  });

  it('adjustPosition repositions the panel', () => {
    const editor = new EnumEditor(PRESET);
    editor.onStart(
      createEditContext({
        value: 'draft',
        referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
      }) as never
    );

    editor.adjustPosition({ left: 40, top: 50, width: 200, height: 24 });
    const panel = Array.from(document.querySelectorAll('div')).find(d => d.style.position === 'fixed');
    expect(panel?.style.left).toBe('40px');
    expect(panel?.style.top).toBe('74px');

    editor.onEnd();
  });

  it('onEnd removes the panel and unbinds listeners', () => {
    const ctx = createEditContext({ value: 'draft' });
    const editor = new EnumEditor(PRESET);
    editor.onStart(ctx as never);

    editor.onEnd();
    dispatchKey('Enter');
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });
});
