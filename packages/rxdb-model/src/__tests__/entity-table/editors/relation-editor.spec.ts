// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatedEntityItem } from '../../../entity-form/interfaces.js';
import { RelationEditor } from '../../../entity-table/editors/relation-editor.js';

const ITEMS: RelatedEntityItem[] = [
  { id: 'u1', displayName: 'Alice' },
  { id: 'u2', displayName: 'Bob' },
  { id: 'g1', displayName: 'Team Alpha' }
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

function getSearchInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error('search input not found');
  return input;
}

function getRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div[data-idx]'));
}

function dispatchKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('RelationEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView ||= () => undefined;
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('declares the relation-editor type', () => {
    expect(new RelationEditor(ITEMS).editorType).toBe('relation-editor');
  });

  it('renders static items with display names', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext({ value: 'u1' }) as never);

    expect(getRows().map(r => r.textContent)).toEqual(['Alice', 'Bob', 'Team Alpha']);

    editor.onEnd();
  });

  it('resolves a provider function on every start', () => {
    const provider = vi.fn().mockReturnValue(ITEMS);
    const editor = new RelationEditor(provider);
    editor.onStart(createEditContext() as never);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(getRows()).toHaveLength(3);

    editor.onEnd();
  });

  it('prepends a null option when nullable', () => {
    const editor = new RelationEditor(ITEMS, true);
    editor.onStart(createEditContext({ value: 'u1' }) as never);

    const rows = getRows();
    expect(rows.map(r => r.textContent)).toEqual(['(空)', 'Alice', 'Bob', 'Team Alpha']);
    expect(rows[0].style.fontStyle).toBe('italic');

    editor.onEnd();
  });

  it('focuses the current value row after the focus timer fires', () => {
    const ctx = createEditContext({ value: 'u2' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    vi.advanceTimersByTime(10);
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('u2');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('reads the cell origin value from the table', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(
      createEditContext({
        value: 'ignored',
        table: { getCellOriginValue: () => 'g1' }
      }) as never
    );

    expect(editor.getValue()).toBe('g1');
    // 10ms 后聚焦到当前值所在行
    vi.advanceTimersByTime(10);
    expect(document.activeElement).toBe(getSearchInput());

    editor.onEnd();
  });

  it('filters items by displayName as the user types', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext() as never);

    const input = getSearchInput();
    input.value = 'al';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(getRows().map(r => r.textContent)).toEqual(['Alice', 'Team Alpha']);

    editor.onEnd();
  });

  it('filters items by id', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext() as never);

    const input = getSearchInput();
    input.value = 'U2';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(getRows().map(r => r.textContent)).toEqual(['Bob']);

    editor.onEnd();
  });

  it('shows an empty state when nothing matches', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext() as never);

    const input = getSearchInput();
    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(getRows()).toHaveLength(0);
    expect(document.body.textContent).toContain('无匹配结果');

    editor.onEnd();
  });

  it('shows the empty state for an empty item list', () => {
    const editor = new RelationEditor([]);
    editor.onStart(createEditContext() as never);

    expect(document.body.textContent).toContain('无匹配结果');

    editor.onEnd();
  });

  it('ArrowDown / Enter selects the focused row', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    vi.advanceTimersByTime(10); // 聚焦到当前值行 (idx 0)
    dispatchKey('ArrowDown');
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('u2');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('ArrowUp from no focus selects the last row', () => {
    const ctx = createEditContext();
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    dispatchKey('ArrowUp');
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('g1');

    editor.onEnd();
  });

  it('clamps focus when moving past the last row', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext({ value: 'g1' }) as never);

    vi.advanceTimersByTime(10); // 聚焦到当前值行 (idx 2)
    dispatchKey('ArrowDown'); // 应保持 idx 2
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('g1');

    editor.onEnd();
  });

  it('Enter without focus does nothing', () => {
    const ctx = createEditContext();
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    dispatchKey('Enter');
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('Escape cancels and restores the original value', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    dispatchKey('ArrowDown');
    expect(editor.getValue()).toBe('u1'); // 尚未选中，仅移动焦点

    dispatchKey('Escape');
    expect(editor.getValue()).toBe('u1');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Delete clears the value when nullable and not typing in search', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS, true);
    editor.onStart(ctx as never);

    dispatchKey('Delete');
    expect(editor.getValue()).toBe('');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Backspace clears the value when nullable', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS, true);
    editor.onStart(ctx as never);

    dispatchKey('Backspace');
    expect(editor.getValue()).toBe('');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Delete is ignored when focus is inside the search input', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS, true);
    editor.onStart(ctx as never);
    vi.advanceTimersByTime(10); // 搜索框获得焦点

    dispatchKey('Delete');
    expect(ctx.endEdit).not.toHaveBeenCalled();
    expect(editor.getValue()).toBe('u1');

    editor.onEnd();
  });

  it('Delete does not clear when the editor is not nullable', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    dispatchKey('Delete');
    expect(ctx.endEdit).not.toHaveBeenCalled();
    expect(editor.getValue()).toBe('u1');

    editor.onEnd();
  });

  it('mousedown on a row selects it', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    getRows()[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(editor.getValue()).toBe('u2');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mouseenter focuses a row and Enter selects it', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    getRows()[2].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    dispatchKey('Enter');

    expect(editor.getValue()).toBe('g1');

    editor.onEnd();
  });

  it('outside mousedown cancels the edit', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(editor.getValue()).toBe('u1');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mousedown inside the panel does not cancel', () => {
    const ctx = createEditContext({ value: 'u1' });
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    getSearchInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('isEditorElement reflects panel membership', () => {
    const ctx = createEditContext();
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    expect(editor.isEditorElement(getSearchInput())).toBe(true);
    expect(editor.isEditorElement(ctx.container)).toBe(false);

    editor.onEnd();
  });

  it('adjustPosition repositions the panel', () => {
    const editor = new RelationEditor(ITEMS);
    editor.onStart(
      createEditContext({ referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } } }) as never
    );

    editor.adjustPosition({ left: 25, top: 35, width: 150, height: 24 });
    const panel = Array.from(document.querySelectorAll('div')).find(d => d.style.position === 'fixed');
    expect(panel?.style.left).toBe('25px');
    expect(panel?.style.top).toBe('61px');

    editor.onEnd();
  });

  it('onEnd removes the panel and unbinds listeners', () => {
    const ctx = createEditContext();
    const editor = new RelationEditor(ITEMS);
    editor.onStart(ctx as never);

    editor.onEnd();
    expect(Array.from(document.querySelectorAll('div')).some(d => d.style.position === 'fixed')).toBe(false);

    dispatchKey('Escape');
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });

  it('scrolls the focused row into view after the focus timer fires', () => {
    const scrollSpy = vi.mocked(Element.prototype.scrollIntoView);
    scrollSpy.mockClear();

    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext({ value: 'u1' }) as never);

    vi.advanceTimersByTime(10);
    expect(scrollSpy).toHaveBeenCalled();

    editor.onEnd();
  });

  it('refocuses the table container when committing', () => {
    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(container, 'focus');

    const editor = new RelationEditor(ITEMS);
    editor.onStart(createEditContext({ container, value: 'u1' }) as never);

    dispatchKey('ArrowDown');
    dispatchKey('Enter');
    expect(focusSpy).toHaveBeenCalled();

    editor.onEnd();
  });
});
