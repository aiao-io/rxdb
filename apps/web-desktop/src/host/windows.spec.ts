import { describe, expect, it } from 'vitest';
import {
  activateWindow,
  constrainBounds,
  createWindowModel,
  openWindow,
  restoreWindow,
  saveWindow,
  setWindowState,
  switchMode,
  switchWorkspace
} from './windows.js';

describe('DESKTOP-US-004/101/102/103/107 窗口模型', () => {
  const area = { width: 1440, height: 800 };
  it('唯一窗口身份、单一焦点，跨工作区激活保持实例', () => {
    const model = createWindowModel('macos');
    const a = openWindow(model, 'a', 'files', area);
    const b = openWindow(model, 'b', 'editor', area);
    expect(a.id).not.toBe(b.id);
    expect(model.activeId).toBe(b.id);
    b.workspaceId = 'second';
    switchWorkspace(model, 'first');
    activateWindow(model, b.id);
    expect(model.workspaceId).toBe('second');
    expect(model.activeId).toBe(b.id);
    expect(b.instanceId).toBe('b');
  });
  it('贴靠→最大化→还原→普通保留原始边界', () => {
    const model = createWindowModel('windows');
    const win = openWindow(model, 'a', 'editor', area);
    const original = { ...win.bounds };
    setWindowState(model, win.id, 'left', area);
    expect(win.bounds.width).toBe(720);
    setWindowState(model, win.id, 'maximized', area);
    setWindowState(model, win.id, 'restore', area);
    expect(win.state).toBe('left');
    setWindowState(model, win.id, 'restore', area);
    expect(win.bounds).toEqual(original);
  });
  it('最小化退出焦点；20 次模式切换不改变实例、最小化状态及普通边界', () => {
    const model = createWindowModel('windows');
    const win = openWindow(model, 'a', 'editor', area);
    const original = { ...win.normalBounds };
    setWindowState(model, win.id, 'minimized', area);
    expect(model.activeId).toBeNull();
    for (let i = 0; i < 20; i++) switchMode(model, i % 2 === 0 ? 'macos' : 'windows', area);
    expect(win.instanceId).toBe('a');
    expect(win.state).toBe('minimized');
    expect(win.normalBounds).toEqual(original);
    activateWindow(model, win.id);
    expect(win.state).toBe('normal');
  });
  it('缩小视口保持标题栏及控制可达，无负尺寸', () => {
    const bounds = constrainBounds({ x: 2000, y: -200, width: 1200, height: 900 }, { width: 640, height: 400 });
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x).toBeLessThanOrEqual(520);
    expect(bounds.width).toBeLessThanOrEqual(640);
    expect(bounds.height).toBeLessThanOrEqual(400);
  });
  it('切换工作区保留各区活动窗口和明确的桌面焦点', () => {
    const model = createWindowModel('windows');
    const first = openWindow(model, 'one', 'editor', area);
    openWindow(model, 'two', 'editor', area);
    activateWindow(model, first.id);
    switchWorkspace(model, 'second');
    const second = openWindow(model, 'three', 'editor', area);
    switchWorkspace(model, 'first');
    expect(model.activeId).toBe(first.id);
    model.activeId = null;
    switchWorkspace(model, 'second');
    expect(model.activeId).toBe(second.id);
    switchWorkspace(model, 'first');
    expect(model.activeId).toBeNull();
  });
});

describe('DESKTOP-US-501/AC1/5 窗口状态持久恢复', () => {
  const originalArea = { width: 1440, height: 800 };
  const smallerArea = { width: 640, height: 400 };
  it.each([
    ['normal'],
    ['left'],
    ['right'],
    ['left', 'maximized'],
    ['right', 'maximized'],
    ['minimized'],
    ['left', 'minimized'],
    ['right', 'maximized', 'minimized']
  ] as const)('刷新恢复 %j 的完整还原链和新视口几何', (...actions) => {
    const model = createWindowModel('windows');
    const win = openWindow(model, 'before', 'editor', originalArea);
    for (const action of actions) setWindowState(model, win.id, action, originalArea);
    const saved = saveWindow(win, 'document', '/documents/document?line=2#L2');
    const recovered = createWindowModel('windows');
    const restored = openWindow(recovered, 'after', 'editor', smallerArea);
    restoreWindow(recovered, restored, saved, smallerArea);
    expect(restored.state).toBe(win.state);
    expect(restored.previousState).toBe(win.previousState);
    expect(restored.beforeMinimized).toBe(win.beforeMinimized);
    expect(saved).toMatchObject({ fileId: 'document', route: '/documents/document?line=2#L2' });
    expect(restored.normalBounds).toEqual(constrainBounds(win.normalBounds, smallerArea));
    const expected = structuredClone(model);
    const expectedWindow = expected.windows[0];
    while (expectedWindow.state !== 'normal') {
      setWindowState(expected, win.id, 'restore', smallerArea);
      setWindowState(recovered, restored.id, 'restore', smallerArea);
      expect(restored.state).toBe(expectedWindow.state);
      expect(restored.bounds).toEqual(expectedWindow.bounds);
    }
  });

  it('保存边界与运行窗口互不引用，恢复最小化不会抢占活动窗口', () => {
    const model = createWindowModel('windows');
    const win = openWindow(model, 'before', 'editor', originalArea);
    setWindowState(model, win.id, 'minimized', originalArea);
    const saved = saveWindow(win, null, '/');
    const recovered = createWindowModel('windows');
    const active = openWindow(recovered, 'active', 'files', smallerArea);
    const restored = openWindow(recovered, 'after', 'editor', smallerArea);
    restoreWindow(recovered, restored, saved, smallerArea);
    expect(recovered.activeId).toBe(active.id);
    restored.normalBounds.x = 99;
    expect(saved.bounds.x).toBe(win.normalBounds.x);
    win.normalBounds.y = 101;
    expect(saved.bounds.y).not.toBe(101);
  });
});
