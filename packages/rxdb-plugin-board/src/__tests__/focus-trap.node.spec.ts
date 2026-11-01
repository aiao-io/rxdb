import { describe, expect, it } from 'vitest';

import { trapTabFocus } from '../focus-trap.js';

describe('trapTabFocus（模态对话框的 Tab 循环）', () => {
  const items = ['title', 'save', 'cancel'];

  it('末个 Tab 绕回首个、首个 Shift+Tab 绕回末个', () => {
    expect(trapTabFocus(items, 'cancel', false)).toBe('title');
    expect(trapTabFocus(items, 'title', true)).toBe('cancel');
  });

  it('焦点在中间：交给浏览器默认顺序', () => {
    expect(trapTabFocus(items, 'save', false)).toBeNull();
    expect(trapTabFocus(items, 'save', true)).toBeNull();
    expect(trapTabFocus(items, 'title', false)).toBeNull();
    expect(trapTabFocus(items, 'cancel', true)).toBeNull();
  });

  it('焦点不在对话框的可聚焦序列里（落在 body 或背后的卡片）：拉回对话框首 / 末个', () => {
    expect(trapTabFocus(items, null, false)).toBe('title');
    expect(trapTabFocus(items, 'card', false)).toBe('title');
    expect(trapTabFocus(items, 'card', true)).toBe('cancel');
  });

  it('只有一个可聚焦元素时原地循环；没有可聚焦元素不接管', () => {
    expect(trapTabFocus(['close'], 'close', false)).toBe('close');
    expect(trapTabFocus(['close'], 'close', true)).toBe('close');
    expect(trapTabFocus([], null, false)).toBeNull();
  });
});
