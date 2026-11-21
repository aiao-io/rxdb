import { describe, expect, it } from 'vitest';

import { FinderClipboard } from './finder-clipboard';

describe('FinderClipboard', () => {
  it('保存复制或剪切的文件引用，并复制路径快照', () => {
    const clipboard = new FinderClipboard();
    const path = ['Users', 'prasenjit', 'Desktop', 'note.txt'];

    clipboard.set('copy', [{ name: 'note.txt', path }]);
    path.push('changed');

    expect(clipboard.snapshot()).toEqual({
      mode: 'copy',
      entries: [{ name: 'note.txt', path: ['Users', 'prasenjit', 'Desktop', 'note.txt'] }]
    });
  });

  it('空引用和 clear 都清空剪贴板', () => {
    const clipboard = new FinderClipboard();
    clipboard.set('cut', [{ name: 'note.txt', path: ['Users', 'prasenjit', 'Desktop', 'note.txt'] }]);
    clipboard.clear();
    expect(clipboard.snapshot()).toBeNull();
    clipboard.set('copy', []);
    expect(clipboard.snapshot()).toBeNull();
  });
});
