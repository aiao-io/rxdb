// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAISY_COLORS,
  GlobalOverlayEditor,
  positionOverlayPanel,
  refocusTable,
  scheduleEditorSetup
} from '../../../entity-table/editors/global-overlay-editor.js';

/** 可实例化的测试子类，记录交互行为 */
class RecordingOverlayEditor extends GlobalOverlayEditor {
  private items: string[];
  private readonly initialFocus: number;
  private selectedValue = '';

  protected get initialFocusIndex(): number {
    return this.initialFocus;
  }

  protected get itemCount(): number {
    return this.items.length;
  }

  focusChanges: Array<[number, number]> = [];
  clicked: number[] = [];
  deleteCalled = 0;

  readonly editorType = 'test-overlay-editor';

  constructor(items: string[] = [], initialFocus = 0) {
    super();
    this.items = items;
    this.initialFocus = initialFocus;
  }

  getValue(): string {
    return this.selectedValue;
  }

  /** 测试用公开访问器：rowAt 在基类为 protected，spec 经此访问行元素 */
  rowAtPublic(index: number) {
    return this.rowAt(index);
  }

  protected buildRows(panel: HTMLDivElement): void {
    this.items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.dataset['idx'] = String(idx);
      row.textContent = item;
      panel.appendChild(row);
    });
  }

  protected onRowClick(idx: number): void {
    this.clicked.push(idx);
    this.selectedValue = this.items[idx] ?? '';
    this.close();
  }

  protected onFocusChange(idx: number, prev: number): void {
    this.focusChanges.push([idx, prev]);
  }

  protected override onDeleteKey(): void {
    this.deleteCalled++;
    this.close();
  }
}

function createEditContext(endEdit = vi.fn()) {
  const container = document.createElement('div');
  container.tabIndex = 0;
  document.body.appendChild(container);

  return {
    col: 1,
    row: 1,
    value: '',
    container,
    table: null,
    endEdit,
    referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
  };
}

function dispatchKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('DAISY_COLORS', () => {
  it('exposes daisyUI v5 CSS variable tokens', () => {
    expect(Object.keys(DAISY_COLORS)).toHaveLength(10);
    expect(DAISY_COLORS.bg).toBe('var(--color-base-100)');
    expect(DAISY_COLORS.error).toBe('var(--color-error)');
    expect(DAISY_COLORS.selectedBg).toContain('color-mix');
  });
});

describe('scheduleEditorSetup', () => {
  it('invokes the callback after the setup delay', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleEditorSetup(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('refocusTable', () => {
  it('focuses the container', () => {
    const container = document.createElement('div');
    container.tabIndex = 0;
    const spy = vi.spyOn(container, 'focus');
    refocusTable(container);
    expect(spy).toHaveBeenCalled();
  });

  it('tolerates a missing container', () => {
    expect(() => refocusTable(null)).not.toThrow();
    expect(() => refocusTable(undefined)).not.toThrow();
  });
});

describe('positionOverlayPanel', () => {
  it('positions below the cell when there is enough space', () => {
    const panel = document.createElement('div');
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 200,
        width: 500,
        height: 300,
        right: 600,
        bottom: 500,
        x: 100,
        y: 200,
        toJSON: () => ({})
      }) as DOMRect;

    positionOverlayPanel(panel, { left: 10, top: 5, width: 120, height: 24 }, container, 280);

    expect(panel.style.left).toBe('110px');
    expect(panel.style.top).toBe('231px');
  });

  it('flips above the cell when space below is insufficient', () => {
    const panel = document.createElement('div');
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 500,
        width: 500,
        height: 300,
        right: 500,
        bottom: 800,
        x: 0,
        y: 500,
        toJSON: () => ({})
      }) as DOMRect;

    positionOverlayPanel(panel, { left: 0, top: 0, width: 120, height: 24 }, container, 280);

    expect(panel.style.top).toBe('216px');
  });

  it('treats a missing container as origin (0,0)', () => {
    const panel = document.createElement('div');
    positionOverlayPanel(panel, { left: 5, top: 7 }, null, 80);
    expect(panel.style.left).toBe('8px');
    expect(panel.style.top).toBe('9px');
  });

  it('clamps the right edge when maxRight is provided', () => {
    const panel = document.createElement('div');
    positionOverlayPanel(panel, { left: 900, top: 0, width: 100, height: 24 }, null, 80, {
      maxRight: 320
    });
    const expected = Math.max(8, Math.min(900, window.innerWidth - 320));
    expect(panel.style.left).toBe(`${expected}px`);
  });

  it('applies minWidth when provided', () => {
    const panel = document.createElement('div');
    positionOverlayPanel(panel, { left: 0, top: 0, width: 100, height: 24 }, null, 80, { minWidth: 240 });
    expect(panel.style.minWidth).toBe('240px');
  });

  it('uses the cell width when it exceeds minWidth', () => {
    const panel = document.createElement('div');
    positionOverlayPanel(panel, { left: 0, top: 0, width: 300, height: 24 }, null, 80, { minWidth: 240 });
    expect(panel.style.minWidth).toBe('300px');
  });
});

describe('GlobalOverlayEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function getPanel(): HTMLDivElement {
    const panel = Array.from(document.querySelectorAll<HTMLDivElement>('div')).find(d => d.style.position === 'fixed');
    if (!panel) throw new Error('overlay panel not found');
    return panel;
  }

  function startEditor(editor: RecordingOverlayEditor, ctx = createEditContext()) {
    editor.onStart(ctx as never);
    return ctx;
  }

  it('builds rows and attaches the panel to the body on start', () => {
    const editor = new RecordingOverlayEditor(['a', 'b', 'c']);
    const ctx = startEditor(editor);

    expect(editor.rowAtPublic(0)?.textContent).toBe('a');
    expect(editor.rowAtPublic(2)?.textContent).toBe('c');
    expect(document.body.contains(getPanel())).toBe(true);
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('reports panel membership via isEditorElement', () => {
    const editor = new RecordingOverlayEditor(['a', 'b']);
    const ctx = startEditor(editor);

    expect(editor.isEditorElement(editor.rowAtPublic(0) as HTMLElement)).toBe(true);
    expect(editor.isEditorElement(ctx.container as HTMLElement)).toBe(false);
    expect(editor.isEditorElement(document.body)).toBe(false);

    editor.onEnd();
  });

  it('ArrowDown moves focus from the initial index', () => {
    const editor = new RecordingOverlayEditor(['a', 'b', 'c'], 0);
    startEditor(editor);

    dispatchKey('ArrowDown');
    expect(editor.focusChanges).toEqual([[1, 0]]);

    editor.onEnd();
  });

  it('ArrowUp moves focus back and wraps around', () => {
    const editor = new RecordingOverlayEditor(['a', 'b', 'c'], 1);
    startEditor(editor);

    dispatchKey('ArrowUp');
    expect(editor.focusChanges).toEqual([[0, 1]]);

    dispatchKey('ArrowUp');
    expect(editor.focusChanges).toEqual([
      [0, 1],
      [2, 0]
    ]);

    editor.onEnd();
  });

  it('ArrowDown wraps from the last row to the first', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 1);
    startEditor(editor);

    dispatchKey('ArrowDown');
    expect(editor.focusChanges).toEqual([[0, 1]]);

    editor.onEnd();
  });

  it('ArrowDown from no focus selects the first row', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], -1);
    startEditor(editor);

    dispatchKey('ArrowDown');
    expect(editor.focusChanges).toEqual([[0, -1]]);

    editor.onEnd();
  });

  it('ArrowUp from no focus selects the last row', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], -1);
    startEditor(editor);

    dispatchKey('ArrowUp');
    expect(editor.focusChanges).toEqual([[1, -1]]);

    editor.onEnd();
  });

  it('does nothing on arrow keys when there are no items', () => {
    const editor = new RecordingOverlayEditor([], -1);
    startEditor(editor);

    dispatchKey('ArrowDown');
    dispatchKey('ArrowUp');
    expect(editor.focusChanges).toEqual([]);

    editor.onEnd();
  });

  it('Enter selects the focused row and closes', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 1);
    const ctx = startEditor(editor);

    dispatchKey('Enter');
    expect(editor.clicked).toEqual([1]);
    expect(editor.getValue()).toBe('b');
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Space selects the focused row', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 0);
    startEditor(editor);

    dispatchKey(' ');
    expect(editor.clicked).toEqual([0]);

    editor.onEnd();
  });

  it('Enter without focus does nothing', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], -1);
    const ctx = startEditor(editor);

    dispatchKey('Enter');
    expect(editor.clicked).toEqual([]);
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('Delete and Backspace trigger onDeleteKey', () => {
    const editor = new RecordingOverlayEditor(['a']);
    const ctx = startEditor(editor);

    dispatchKey('Delete');
    expect(editor.deleteCalled).toBe(1);
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Backspace triggers onDeleteKey as well', () => {
    const editor = new RecordingOverlayEditor(['a']);
    const ctx = startEditor(editor);

    dispatchKey('Backspace');
    expect(editor.deleteCalled).toBe(1);
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('Escape closes without selecting', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 0);
    const ctx = startEditor(editor);

    dispatchKey('Escape');
    expect(editor.clicked).toEqual([]);
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mousedown outside the panel closes the editor', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 0);
    const ctx = startEditor(editor);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).toHaveBeenCalledTimes(1);

    editor.onEnd();
  });

  it('mousedown inside the panel keeps the editor open', () => {
    const editor = new RecordingOverlayEditor(['a', 'b'], 0);
    const ctx = startEditor(editor);

    editor.rowAtPublic(0)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ctx.endEdit).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('close() refocuses the table container', () => {
    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);
    const focusSpy = vi.spyOn(container, 'focus');

    const editor = new RecordingOverlayEditor(['a'], 0);
    startEditor(editor, { ...createEditContext(), container } as never);

    dispatchKey('Escape');
    expect(focusSpy).toHaveBeenCalled();

    editor.onEnd();
  });

  it('adjustPosition updates the panel position', () => {
    const editor = new RecordingOverlayEditor(['a'], 0);
    startEditor(editor);

    editor.adjustPosition({ left: 30, top: 40, width: 200, height: 24 });
    const panel = getPanel();
    expect(panel.style.left).toBe('30px');
    expect(panel.style.top).toBe('64px');
    expect(panel.style.minWidth).toBe('200px');

    editor.onEnd();
  });

  it('flips the panel above the cell when it would overflow the bottom', () => {
    Element.prototype.scrollIntoView ||= () => undefined;
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return 0;
    });

    const editor = new RecordingOverlayEditor(['a'], 0);
    const ctx = createEditContext();
    startEditor(editor, ctx as never);

    const panel = getPanel();
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 1000 });
    rafQueue.forEach(cb => cb(0));

    expect(panel.style.top).toBe('-1000px');

    editor.onEnd();
  });

  it('scrolls the focused row into view after start', () => {
    Element.prototype.scrollIntoView ||= () => undefined;
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return 0;
    });

    const editor = new RecordingOverlayEditor(['a', 'b'], 1);
    startEditor(editor);
    rafQueue.forEach(cb => cb(0));

    expect(scrollSpy).toHaveBeenCalled();

    editor.onEnd();
  });

  it('does not scroll when there is no initial focus', () => {
    Element.prototype.scrollIntoView ||= () => undefined;
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return 0;
    });

    const editor = new RecordingOverlayEditor(['a', 'b'], -1);
    startEditor(editor);
    rafQueue.forEach(cb => cb(0));

    expect(scrollSpy).not.toHaveBeenCalled();

    editor.onEnd();
  });

  it('onEnd removes the panel and unbinds listeners', () => {
    const editor = new RecordingOverlayEditor(['a'], 0);
    const ctx = startEditor(editor);

    editor.onEnd();
    expect(Array.from(document.querySelectorAll('div')).some(d => d.style.position === 'fixed')).toBe(false);

    // listeners removed: outside mousedown and Escape no longer end editing
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    dispatchKey('Escape');
    expect(ctx.endEdit).not.toHaveBeenCalled();
  });

  it('isEditorElement returns false when no panel is open', () => {
    const editor = new RecordingOverlayEditor(['a'], 0);
    expect(editor.isEditorElement(document.body)).toBe(false);
  });

  it('rowAt returns null for an unknown index', () => {
    const editor = new RecordingOverlayEditor(['a'], 0);
    startEditor(editor);
    expect(editor.rowAtPublic(5)).toBeNull();
    editor.onEnd();
  });
});
