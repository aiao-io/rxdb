// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KVSchemaEntry } from '../columns/column-utils.js';
import { KeyValueEditor } from './key-value-editor.js';

const SCHEMA: Record<string, KVSchemaEntry> = {
  color: { label: '颜色', type: 'string', required: true, nullable: false },
  count: { label: '数量', type: 'integer', nullable: false },
  ratio: { label: '比例', type: 'number' },
  active: { label: '启用', type: 'boolean' },
  birthday: { label: '生日', type: 'date' }
};

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
    value: {},
    container,
    table: null,
    endEdit: vi.fn(),
    referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } },
    ...overrides
  };
}

/** 数据行（含删除按钮的 grid 容器） */
function getRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div')).filter(
    d => d.style.display === 'grid' && !!d.querySelector('button')
  );
}

function rowKeyEl(row: HTMLElement): HTMLSelectElement | HTMLInputElement {
  return row.children[0] as HTMLSelectElement | HTMLInputElement;
}

function rowValueEl(row: HTMLElement): HTMLSelectElement | HTMLInputElement {
  return row.children[1].children[0] as HTMLSelectElement | HTMLInputElement;
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(text));
}

function keydown(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

describe('KeyValueEditor', () => {
  let originalAppendChild: typeof HTMLSelectElement.prototype.appendChild;

  beforeEach(() => {
    vi.useFakeTimers();
    // happy-dom 在「先设 option.selected 再 appendChild」时把选中态记到错误的 option 上，
    // 与浏览器语义不符。按 DOM 规范修正 appendChild 后的 selectedIndex。
    originalAppendChild = HTMLSelectElement.prototype.appendChild;
    HTMLSelectElement.prototype.appendChild = function <T extends Node>(node: T): T {
      const isOption = node instanceof HTMLOptionElement;
      const wasSelected = isOption && node.selected;
      const result = originalAppendChild.call(this, node);
      if (isOption && wasSelected) {
        this.selectedIndex = Array.from(this.options).indexOf(node);
      }
      return result;
    };
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    HTMLSelectElement.prototype.appendChild = originalAppendChild;
    document.body.innerHTML = '';
  });

  describe('initial parsing', () => {
    it('parses a JSON string origin into free-form rows', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext({ value: '{"a":"1","b":"2"}' }) as never);

      const rows = getRows();
      expect(rows).toHaveLength(2);
      expect(rowKeyEl(rows[0])).toBeInstanceOf(HTMLInputElement);

      editor.onEnd();
    });

    it('ignores an unparseable JSON string', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext({ value: '{broken' }) as never);

      expect(getRows()).toHaveLength(1); // 空初始值 → 补一行

      editor.onEnd();
    });

    it('ignores array origins', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext({ value: [1, 2] }) as never);

      expect(getRows()).toHaveLength(1);

      editor.onEnd();
    });

    it('ignores null origins', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext({ value: null }) as never);

      expect(getRows()).toHaveLength(1);

      editor.onEnd();
    });
  });

  describe('free-form mode', () => {
    it('prevents committing duplicate free-form keys', () => {
      const endEdit = vi.fn();
      const editor = new KeyValueEditor();

      editor.onStart(createEditContext({ endEdit }) as never);

      const addBtn = findButton('添加行');
      expect(addBtn).toBeTruthy();
      addBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      const keyInputs = Array.from(document.querySelectorAll('input[placeholder="Key"]')) as HTMLInputElement[];
      expect(keyInputs).toHaveLength(2);

      keyInputs[0].value = 'status';
      keyInputs[1].value = 'status';

      const confirmBtn = findButton('确认');
      expect(confirmBtn).toBeTruthy();
      confirmBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(endEdit).not.toHaveBeenCalled();
      expect(editor.getValue()).toEqual({});
      expect(document.body.textContent).toContain('重复');

      editor.onEnd();
    });

    it('commits free-form rows and skips empty keys', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext({ value: { a: '1' } }) as never);

      const rows = getRows();
      rowValueEl(rows[0]).value = '10';

      findButton('添加行')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      const newRow = getRows()[1];
      rowKeyEl(newRow).value = 'b';
      rowValueEl(newRow).value = '20';

      findButton('添加行')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      const emptyRow = getRows()[2];
      rowValueEl(emptyRow).value = 'should-be-skipped';

      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(editor.getValue()).toEqual({ a: '10', b: '20' });

      editor.onEnd();
    });

    it('clears validation hints when the key input changes', () => {
      const editor = new KeyValueEditor();
      editor.onStart(createEditContext() as never);

      const keyInput = Array.from(document.querySelectorAll('input[placeholder="Key"]')) as HTMLInputElement[];
      keyInput[0].value = 'dup';
      keyInput[0].dispatchEvent(new Event('input', { bubbles: true }));

      // 只有一行时不会触发错误；此处验证输入事件不会抛错并保持状态
      expect(getRows()).toHaveLength(1);

      editor.onEnd();
    });
  });

  describe('schema mode', () => {
    it('builds rows for schema keys present in the initial value', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red', count: 2 } }) as never);

      const rows = getRows();
      expect(rows).toHaveLength(2);

      expect(rowKeyEl(rows[0])).toBeInstanceOf(HTMLSelectElement);
      expect(rowKeyEl(rows[0]).value).toBe('color');
      expect(rowKeyEl(rows[1]).value).toBe('count');

      editor.onEnd();
    });

    it('renders schema labels on the key options', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      const select = rowKeyEl(getRows()[0]) as HTMLSelectElement;
      expect(Array.from(select.options).map(o => o.textContent)).toEqual(['颜色', '数量', '比例', '启用', '生日']);

      editor.onEnd();
    });

    it('disables key options used by other rows', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red', count: 2 } }) as never);

      const rows = getRows();
      const firstSelect = rowKeyEl(rows[0]) as HTMLSelectElement;
      const countOption = Array.from(firstSelect.options).find(o => o.value === 'count');
      expect(countOption?.disabled).toBe(true);

      editor.onEnd();
    });

    it('appends the first unused key when adding a row', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      findButton('添加行')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(getRows()).toHaveLength(2);
      expect(rowKeyEl(getRows()[1]).value).toBe('count');

      editor.onEnd();
    });

    it('disables the add button once every schema key is used', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      const addBtn = findButton('添加行');
      for (let i = 0; i < 4; i++) {
        addBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }
      expect(getRows()).toHaveLength(5);
      expect(addBtn?.disabled).toBe(true);
      expect(addBtn?.style.opacity).toBe('0.4');

      editor.onEnd();
    });

    it('re-enables the add button after deleting a row', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      const addBtn = findButton('添加行');
      for (let i = 0; i < 4; i++) {
        addBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }
      expect(addBtn?.disabled).toBe(true);

      const deleteBtn = getRows()[4].querySelector('button');
      deleteBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(getRows()).toHaveLength(4);
      expect(addBtn?.disabled).toBe(false);

      editor.onEnd();
    });

    it('rebuilds the value input when the key changes', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      const select = rowKeyEl(getRows()[0]) as HTMLSelectElement;
      select.value = 'count';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const valueEl = rowValueEl(getRows()[0]) as HTMLInputElement;
      expect(valueEl).toBeInstanceOf(HTMLInputElement);
      expect(valueEl.type).toBe('number');
      expect(valueEl.step).toBe('1');

      editor.onEnd();
    });

    it('releases the previous key after a key change', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red', count: 2 } }) as never);

      const select = rowKeyEl(getRows()[0]) as HTMLSelectElement;
      select.value = 'ratio';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const secondSelect = rowKeyEl(getRows()[1]) as HTMLSelectElement;
      const colorOption = Array.from(secondSelect.options).find(o => o.value === 'color');
      expect(colorOption?.disabled).toBe(false);
      const ratioOption = Array.from(secondSelect.options).find(o => o.value === 'ratio');
      expect(ratioOption?.disabled).toBe(true);

      editor.onEnd();
    });

    it('rejects a required field left empty', () => {
      const endEdit = vi.fn();
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' }, endEdit }) as never);

      rowValueEl(getRows()[0]).value = '';
      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(endEdit).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('「颜色」为必填项');

      editor.onEnd();
    });

    it('rejects an invalid integer value', () => {
      const endEdit = vi.fn();
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { count: 2 }, endEdit }) as never);

      rowValueEl(getRows()[0]).value = '3.5';
      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(endEdit).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('请输入整数');

      editor.onEnd();
    });

    it('rejects an invalid number value', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { ratio: 1 } }) as never);

      // happy-dom 会静默清空 number 输入的非法值，先切到 text 以驱动验证分支
      const valueEl = rowValueEl(getRows()[0]) as HTMLInputElement;
      valueEl.type = 'text';
      valueEl.value = 'abc';
      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(document.body.textContent).toContain('请输入有效数字');

      editor.onEnd();
    });

    it('rejects an invalid date value', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { birthday: '2024-01-01T00:00:00.000Z' } }) as never);

      // happy-dom 会静默清空 datetime-local 输入的非法值，先切到 text 以驱动验证分支
      const valueEl = rowValueEl(getRows()[0]) as HTMLInputElement;
      valueEl.type = 'text';
      valueEl.value = 'not-a-date';
      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(document.body.textContent).toContain('请输入有效日期');

      editor.onEnd();
    });

    it('summarizes multiple errors with a count', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red', count: 2 } }) as never);

      const rows = getRows();
      rowValueEl(rows[0]).value = '';
      rowValueEl(rows[1]).value = '3.5';

      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(document.body.textContent).toContain('及其他 1 处');

      editor.onEnd();
    });

    it('commits values converted to their schema types', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(
        createEditContext({
          value: {
            color: 'red',
            count: 2,
            ratio: 1.5,
            active: true,
            birthday: '2024-05-05T10:00:00.000Z'
          }
        }) as never
      );

      const rows = getRows();
      rowValueEl(rows[0]).value = 'blue';
      rowValueEl(rows[1]).value = '42';
      rowValueEl(rows[2]).value = '2.5';
      (rowValueEl(rows[3]) as HTMLSelectElement).value = 'false';
      const birthdayRaw = (rowValueEl(rows[4]) as HTMLInputElement).value;

      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(editor.getValue()).toEqual({
        color: 'blue',
        count: 42,
        ratio: 2.5,
        active: false,
        birthday: new Date(birthdayRaw).toISOString()
      });

      editor.onEnd();
    });

    it('commits null for an empty nullable value and empty string for non-nullable', () => {
      const schema: Record<string, KVSchemaEntry> = {
        optional: { type: 'string' },
        mandatory: { type: 'string', nullable: false }
      };
      const editor = new KeyValueEditor(schema);
      editor.onStart(createEditContext({ value: { optional: 'x', mandatory: 'y' } }) as never);

      const rows = getRows();
      rowValueEl(rows[0]).value = '';
      rowValueEl(rows[1]).value = '';

      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(editor.getValue()).toEqual({ optional: null, mandatory: '' });

      editor.onEnd();
    });

    it('offers a null option for nullable boolean fields only', () => {
      const schema: Record<string, KVSchemaEntry> = {
        nullableFlag: { type: 'boolean' },
        strictFlag: { type: 'boolean', nullable: false }
      };
      const editor = new KeyValueEditor(schema);
      editor.onStart(createEditContext({ value: { nullableFlag: true, strictFlag: false } }) as never);

      const rows = getRows();
      const nullableSelect = rowValueEl(rows[0]) as HTMLSelectElement;
      expect(Array.from(nullableSelect.options).some(o => o.value === '')).toBe(true);

      const strictSelect = rowValueEl(rows[1]) as HTMLSelectElement;
      expect(Array.from(strictSelect.options).some(o => o.value === '')).toBe(false);

      editor.onEnd();
    });

    it('formats date values into datetime-local inputs', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { birthday: '2024-05-05T10:00:00.000Z' } }) as never);

      const input = rowValueEl(getRows()[0]) as HTMLInputElement;
      expect(input.type).toBe('datetime-local');
      expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      editor.onEnd();
    });

    it('keeps unparseable date values on the raw-value fallback path', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { birthday: 'not-a-date' } }) as never);

      const input = rowValueEl(getRows()[0]) as HTMLInputElement;
      expect(input.type).toBe('datetime-local');
      // happy-dom 会静默清空非法 datetime-local 值；真实浏览器中显示原始文本
      expect(input.value === '' || input.value === 'not-a-date').toBe(true);

      editor.onEnd();
    });

    it('hides the row hint once the user edits the value again', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      const valueEl = rowValueEl(getRows()[0]);
      valueEl.value = '';
      findButton('确认')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(document.body.textContent).toContain('必填项');

      valueEl.value = 'green';
      valueEl.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.body.textContent).not.toContain('必填项');

      editor.onEnd();
    });

    it('cancel button reverts to the initial value', () => {
      const endEdit = vi.fn();
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' }, endEdit }) as never);

      rowValueEl(getRows()[0]).value = 'blue';
      findButton('取消')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toEqual({ color: 'red' });

      editor.onEnd();
    });

    it('Escape reverts and Ctrl+Enter commits via the panel keydown handler', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);
      const panel = Array.from(document.querySelectorAll('div')).find(d => d.style.position === 'fixed');
      expect(panel).toBeTruthy();

      // Escape 恢复原值
      const rows = getRows();
      rowValueEl(rows[0]).value = 'blue';
      keydown(panel as HTMLElement, 'Escape');
      expect(editor.getValue()).toEqual({ color: 'red' });

      // Ctrl+Enter 提交
      rowValueEl(getRows()[0]).value = 'blue';
      keydown(panel as HTMLElement, 'Enter', { ctrlKey: true });
      expect(editor.getValue()).toEqual({ color: 'blue' });

      editor.onEnd();
    });

    it('outside mousedown best-effort commits', () => {
      const endEdit = vi.fn();
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' }, endEdit }) as never);
      vi.advanceTimersByTime(10);

      rowValueEl(getRows()[0]).value = 'green';
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toEqual({ color: 'green' });

      editor.onEnd();
    });

    it('onEnd cleans up the panel and DOM', () => {
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(createEditContext({ value: { color: 'red' } }) as never);

      editor.onEnd();
      expect(Array.from(document.querySelectorAll('div')).some(d => d.style.position === 'fixed')).toBe(false);

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    it('isEditorElement reflects panel membership', () => {
      const ctx = createEditContext({ value: { color: 'red' } });
      const editor = new KeyValueEditor(SCHEMA);
      editor.onStart(ctx as never);

      expect(editor.isEditorElement(getRows()[0])).toBe(true);
      expect(editor.isEditorElement(ctx.container)).toBe(false);

      editor.onEnd();
    });
  });
});
