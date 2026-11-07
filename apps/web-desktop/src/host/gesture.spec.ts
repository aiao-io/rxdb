import { describe, expect, it, vi } from 'vitest';
import { WindowGesture } from './gesture.js';
import { createWindowModel, openWindow } from './windows.js';

describe('DESKTOP-US-102/103 标题拖动与缩放', () => {
  it('移动标题栏只改坐标，不能顺便缩放', () => {
    const model = createWindowModel('macos');
    const area = { width: 1440, height: 800 };
    const win = openWindow(model, 'one', 'editor', area);
    const before = { ...win.bounds };
    const gesture = new WindowGesture(model, win.id, () => area, vi.fn(), vi.fn());
    gesture.begin(200, 100, 'move');
    gesture.move(250, 150);
    gesture.end(250);
    expect(win.bounds).toEqual({ ...before, x: before.x + 50, y: before.y + 50 });
  });
  it('macOS 无窗口实例重新开窗后，拖动绑定新的 windowId', () => {
    const model = createWindowModel('macos');
    const area = { width: 1440, height: 800 };
    const first = openWindow(model, 'one', 'editor', area);
    const gesture = new WindowGesture(model, first.id, () => area, vi.fn(), vi.fn());
    model.windows = [];
    const reopened = openWindow(model, 'one', 'editor', area);
    gesture.attach(reopened.id);
    gesture.begin(100, 100, 'move');
    gesture.move(120, 120);
    gesture.end(120);
    expect(reopened.bounds.x).toBe(110);
  });
  it('缩放遵守边界，取消后结束捕获；Windows 边缘贴靠', () => {
    const model = createWindowModel('windows');
    const area = { width: 1440, height: 800 };
    const win = openWindow(model, 'one', 'editor', area);
    const commit = vi.fn();
    const gesture = new WindowGesture(model, win.id, () => area, vi.fn(), commit);
    gesture.begin(800, 500, 'se');
    gesture.move(-1000, -1000);
    gesture.end(0, true);
    expect(win.bounds.width).toBeGreaterThanOrEqual(360);
    expect(gesture.active).toBe(false);
    gesture.begin(200, 100, 'move');
    gesture.end(0);
    expect(win.state).toBe('left');
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
