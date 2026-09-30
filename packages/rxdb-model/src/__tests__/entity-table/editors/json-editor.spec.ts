// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonEditor } from '../../../entity-table/editors/json-editor.js';

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

function getTextarea(): HTMLTextAreaElement {
  const textarea = document.querySelector('textarea');
  if (!textarea) throw new Error('textarea not found');
  return textarea;
}

function keydown(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

describe('JsonEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('serializes the cell origin value into the textarea', () => {
    const editor = new JsonEditor();
    const ctx = createEditContext({
      value: 'ignored',
      table: { getCellOriginValue: () => ({ a: 1 }) }
    });

    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(getTextarea().value).toBe('{\n  "a": 1\n}');

    editor.onEnd();
  });

  it('falls back to ctx.value when table is unavailable', () => {
    const editor = new JsonEditor();
    const ctx = createEditContext({ value: { fallback: true } });

    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(getTextarea().value).toBe('{\n  "fallback": true\n}');

    editor.onEnd();
  });

  it('leaves the textarea empty when the origin value is null', () => {
    const editor = new JsonEditor();
    const ctx = createEditContext();

    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(getTextarea().value).toBe('');

    editor.onEnd();
  });

  it('commits parsed JSON on Ctrl+Enter', () => {
    const ctx = createEditContext({ value: { old: 1 } });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '{"new": 2}';
    keydown(textarea, 'Enter', { ctrlKey: true });

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual({ new: 2 });

    editor.onEnd();
  });

  it('commits parsed JSON on Meta+Enter (macOS)', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '[1, 2, 3]';
    keydown(textarea, 'Enter', { metaKey: true });

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual([1, 2, 3]);

    editor.onEnd();
  });

  it('does not intercept plain Enter inside the textarea', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    keydown(getTextarea(), 'Enter');

    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('commits null when the input is blank', () => {
    const ctx = createEditContext({ value: { old: 1 } });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '   ';
    keydown(textarea, 'Enter', { ctrlKey: true });

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('Escape restores the original value and ends editing', () => {
    const origin = { keep: 'me' };
    const ctx = createEditContext({ value: origin });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '{"changed": true}';
    keydown(textarea, 'Escape');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual(origin);

    editor.onEnd();
  });

  it('shows a JSON error hint for invalid input and blocks commit', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '{broken';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const errorEl = document.querySelector('div[style*="var(--color-error)"]');
    expect(errorEl?.textContent).toContain('⚠');

    keydown(textarea, 'Enter', { ctrlKey: true });
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('clears the error hint once the input becomes valid', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const textarea = getTextarea();
    textarea.value = '{broken';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.body.textContent).toContain('⚠');

    textarea.value = '{"ok": true}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.body.textContent).not.toContain('⚠');

    editor.onEnd();
  });

  it('outside mousedown best-effort commits a valid JSON value', () => {
    const ctx = createEditContext({ value: { old: 1 } });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getTextarea().value = '{"best": "effort"}';
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual({ best: 'effort' });
    expect(document.querySelector('textarea')).toBeNull();

    editor.onEnd();
  });

  it('outside mousedown keeps the original value when JSON is invalid', () => {
    const origin = { original: true };
    const ctx = createEditContext({ value: origin });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getTextarea().value = '{invalid';
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toEqual(origin);

    editor.onEnd();
  });

  it('mousedown inside the panel does not end editing', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getTextarea().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('copy button writes the textarea content to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    try {
      const ctx = createEditContext({ value: { copy: 'me' } });
      const editor = new JsonEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('复制'));
      expect(copyBtn).toBeTruthy();
      copyBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(writeText).toHaveBeenCalledWith(getTextarea().value);
      expect(copyBtn?.textContent).toBe('✓');
      vi.advanceTimersByTime(1200);
      expect(copyBtn?.textContent).toBe('复制');

      editor.onEnd();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }
  });

  it('handles a clipboard rejection without throwing', () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    try {
      const ctx = createEditContext();
      const editor = new JsonEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('复制'));
      expect(() =>
        copyBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      ).not.toThrow();
      expect(ctx.endEdit).not.toHaveBeenCalled();

      editor.onEnd();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }
  });

  it('leaves the textarea empty when the origin value cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const ctx = createEditContext({ value: circular });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(getTextarea().value).toBe('');

    editor.onEnd();
  });

  it('onEnd removes the panel and unbinds the outside listener', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    editor.onEnd();
    expect(document.querySelector('textarea')).toBeNull();

    // outside listener was removed: no further endEdit calls
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });

  it('isEditorElement reflects panel membership', () => {
    const ctx = createEditContext();
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(editor.isEditorElement(getTextarea())).toBe(true);
    expect(editor.isEditorElement(ctx.container)).toBe(false);
    expect(editor.isEditorElement(document.body)).toBe(false);

    editor.onEnd();
  });

  it('refocuses the table container when editing ends', () => {
    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(container, 'focus');

    const ctx = createEditContext({ container });
    const editor = new JsonEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getTextarea().value = '1';
    keydown(getTextarea(), 'Enter', { ctrlKey: true });

    expect(focusSpy).toHaveBeenCalled();
    expect(editor.getValue()).toBe(1);

    editor.onEnd();
  });
});
