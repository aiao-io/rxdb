// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiSelectEditor, type MultiSelectOption } from '../../../entity-table/editors/multiselect-editor.js';

interface EditorContextLike {
  col: number;
  row: number;
  value: unknown;
  container: HTMLElement;
  table: unknown;
  endEdit: () => void;
  referencePosition: { rect: { left: number; top: number; width: number; height: number } };
}

const OPTIONS: MultiSelectOption[] = [
  { id: 'alpha', name: '甲', color: '#112233' },
  { id: 'beta', name: '乙' },
  { id: 'gamma', name: '丙', disabled: true }
];

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

function getPanel(): HTMLElement {
  const panels = Array.from(document.querySelectorAll('body > div')).filter(
    el => el.style.position === 'fixed' && el.style.zIndex === '9999'
  );
  const panel = panels[panels.length - 1];
  if (!panel) throw new Error('editor panel not found');
  return panel;
}

describe('MultiSelectEditor', () => {
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

  it('declares the multiselect-editor type', () => {
    expect(new MultiSelectEditor([]).editorType).toBe('multiselect-editor');
  });

  it('renders options with color dots and disabled checkboxes', () => {
    const editor = new MultiSelectEditor(OPTIONS);
    editor.onStart(createEditContext() as never);

    const panel = getPanel();
    expect(panel.children).toHaveLength(3);
    expect(panel.textContent).toContain('甲');
    expect(panel.textContent).toContain('乙');
    expect(panel.textContent).toContain('丙');

    const checkboxes = panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[0]?.disabled).toBe(false);
    expect(checkboxes[2]?.disabled).toBe(true);

    editor.onEnd();
  });

  it('reads the initial selection from the cell origin when not passed in', () => {
    const editor = new MultiSelectEditor(OPTIONS);
    editor.onStart(createEditContext({ value: null, table: { getCellOriginValue: () => ['alpha', 'beta'] } }) as never);

    const checkboxes = getPanel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(true);
    expect(checkboxes[2]?.checked).toBe(false);

    editor.onEnd();
  });

  it('reads the initial selection from a comma string origin', () => {
    const editor = new MultiSelectEditor(OPTIONS);
    editor.onStart(createEditContext({ value: null, table: { getCellOriginValue: () => 'alpha, beta' } }) as never);

    const checkboxes = getPanel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(true);

    editor.onEnd();
  });

  it('uses the explicit selectedIds when passed in', () => {
    const editor = new MultiSelectEditor(OPTIONS, ['beta']);
    editor.onStart(createEditContext({ value: null, table: { getCellOriginValue: () => ['alpha'] } }) as never);

    const checkboxes = getPanel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);

    editor.onEnd();
  });

  it('toggles selection on row click', () => {
    const editor = new MultiSelectEditor(OPTIONS, ['alpha']);
    editor.onStart(createEditContext() as never);

    const rows = getPanel().querySelectorAll<HTMLElement>('[data-idx]');
    rows[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(editor.getValue()).toBe('alpha, beta');

    editor.onEnd();
  });

  it('ignores clicks on disabled rows', () => {
    const editor = new MultiSelectEditor(OPTIONS, []);
    editor.onStart(createEditContext() as never);

    const rows = getPanel().querySelectorAll<HTMLElement>('[data-idx]');
    rows[2]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(editor.getValue()).toBe('');

    editor.onEnd();
  });

  it('returns selected ids joined by comma+space', () => {
    const editor = new MultiSelectEditor(OPTIONS, ['gamma', 'alpha']);
    expect(editor.getValue()).toBe('gamma, alpha');
  });

  it('fires the onCommit callback with the id list', () => {
    const onCommit = vi.fn();
    const editor = new MultiSelectEditor(OPTIONS, ['alpha', 'beta'], onCommit);
    editor.onEnd();

    expect(onCommit).toHaveBeenCalledWith(['alpha', 'beta']);
  });
});
