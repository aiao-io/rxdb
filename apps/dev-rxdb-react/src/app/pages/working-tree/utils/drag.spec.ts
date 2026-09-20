import { describe, expect, it } from 'vitest';
import { clampDragWidth } from './drag';

/**
 * @fileoverview `drag` 的纯函数单测（Angular 参考实现的原样移植）。
 *
 * @remarks
 * `startDragResize` 的 document 监听副作用在单测里不值当模拟，这里只锁宽度计算；
 * 拖动行为本身由 e2e（工具栏分段拖宽 + 左栏分隔条）覆盖。
 */

describe('clampDragWidth', () => {
  it('起点 + 位移', () => {
    expect(clampDragWidth(230, 60, 120, 480)).toBe(290);
    expect(clampDragWidth(320, -40, 240, 560)).toBe(280);
  });

  it('夹在下限 / 上限', () => {
    expect(clampDragWidth(230, -500, 120, 480)).toBe(120);
    expect(clampDragWidth(230, 500, 120, 480)).toBe(480);
  });

  it('位移为 0 时原样', () => {
    expect(clampDragWidth(280, 0, 140, 420)).toBe(280);
  });
});
