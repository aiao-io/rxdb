import { describe, expect, it } from 'vitest';

import { isMenuKey, nextIndex } from './menu-list';

const key = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

describe('isMenuKey 键盘弹出上下文菜单的按键', () => {
  it('Menu 键与 Shift+F10 是，单独的 F10 与别的键不是', () => {
    expect(isMenuKey(key({ key: 'ContextMenu' }))).toBe(true);
    expect(isMenuKey(key({ key: 'F10', shiftKey: true }))).toBe(true);
    expect(isMenuKey(key({ key: 'F10', shiftKey: false }))).toBe(false);
    expect(isMenuKey(key({ key: 'Enter' }))).toBe(false);
  });
});

describe('nextIndex 菜单里方向键的去向', () => {
  it('向下、向上在可用项里循环', () => {
    expect(nextIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('Home 去第一项，End 去最后一项', () => {
    expect(nextIndex('Home', 2, 4)).toBe(0);
    expect(nextIndex('End', 0, 4)).toBe(3);
  });

  it('焦点不在任何项上时：向下去第一项，向上去最后一项', () => {
    expect(nextIndex('ArrowDown', -1, 3)).toBe(0);
    expect(nextIndex('ArrowUp', -1, 3)).toBe(2);
  });

  it('不是导航键返回 null，由调用方放行', () => {
    expect(nextIndex('a', 0, 3)).toBeNull();
    expect(nextIndex('Enter', 1, 3)).toBeNull();
  });
});
