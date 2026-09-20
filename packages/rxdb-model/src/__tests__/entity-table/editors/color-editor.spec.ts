// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorEditor } from '../../../entity-table/editors/color-editor.js';

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

function getTextInput(): HTMLInputElement {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('body > input'));
  const input = inputs.find(el => el.type === 'text');
  if (!input) throw new Error('color text input not found');
  return input;
}

function getPicker(): HTMLInputElement {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('body > input'));
  const picker = inputs.find(el => el.type === 'color');
  if (!picker) throw new Error('color picker not found');
  return picker;
}

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('ColorEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('declares the color-editor type', () => {
    expect(new ColorEditor().editorType).toBe('color-editor');
  });

  it('pre-fills the text input and picker from origin', () => {
    const editor = new ColorEditor();
    editor.onStart(createEditContext({ value: '#22c55e' }) as never);
    vi.advanceTimersByTime(10);

    expect(getTextInput().value).toBe('#22c55e');
    expect(getPicker().value).toBe('#22c55e');
    expect(editor.getValue()).toBe('#22c55e');

    editor.onEnd();
  });

  it('normalizes an origin without the # prefix', () => {
    const editor = new ColorEditor();
    editor.onStart(createEditContext({ value: '22c55e' }) as never);
    vi.advanceTimersByTime(10);

    expect(getTextInput().value).toBe('#22c55e');
    expect(editor.getValue()).toBe('#22c55e');

    editor.onEnd();
  });

  it('treats an invalid origin as null', () => {
    const editor = new ColorEditor();
    editor.onStart(createEditContext({ value: '#zzz' }) as never);
    vi.advanceTimersByTime(10);

    expect(getTextInput().value).toBe('');
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('commits a valid hex color on Enter', () => {
    const ctx = createEditContext();
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getTextInput();
    input.value = '#abcdef';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe('#abcdef');

    editor.onEnd();
  });

  it('rejects an invalid hex color on Enter', () => {
    const ctx = createEditContext();
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getTextInput();
    input.value = 'red';
    keydown(input, 'Enter');

    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('syncs the text input when the picker changes', () => {
    const editor = new ColorEditor();
    editor.onStart(createEditContext() as never);
    vi.advanceTimersByTime(10);

    const picker = getPicker();
    picker.value = '#112233';
    picker.dispatchEvent(new Event('input', { bubbles: true }));

    expect(getTextInput().value).toBe('#112233');

    editor.onEnd();
  });

  it('commits null when the input is blank', () => {
    const ctx = createEditContext({ value: '#22c55e' });
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getTextInput();
    input.value = '';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('Escape restores the original value', () => {
    const ctx = createEditContext({ value: '#22c55e' });
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getTextInput();
    input.value = '#000000';
    keydown(input, 'Escape');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe('#22c55e');

    editor.onEnd();
  });

  it('outside mousedown commits a valid input', () => {
    const ctx = createEditContext();
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getTextInput().value = '#abcdef';
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe('#abcdef');

    editor.onEnd();
  });

  it('isEditorElement matches input, picker and tooltip', () => {
    const ctx = createEditContext();
    const editor = new ColorEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    expect(editor.isEditorElement(getTextInput())).toBe(true);
    expect(editor.isEditorElement(getPicker())).toBe(true);
    expect(editor.isEditorElement(ctx.container)).toBe(false);

    editor.onEnd();
  });

  it('onEnd removes the inputs', () => {
    const editor = new ColorEditor();
    editor.onStart(createEditContext() as never);
    vi.advanceTimersByTime(10);

    editor.onEnd();
    expect(document.querySelector('body > input')).toBeNull();
  });
});
