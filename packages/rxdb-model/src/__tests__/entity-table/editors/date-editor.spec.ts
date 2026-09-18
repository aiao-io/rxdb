// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateEditor } from '../../../entity-table/editors/date-editor.js';

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
  const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement | null;
  if (!input) throw new Error('datetime-local input not found');
  return input;
}

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('DateEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('pre-fills the input from a Date origin value', () => {
    const origin = new Date('2024-01-15T10:30:45');
    const editor = new DateEditor();
    editor.onStart(createEditContext({ value: origin }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe('2024-01-15T10:30');

    editor.onEnd();
  });

  it('pre-fills the input from an ISO string origin value', () => {
    const editor = new DateEditor();
    editor.onStart(createEditContext({ value: '2024-06-01T08:15:00.000Z' }) as never);
    vi.advanceTimersByTime(10);

    const expected = new Date('2024-06-01T08:15:00.000Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(getInput().value).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}`
    );

    editor.onEnd();
  });

  it('treats an invalid string origin as null', () => {
    const editor = new DateEditor();
    editor.onStart(createEditContext({ value: 'not-a-date' }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe('');
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('treats an invalid Date instance origin as null', () => {
    const editor = new DateEditor();
    editor.onStart(createEditContext({ value: new Date('invalid') }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe('');
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('treats a null / empty origin as null', () => {
    for (const value of [null, '']) {
      const editor = new DateEditor();
      editor.onStart(createEditContext({ value }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('');
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
      document.body.innerHTML = '';
    }
  });

  it('prefers the table cell origin value over ctx.value', () => {
    const cellValue = new Date('2024-03-03T03:03:00');
    const editor = new DateEditor();
    editor.onStart(
      createEditContext({
        value: new Date('2025-01-01T00:00:00'),
        table: { getCellOriginValue: () => cellValue }
      }) as never
    );
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe('2024-03-03T03:03');

    editor.onEnd();
  });

  it('commits a changed value on Enter', () => {
    const ctx = createEditContext({ value: new Date('2024-01-15T10:30:00') });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '2024-02-02T12:00';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual(new Date('2024-02-02T12:00'));

    editor.onEnd();
  });

  it('keeps the original millisecond value when the minute did not change', () => {
    const origin = new Date('2024-01-15T10:30:45.123');
    const ctx = createEditContext({ value: origin });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    keydown(getInput(), 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()?.getTime()).toBe(origin.getTime());

    editor.onEnd();
  });

  it('zeroes seconds on a changed input value', () => {
    const ctx = createEditContext({ value: new Date('2024-01-15T10:30:00') });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '2024-05-05T05:05';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    keydown(input, 'Tab');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual(new Date('2024-05-05T05:05:00'));

    editor.onEnd();
  });

  it('Escape restores the original value', () => {
    const origin = new Date('2024-01-15T10:30:00');
    const ctx = createEditContext({ value: origin });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '2024-09-09T09:09';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    keydown(input, 'Escape');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()?.getTime()).toBe(origin.getTime());

    editor.onEnd();
  });

  it('the clear button sets the value to null', () => {
    const ctx = createEditContext({ value: new Date('2024-01-15T10:30:00') });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('清除'));
    expect(clearBtn).toBeTruthy();
    clearBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('outside mousedown commits the current input value', () => {
    const ctx = createEditContext({ value: new Date('2024-01-15T10:30:00') });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '2024-07-07T07:07';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual(new Date('2024-07-07T07:07:00'));
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();

    editor.onEnd();
  });

  it('mousedown on the input does not end editing', () => {
    const ctx = createEditContext({ value: new Date('2024-01-15T10:30:00') });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('onEnd removes the panel and unbinds the outside listener', () => {
    const ctx = createEditContext();
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    editor.onEnd();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });

  it('isEditorElement reflects panel membership', () => {
    const ctx = createEditContext();
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(editor.isEditorElement(getInput())).toBe(true);
    expect(editor.isEditorElement(ctx.container)).toBe(false);
    expect(editor.isEditorElement(document.body)).toBe(false);

    editor.onEnd();
  });

  it('refocuses the table container when committing', () => {
    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(container, 'focus');

    const ctx = createEditContext({ container });
    const editor = new DateEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    keydown(getInput(), 'Enter');
    expect(focusSpy).toHaveBeenCalled();

    editor.onEnd();
  });
});
