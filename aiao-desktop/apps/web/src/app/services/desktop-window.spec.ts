import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { testApps, testWindow } from '../testing/desktop-apps';
import { DesktopWindow, WindowFrameHandle } from './desktop-window';
import { MenuSection, section } from './menu';

describe('DesktopWindow', () => {
  it('新窗口以应用名作标题，处于刚打开、未最小化、未缩放、未关闭的初始状态', () => {
    const win = testWindow('notes', {}, { left: 10, top: 20, width: 300, height: 200 }, 'w7');
    expect(win.id).toBe('w7');
    expect(win.appId).toBe('notes');
    expect(win.title()).toBe('Notes');
    expect(win.initialBox).toEqual({ left: 10, top: 20, width: 300, height: 200 });
    expect(win.opening()).toBe(true);
    expect(win.closing()).toBe(false);
    expect(win.minimized()).toBe(false);
    expect(win.hidden()).toBe(false);
    expect(win.zoomed()).toBe(false);
    expect(win.zIndex()).toBe(0);
    expect(win.frame).toBeNull();
    expect(win.busy).toBe(false);
    expect(win.menus()).toBeNull();
  });

  it('保留打开窗口时传入的参数，应用组件按它们决定显示内容', () => {
    const options = { path: ['Macintosh HD', 'Users'], section: 'general', select: 'a.txt' };
    expect(testWindow('finder', options).options).toBe(options);
  });

  it('最小尺寸取登记表里的 minW/minH，没登记的方向用 380×240', () => {
    expect(testWindow('notes')).toMatchObject({ minWidth: 380, minHeight: 240 });
    expect(testWindow('terminal')).toMatchObject({ minWidth: 420, minHeight: 220 });
    expect(testWindow('calculator')).toMatchObject({ minWidth: 380, minHeight: 320 });
  });

  it('标题是可写信号，改一个窗口的标题不影响同应用的另一个窗口', () => {
    const first = testWindow('finder');
    const second = testWindow('finder', {}, undefined, 'w1');
    first.title.set('Documents');
    expect(first.title()).toBe('Documents');
    expect(second.title()).toBe('Finder');
  });

  it('应用登记的菜单经 menus() 暴露；登记 computed 后菜单随应用状态刷新', () => {
    const win = new DesktopWindow('w1', testApps().terminal, {}, { left: 0, top: 0, width: 1, height: 1 });
    const shell = signal('zsh');
    const menus = computed<readonly MenuSection[]>(() => [section(shell(), [])]);
    win.setMenus(menus);
    expect(win.menus()).toBe(menus);
    expect(menus().map(menu => menu.label)).toEqual(['zsh']);
    shell.set('bash');
    expect(menus().map(menu => menu.label)).toEqual(['bash']);
  });

  it('beforeClose 与 afterResize 是互相独立的事件流', () => {
    const win = testWindow();
    const closing = vi.fn();
    const resized = vi.fn();
    win.beforeClose.subscribe(closing);
    win.afterResize.subscribe(resized);
    win.afterResize.next();
    expect(resized).toHaveBeenCalledTimes(1);
    expect(closing).not.toHaveBeenCalled();
    win.beforeClose.next();
    expect(closing).toHaveBeenCalledTimes(1);
    expect(resized).toHaveBeenCalledTimes(1);
  });

  it('窗口框架组件把自己登记为 frame，窗口管理器经它驱动最小化、还原与缩放', () => {
    const win = testWindow();
    const frame: WindowFrameHandle = {
      minimize: vi.fn(),
      restore: vi.fn(),
      toggleZoom: vi.fn(),
      keepOnScreen: vi.fn()
    };
    win.frame = frame;
    win.frame.minimize();
    win.frame.keepOnScreen();
    expect(frame.minimize).toHaveBeenCalledTimes(1);
    expect(frame.keepOnScreen).toHaveBeenCalledTimes(1);
    expect(frame.restore).not.toHaveBeenCalled();
  });
});
