import { describe, expect, it, vi } from 'vitest';
import { SafeListEditor } from './safe-list-editor.js';

describe('SafeListEditor', () => {
  it('swallows TypeError from super.onEnd', () => {
    const editor = new SafeListEditor({ values: [] });
    // ListEditor.onEnd accesses element.parentNode which is null before init
    expect(() => editor.onEnd()).not.toThrow();
  });

  it('rethrows non-TypeError exceptions', () => {
    const editor = new SafeListEditor({ values: [] });
    const error = new RangeError('not a TypeError');
    vi.spyOn(Object.getPrototypeOf(SafeListEditor.prototype), 'onEnd').mockImplementation(() => {
      throw error;
    });
    expect(() => editor.onEnd()).toThrow(error);
    vi.restoreAllMocks();
  });
});
