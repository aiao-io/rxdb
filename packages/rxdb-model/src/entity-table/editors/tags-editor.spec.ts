// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagsEditor } from './tags-editor.js';

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
  const input = document.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error('tags input not found');
  return input;
}

function getChips(): HTMLElement[] {
  return Array.from(document.querySelectorAll('span')).filter(s =>
    Array.from(s.children).some(c => c.tagName === 'BUTTON')
  );
}

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('TagsEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('string mode (default)', () => {
    it('declares the tags-editor type', () => {
      expect(new TagsEditor().editorType).toBe('tags-editor');
    });

    it('pre-fills chips from an array origin', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: ['a', 'b'] }) as never);
      vi.advanceTimersByTime(10);

      expect(getChips().map(c => c.firstChild?.textContent)).toEqual(['a', 'b']);
      expect(editor.getValue()).toEqual(['a', 'b']);

      editor.onEnd();
    });

    it('splits a comma-separated string origin', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: 'x, y ,z' }) as never);
      vi.advanceTimersByTime(10);

      expect(editor.getValue()).toEqual(['x', 'y', 'z']);

      editor.onEnd();
    });

    it('treats a non-array origin as a single tag', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: 'solo' }) as never);
      vi.advanceTimersByTime(10);

      expect(editor.getValue()).toEqual(['solo']);

      editor.onEnd();
    });

    it('treats a null / empty origin as no tags', () => {
      for (const value of [null, '']) {
        const editor = new TagsEditor();
        editor.onStart(createEditContext({ value }) as never);
        vi.advanceTimersByTime(10);

        expect(editor.getValue()).toEqual([]);

        editor.onEnd();
        document.body.innerHTML = '';
      }
    });

    it('adds a tag on Enter and clears the input', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = ' new-tag ';
      keydown(input, 'Enter');

      expect(editor.getValue()).toEqual(['new-tag']);
      expect(input.value).toBe('');
      expect(getChips()).toHaveLength(1);

      editor.onEnd();
    });

    it('adds a tag on comma', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'comma-tag';
      keydown(input, ',');

      expect(editor.getValue()).toEqual(['comma-tag']);

      editor.onEnd();
    });

    it('ignores an empty Enter', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      keydown(getInput(), 'Enter');
      expect(editor.getValue()).toEqual([]);

      editor.onEnd();
    });

    it('removes the last tag on Backspace with an empty input', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: ['a', 'b'] }) as never);
      vi.advanceTimersByTime(10);

      keydown(getInput(), 'Backspace');
      expect(editor.getValue()).toEqual(['a']);
      expect(getChips()).toHaveLength(1);

      editor.onEnd();
    });

    it('Backspace with a non-empty input types normally', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: ['a'] }) as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'x';
      keydown(input, 'Backspace');
      expect(editor.getValue()).toEqual(['a']);

      editor.onEnd();
    });

    it('Backspace with no tags does nothing', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      keydown(getInput(), 'Backspace');
      expect(editor.getValue()).toEqual([]);

      editor.onEnd();
    });

    it('Escape restores the original tags and ends editing', () => {
      const ctx = createEditContext({ value: ['orig'] });
      const editor = new TagsEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'changed';
      keydown(input, 'Enter');
      expect(editor.getValue()).toEqual(['orig', 'changed']);

      keydown(input, 'Escape');
      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toEqual(['orig']);

      editor.onEnd();
    });

    it('Tab commits the pending input as a new tag', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'tab-tag';
      keydown(input, 'Tab');

      expect(editor.getValue()).toEqual(['tab-tag']);
      expect(input.value).toBe('');

      editor.onEnd();
    });

    it('Tab with an empty input adds nothing', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      keydown(getInput(), 'Tab');
      expect(editor.getValue()).toEqual([]);

      editor.onEnd();
    });

    it('the chip remove button removes its tag', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: ['a', 'b', 'c'] }) as never);
      vi.advanceTimersByTime(10);

      const chips = getChips();
      const removeBtn = chips[1].querySelector('button');
      removeBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(editor.getValue()).toEqual(['a', 'c']);

      editor.onEnd();
    });

    it('outside mousedown commits the pending input and ends editing', () => {
      const ctx = createEditContext();
      const editor = new TagsEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      getInput().value = 'outside-tag';
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(ctx.endEdit).toHaveBeenCalledTimes(1);
      expect(editor.getValue()).toEqual(['outside-tag']);
      expect(document.querySelector('input[type="text"]')).toBeNull();

      editor.onEnd();
    });

    it('mousedown inside the panel does not end editing', () => {
      const ctx = createEditContext();
      const editor = new TagsEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      getInput().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(ctx.endEdit).not.toHaveBeenCalled();

      editor.onEnd();
    });

    it('isEditorElement reflects panel membership', () => {
      const ctx = createEditContext();
      const editor = new TagsEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      expect(editor.isEditorElement(getInput())).toBe(true);
      expect(editor.isEditorElement(ctx.container)).toBe(false);

      editor.onEnd();
    });

    it('onEnd removes the panel and unbinds the outside listener', () => {
      const ctx = createEditContext();
      const editor = new TagsEditor();
      editor.onStart(ctx as never);
      vi.advanceTimersByTime(10);

      editor.onEnd();
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      expect(ctx.endEdit).not.toHaveBeenCalled();
    });

    it('prefers the table cell origin value over ctx.value', () => {
      const editor = new TagsEditor();
      editor.onStart(
        createEditContext({
          value: ['wrong'],
          table: { getCellOriginValue: () => ['cell', 'value'] }
        }) as never
      );
      vi.advanceTimersByTime(10);

      expect(editor.getValue()).toEqual(['cell', 'value']);

      editor.onEnd();
    });

    it('allows duplicate tags', () => {
      const editor = new TagsEditor();
      editor.onStart(createEditContext({ value: ['a'] }) as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'a';
      keydown(input, 'Enter');

      expect(editor.getValue()).toEqual(['a', 'a']);

      editor.onEnd();
    });
  });

  describe('number mode', () => {
    it('declares the number-tags-editor type and decimal inputMode', () => {
      const editor = new TagsEditor('number');
      expect(editor.editorType).toBe('number-tags-editor');
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      expect(getInput().inputMode).toBe('decimal');

      editor.onEnd();
    });

    it('returns a number array from getValue', () => {
      const editor = new TagsEditor('number');
      editor.onStart(createEditContext({ value: ['1', '2.5', '3'] }) as never);
      vi.advanceTimersByTime(10);

      expect(editor.getValue()).toEqual([1, 2.5, 3]);

      editor.onEnd();
    });

    it('rejects a non-numeric tag', () => {
      const editor = new TagsEditor('number');
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = 'abc';
      keydown(input, 'Enter');

      expect(editor.getValue()).toEqual([]);

      editor.onEnd();
    });

    it('normalizes numeric input via Number()', () => {
      const editor = new TagsEditor('number');
      editor.onStart(createEditContext() as never);
      vi.advanceTimersByTime(10);

      const input = getInput();
      input.value = '007';
      keydown(input, 'Enter');

      expect(editor.getValue()).toEqual([7]);

      editor.onEnd();
    });
  });
});
