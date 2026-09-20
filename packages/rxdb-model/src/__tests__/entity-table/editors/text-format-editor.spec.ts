// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextFormatEditor } from '../../../entity-table/editors/text-format-editor.js';

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

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('TextFormatEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('declares the text-format-editor type', () => {
    expect(new TextFormatEditor('url').editorType).toBe('text-format-editor');
  });

  it('pre-fills the input from origin', () => {
    const editor = new TextFormatEditor('email');
    editor.onStart(createEditContext({ value: 'a@example.com' }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe('a@example.com');
    expect(getInput().inputMode).toBe('email');

    editor.onEnd();
  });

  it('commits a valid url on Enter', () => {
    const ctx = createEditContext();
    const editor = new TextFormatEditor('url');
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'https://example.com/a';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe('https://example.com/a');

    editor.onEnd();
  });

  it('rejects a url outside the scheme whitelist', () => {
    const ctx = createEditContext();
    const editor = new TextFormatEditor('url', ['HTTPS']);
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'http://example.com/a';
    keydown(input, 'Enter');

    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('rejects a malformed email on Enter', () => {
    const ctx = createEditContext();
    const editor = new TextFormatEditor('email');
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'a@example';
    keydown(input, 'Enter');

    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('commits a valid phone on Enter', () => {
    const ctx = createEditContext();
    const editor = new TextFormatEditor('phone');
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '+86 138-0000-0000';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('commits null when the input is blank', () => {
    const ctx = createEditContext({ value: 'https://example.com' });
    const editor = new TextFormatEditor('url');
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('Escape restores the original value', () => {
    const ctx = createEditContext({ value: 'a@example.com' });
    const editor = new TextFormatEditor('email');
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'b@example.com';
    keydown(input, 'Escape');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe('a@example.com');

    editor.onEnd();
  });

  it('onEnd removes the input', () => {
    const editor = new TextFormatEditor('url');
    editor.onStart(createEditContext() as never);
    vi.advanceTimersByTime(10);

    editor.onEnd();
    expect(document.querySelector('body > input')).toBeNull();
  });
});
