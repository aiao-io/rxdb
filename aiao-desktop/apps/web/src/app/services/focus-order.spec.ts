import { describe, expect, it } from 'vitest';

import { barIndex, isKeyboardClick, sliderValue, tabTarget, typeaheadIndex } from './focus-order';

describe('isKeyboardClick 键盘或读屏触发的点击', () => {
  it('detail 为 0 的 click 是键盘 / 读屏触发的，鼠标点击至少是 1', () => {
    expect(isKeyboardClick({ detail: 0 })).toBe(true);
    expect(isKeyboardClick({ detail: 1 })).toBe(false);
    expect(isKeyboardClick({ detail: 2 })).toBe(false);
  });
});

describe('tabTarget 焦点陷阱里 Tab 的去向', () => {
  const items = ['a', 'b', 'c'];

  it('中间的元素放行，由浏览器按文档顺序移动', () => {
    expect(tabTarget(items, 'a', false)).toBeNull();
    expect(tabTarget(items, 'b', false)).toBeNull();
    expect(tabTarget(items, 'b', true)).toBeNull();
    expect(tabTarget(items, 'c', true)).toBeNull();
  });

  it('在最后一个上按 Tab 绕回第一个，在第一个上按 Shift+Tab 绕回最后一个', () => {
    expect(tabTarget(items, 'c', false)).toBe('a');
    expect(tabTarget(items, 'a', true)).toBe('c');
  });

  it('焦点不在可 Tab 的元素上（陷阱容器自己、没有焦点）：向前去第一个，向后去最后一个', () => {
    expect(tabTarget(items, null, false)).toBe('a');
    expect(tabTarget(items, null, true)).toBe('c');
    expect(tabTarget(items, 'container', false)).toBe('a');
    expect(tabTarget(items, 'container', true)).toBe('c');
  });

  it('只有一个可 Tab 的元素：两个方向都停在它上面', () => {
    expect(tabTarget(['only'], 'only', false)).toBe('only');
    expect(tabTarget(['only'], 'only', true)).toBe('only');
  });

  it('一个可 Tab 的元素也没有：返回 null，由调用方拦下按键、把焦点留在容器上', () => {
    expect(tabTarget([], null, false)).toBeNull();
    expect(tabTarget([], 'container', true)).toBeNull();
  });
});

describe('barIndex 菜单栏里左右方向键的去向', () => {
  it('向右、向左在条目里循环', () => {
    expect(barIndex('ArrowRight', 0, 3)).toBe(1);
    expect(barIndex('ArrowRight', 2, 3)).toBe(0);
    expect(barIndex('ArrowLeft', 1, 3)).toBe(0);
    expect(barIndex('ArrowLeft', 0, 3)).toBe(2);
  });

  it('Home 去第一项，End 去最后一项', () => {
    expect(barIndex('Home', 2, 4)).toBe(0);
    expect(barIndex('End', 0, 4)).toBe(3);
  });

  it('上下方向键与其他键不归菜单栏管（上下是展开菜单），返回 null', () => {
    expect(barIndex('ArrowDown', 0, 3)).toBeNull();
    expect(barIndex('ArrowUp', 0, 3)).toBeNull();
    expect(barIndex('Enter', 0, 3)).toBeNull();
  });

  it('焦点不在任何条目上（at 为 -1）：向右去第一项，向左去最后一项', () => {
    expect(barIndex('ArrowRight', -1, 3)).toBe(0);
    expect(barIndex('ArrowLeft', -1, 3)).toBe(2);
  });
});

describe('typeaheadIndex 菜单里按首字母跳转', () => {
  const labels = ['Documents', 'Desktop', 'Downloads', 'Applications'];

  it('从当前项之后找以该字母开头的下一项，不区分大小写', () => {
    expect(typeaheadIndex(labels, 0, 'd')).toBe(1);
    expect(typeaheadIndex(labels, 1, 'D')).toBe(2);
  });

  it('找到末尾仍没有就绕回开头；当前项自己是唯一匹配时留在原地', () => {
    expect(typeaheadIndex(labels, 2, 'd')).toBe(0);
    expect(typeaheadIndex(labels, 3, 'a')).toBe(3);
  });

  it('没有以该字母开头的项返回 null', () => {
    expect(typeaheadIndex(labels, 0, 'z')).toBeNull();
  });

  it('不是单个可打印字符（修饰键、功能键、多字符）返回 null', () => {
    expect(typeaheadIndex(labels, 0, 'Shift')).toBeNull();
    expect(typeaheadIndex(labels, 0, ' ')).toBeNull();
    expect(typeaheadIndex(labels, 0, '')).toBeNull();
  });

  it('焦点不在任何项上（at 为 -1）：从第一项开始找', () => {
    expect(typeaheadIndex(labels, -1, 'a')).toBe(3);
    expect(typeaheadIndex(labels, -1, 'd')).toBe(0);
  });
});

describe('sliderValue 滑块的键盘操作', () => {
  it('方向键每次 5%，翻页键每次 10%，Home / End 到两端', () => {
    expect(sliderValue('ArrowRight', 0.5)).toBe(0.55);
    expect(sliderValue('ArrowUp', 0.5)).toBe(0.55);
    expect(sliderValue('ArrowLeft', 0.5)).toBe(0.45);
    expect(sliderValue('ArrowDown', 0.5)).toBe(0.45);
    expect(sliderValue('PageUp', 0.5)).toBe(0.6);
    expect(sliderValue('PageDown', 0.5)).toBe(0.4);
    expect(sliderValue('Home', 0.5)).toBe(0);
    expect(sliderValue('End', 0.5)).toBe(1);
  });

  it('结果夹在 0 到 1 之间，浮点误差不会累积（0.25 加三次 0.05 恰好是 0.4，不是 0.4000000000000001）', () => {
    expect(sliderValue('ArrowRight', 0.98)).toBe(1);
    expect(sliderValue('ArrowLeft', 0.02)).toBe(0);
    expect(sliderValue('ArrowRight', sliderValue('ArrowRight', sliderValue('ArrowRight', 0.25) ?? 0) ?? 0)).toBe(0.4);
  });

  it('已经在边界上时按越界方向返回原值（调用方据此知道没有变化）', () => {
    expect(sliderValue('ArrowRight', 1)).toBe(1);
    expect(sliderValue('Home', 0)).toBe(0);
  });

  it('不是滑块的按键返回 null，由调用方放行', () => {
    expect(sliderValue('Enter', 0.5)).toBeNull();
    expect(sliderValue('a', 0.5)).toBeNull();
  });
});
