import { describe, expect, it } from 'vitest';
import { dockTargets, measureDock, placeDock, smoothDock } from './dock-layout.js';

const kinds = ['icon', 'icon', 'icon', 'icon', 'divider', 'icon'] as const;

describe('macOS Dock 距离动画', () => {
  it('静止图标采用 58px 基准，光标中心最大放大 1.42 倍且邻居连续衰减', () => {
    const geometry = measureDock(kinds, 1200);
    const scales = dockTargets(geometry, geometry.slots[2].center);
    expect(scales[2]).toBeCloseTo(1.42);
    expect(scales[1]).toBeCloseTo(scales[3]);
    expect(scales[1]).toBeGreaterThan(scales[0]);
    expect(scales[0]).toBeGreaterThan(1);
    expect(scales[4]).toBe(1);
    expect(dockTargets(geometry, null)).toEqual(kinds.map(() => 1));
    expect(dockTargets(geometry, -500)).toEqual(kinds.map(() => 1));
  });

  it('重排后相邻图标不重叠，底座宽度包含所有放大后的图标与固定分隔线', () => {
    const geometry = measureDock(kinds, 1200);
    const scales = dockTargets(geometry, geometry.slots[2].center);
    const layout = placeDock(geometry, scales);
    expect(layout.width).toBeGreaterThan(geometry.width);
    expect(layout.items[4].width).toBe(16);
    for (let index = 1; index < layout.items.length; index++) {
      const previous = layout.items[index - 1];
      const current = layout.items[index];
      expect(current.center - current.width / 2).toBeCloseTo(
        previous.center + previous.width / 2 + geometry.slots[index - 1].gap
      );
    }
    expect(layout.width - layout.items.at(-1)!.center - layout.items.at(-1)!.width / 2).toBeCloseTo(geometry.padding);
  });

  it.each([296, 366, 800])('可用宽度 %s 时整个放大曲线保持在屏幕内', available => {
    const geometry = measureDock(kinds, available);
    for (const slot of geometry.slots) {
      const placement = placeDock(geometry, dockTargets(geometry, slot.center));
      expect(placement.width).toBeLessThanOrEqual(available + 0.0001);
      expect(placement.items.every(item => item.scale >= 1)).toBe(true);
    }
  });

  it('60 Hz 与 120 Hz 在相同经过时间内得到相同位置，收回最终停在精确原位', () => {
    let sixty = [1];
    let high = [1];
    for (let frame = 0; frame < 6; frame++) sixty = smoothDock(sixty, [1.42], 1000 / 60);
    for (let frame = 0; frame < 12; frame++) high = smoothDock(high, [1.42], 1000 / 120);
    expect(sixty[0]).toBeCloseTo(high[0], 12);
    for (let frame = 0; frame < 60; frame++) sixty = smoothDock(sixty, [1], 1000 / 60);
    expect(sixty).toEqual([1]);
  });
});
