// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UuidEditor } from '../../../entity-table/editors/uuid-editor.js';
import { UUID_RE } from '../../../entity-value.utils.js';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_UUID_UPPER = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

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

describe('UuidEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('pre-fills the input from the origin value', () => {
    const editor = new UuidEditor();
    editor.onStart(createEditContext({ value: VALID_UUID_UPPER }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe(VALID_UUID_UPPER);
    expect(getInput().placeholder).toBe('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

    editor.onEnd();
  });

  it('trims the origin value', () => {
    const editor = new UuidEditor();
    editor.onStart(createEditContext({ value: `  ${VALID_UUID}  ` }) as never);
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('treats a null / empty origin as null', () => {
    for (const value of [null, '']) {
      const editor = new UuidEditor();
      editor.onStart(createEditContext({ value }) as never);
      vi.advanceTimersByTime(10);

      expect(getInput().value).toBe('');
      expect(editor.getValue()).toBeNull();

      editor.onEnd();
      document.body.innerHTML = '';
    }
  });

  it('prefers the table cell origin value over ctx.value', () => {
    const editor = new UuidEditor();
    editor.onStart(
      createEditContext({
        value: 'ignored',
        table: { getCellOriginValue: () => VALID_UUID }
      }) as never
    );
    vi.advanceTimersByTime(10);

    expect(getInput().value).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('commits a valid UUID lowercased on Enter', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = VALID_UUID_UPPER;
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('shows a detailed error and stays open on an invalid Enter', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'not-a-uuid';
    keydown(input, 'Enter');

    expect(ctx.endEdit).not.toHaveBeenCalled();
    expect(getTooltip().style.display).toBe('block');
    expect(getTooltip().textContent).toContain('UUID');

    editor.onEnd();
  });

  it('commits null on Enter with a blank input', () => {
    const ctx = createEditContext({ value: VALID_UUID });
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '  ';
    keydown(input, 'Enter');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('commits on Tab', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = VALID_UUID_UPPER;
    keydown(input, 'Tab');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('Escape restores the original value', () => {
    const ctx = createEditContext({ value: VALID_UUID });
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = VALID_UUID_UPPER;
    keydown(input, 'Escape');

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('shows a live error hint while typing an invalid UUID', () => {
    const editor = new UuidEditor();
    editor.onStart(createEditContext() as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'invalid';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(getTooltip().style.display).toBe('block');
    expect(getTooltip().textContent).toContain('UUID');

    editor.onEnd();
  });

  it('clears the live error hint once the input is valid or empty', () => {
    const editor = new UuidEditor();
    editor.onStart(createEditContext() as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'invalid';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getTooltip().style.display).toBe('block');

    input.value = VALID_UUID;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getTooltip().style.display).toBe('none');

    input.value = 'still-invalid';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getTooltip().style.display).toBe('block');

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getTooltip().style.display).toBe('none');

    editor.onEnd();
  });

  it('outside mousedown commits a valid UUID lowercased', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = VALID_UUID_UPPER;
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe(VALID_UUID);
    expect(document.querySelector('body > input')).toBeNull();

    editor.onEnd();
  });

  it('outside mousedown with a blank input commits null', () => {
    const ctx = createEditContext({ value: VALID_UUID });
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = '';
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });

  it('outside mousedown with an invalid input reverts to the original value', () => {
    const ctx = createEditContext({ value: VALID_UUID });
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    const input = getInput();
    input.value = 'invalid';
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(ctx.endEdit).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toBe(VALID_UUID);

    editor.onEnd();
  });

  it('mousedown on the input or tooltip does not end editing', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    getInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();

    getTooltip().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('adjustPosition repositions the input and tooltip', () => {
    const editor = new UuidEditor();
    editor.onStart(
      createEditContext({ referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } } }) as never
    );
    vi.advanceTimersByTime(10);

    editor.adjustPosition({ left: 10, top: 20, width: 80, height: 30 });
    expect(getInput().style.left).toBe('10px');
    expect(getInput().style.top).toBe('20px');
    expect(getTooltip().style.top).toBe('52px');

    editor.onEnd();
  });

  it('adjustPosition before onStart is a no-op', () => {
    const editor = new UuidEditor();
    expect(() => editor.adjustPosition({ left: 0, top: 0, width: 10, height: 10 })).not.toThrow();
  });

  it('isEditorElement matches the input and tooltip', () => {
    const ctx = createEditContext();
    const editor = new UuidEditor();
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
    const editor = new UuidEditor();
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10);

    editor.onEnd();
    expect(document.querySelector('body > input')).toBeNull();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });

  it('re-exports the UUID_RE matcher', () => {
    expect(UUID_RE.test(VALID_UUID)).toBe(true);
    expect(UUID_RE.test('nope')).toBe(false);
  });
});
