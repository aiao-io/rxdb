// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberEditor } from '../../../entity-table/editors/number-editor.js';

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
    value: null,
    container,
    table: null,
    endEdit: vi.fn(),
    referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } },
    ...overrides
  };
}

function getInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('body > input');
  if (!input) throw new Error('editor input not found');
  return input;
}

function getTooltip(): HTMLDivElement {
  const tooltip = Array.from(document.querySelectorAll('div')).find(d => d.style.zIndex === '10000');
  if (!tooltip) throw new Error('tooltip not found');
  return tooltip;
}

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('NumberEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('decimal mode (default)', () => {
    it('declares the number-editor type', () => {
      expect(new NumberEditor().editorType).toBe('number-editor');
    });

    it('pre-fills the input from a number origin', () => {
      const editor = new NumberEditor();
      editor.onStart(createEditContext({ value: 3.14 }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('3.14');
      expect(getInput().inputMode).toBe('decimal');

      editor.onEnd();
    });

    it('parses a string origin', () => {
      const editor = new NumberEditor();
      editor.onStart(createEditContext({ value: '-2.5' }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('-2.5');
      expect(editor.getValue()).toBe(-2.5);

      editor.onEnd();
    });

    it('treats an invalid string origin as null', () => {
      const editor = new NumberEditor();
      editor.onStart(createEditContext({ value: 'abc' }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('');
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
    });

    it('treats a null / empty origin as null', () => {
      for (const value of [null, '']) {
        const editor = new NumberEditor();
        editor.onStart(createEditContext({ value }) as never);
        vi.advanceTimersByTime(10);

        expect(getInput().value).toBe('');
        expect(editor.getValue()).toBeNull();

        editor.onEnd();
        document.body.innerHTML = '';
      }
    });

    it('shows an error tooltip while the input is invalid', () => {
      const editor = new NumberEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '12abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(getTooltip().style.display).toBe('block');
      expect(getTooltip().textContent).toContain('请输入有效数字');

      editor.onEnd();
    });

    it('hides the error tooltip once the input becomes valid', () => {
      const editor = new NumberEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '12abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(getTooltip().style.display).toBe('block');

      input.value = '12.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(getTooltip().style.display).toBe('none');

      editor.onEnd();
    });

    it('commits a valid number on Enter', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '42.5';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(42.5);

      editor.onEnd();
    });

    it('shows a detailed error and stays open when Enter commits an invalid value', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '3.14abc';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().style.display).toBe('block');
      expect(getTooltip().textContent).toContain('3.14');

      editor.onEnd();
    });

    it('commits on Tab', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '-7';
      keydown(input, 'Tab');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(-7);

      editor.onEnd();
    });

    it('commits null when the input is blank', () => {
      const ctx = createEditContext({ value: 5 });
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '  ';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
    });

    it('Escape restores the original value', () => {
      const ctx = createEditContext({ value: 5 });
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '999';
      keydown(input, 'Escape');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(5);

      editor.onEnd();
    });

    it('outside mousedown commits a valid input', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '12.75';
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(12.75);
      expect(document.querySelector('body > input')).toBeNull();

      editor.onEnd();
    });

    it('outside mousedown reverts an invalid input to the original value', () => {
      const ctx = createEditContext({ value: 5 });
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'not-a-number';
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(5);

      editor.onEnd();
    });

    it('mousedown on the input or tooltip does not end editing', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      getInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(ctx.endEdit).not.toHaveBeenCalled();

      getTooltip().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(ctx.endEdit).not.toHaveBeenCalled();

      editor.onEnd();
    });

    it('adjustPosition repositions the input and tooltip', () => {
      const editor = new NumberEditor();
      editor.onStart(
        createEditContext({ referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } } }) as never
      );
      vi.advanceTimersByTime(10);

      editor.adjustPosition({ left: 15, top: 20, width: 80, height: 30 });
      expect(getInput().style.left).toBe('15px');
      expect(getInput().style.top).toBe('20px');
      expect(getTooltip().style.top).toBe('52px');

      editor.onEnd();
    });

    it('adjustPosition before onStart is a no-op', () => {
      const editor = new NumberEditor();
      expect(() => editor.adjustPosition({ left: 0, top: 0, width: 10, height: 10 })).not.toThrow();
    });

    it('isEditorElement matches the input and tooltip', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      expect(editor.isEditorElement(getInput())).toBe(true);
      expect(editor.isEditorElement(getTooltip())).toBe(true);
      expect(editor.isEditorElement(ctx.container)).toBe(false);
      expect(editor.isEditorElement(document.body)).toBe(false);

      editor.onEnd();
    });

    it('onEnd removes the input and unbinds the outside listener', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      editor.onEnd();
      expect(document.querySelector('body > input')).toBeNull();

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(ctx.endEdit).not.toHaveBeenCalled();
    });

    it('prefers the table cell origin value over ctx.value', () => {
      const editor = new NumberEditor();
      editor.onStart(
        createEditContext({
          value: 1,
          table: { getCellOriginValue: () => 8.8 }
        }) as never
      );
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('8.8');

      editor.onEnd();
    });

    it('refocuses the table container when committing', () => {
      const container = document.createElement('div');
      container.tabIndex = 0;
      document.body.appendChild(container);
      const focusSpy = vi.spyOn(container, 'focus');

      const ctx = createEditContext({ container });
      const editor = new NumberEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      getInput().value = '1';
      keydown(getInput(), 'Enter');
      expect(focusSpy).toHaveBeenCalled();

      editor.onEnd();
    });
  });

  describe('integer mode', () => {
    it('declares the integer-editor type and numeric inputMode', () => {
      const editor = new NumberEditor(true);
      expect(editor.editorType).toBe('integer-editor');
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      expect(getInput().inputMode).toBe('numeric');

      editor.onEnd();
    });

    it('parses the origin with parseInt', () => {
      const editor = new NumberEditor(true);
      editor.onStart(createEditContext({ value: '42.9' }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('42');
      expect(editor.getValue()).toBe(42);

      editor.onEnd();
    });

    it('rejects a decimal input on commit', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor(true);
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '3.5';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().textContent).toContain('请输入整数');

      editor.onEnd();
    });

    it('accepts a negative integer', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor(true);
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '-7';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(-7);

      editor.onEnd();
    });

    it('shows the integer-specific error while typing a decimal', () => {
      const editor = new NumberEditor(true);
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '1.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(getTooltip().style.display).toBe('block');
      expect(getTooltip().textContent).toContain('请输入整数');

      editor.onEnd();
    });

    it('commits null for a blank input', () => {
      const ctx = createEditContext({ value: 9 });
      const editor = new NumberEditor(true);
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
    });
  });

  describe('bigint mode', () => {
    it('declares the bigint-editor type and numeric inputMode', () => {
      const editor = new NumberEditor(false, { bigint: true });
      expect(editor.editorType).toBe('bigint-editor');
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      expect(getInput().inputMode).toBe('numeric');

      editor.onEnd();
    });

    it('parses a string origin as bigint', () => {
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(createEditContext({ value: '42' }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('42');
      expect(editor.getValue()).toBe(42n);

      editor.onEnd();
    });

    it('parses a native bigint origin', () => {
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(createEditContext({ value: -7n }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('-7');
      expect(editor.getValue()).toBe(-7n);

      editor.onEnd();
    });

    it('treats a decimal origin as null', () => {
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(createEditContext({ value: '42.5' }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('');
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
    });

    it('rejects a decimal input on commit', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '3.5';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().textContent).toContain('请输入 64 位整数');

      editor.onEnd();
    });

    it('commits a negative bigint', () => {
      const ctx = createEditContext();
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '-9223372036854775808';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(-9223372036854775808n);

      editor.onEnd();
    });

    it('commits null for a blank input', () => {
      const ctx = createEditContext({ value: 42n });
      const editor = new NumberEditor(false, { bigint: true });
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
    });
  });

  describe('value bounds', () => {
    const boundedEditor = (): NumberEditor => new NumberEditor(false, { min: 1, max: 5, step: 0.5 });

    it('rejects a value below min', () => {
      const ctx = createEditContext();
      const editor = boundedEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '0.5';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().textContent).toContain('必须不小于 1');

      editor.onEnd();
    });

    it('rejects a value above max', () => {
      const ctx = createEditContext();
      const editor = boundedEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '9';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().textContent).toContain('必须不大于 5');

      editor.onEnd();
    });

    it('rejects an off-step value', () => {
      const ctx = createEditContext();
      const editor = boundedEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '3.25';
      keydown(input, 'Enter');

      expect(ctx.endEdit).not.toHaveBeenCalled();
      expect(getTooltip().textContent).toContain('必须按步长 0.5 取值');

      editor.onEnd();
    });

    it('accepts an on-step value', () => {
      const ctx = createEditContext();
      const editor = boundedEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '3.5';
      keydown(input, 'Enter');

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toBe(3.5);

      editor.onEnd();
    });
  });
});
