import { Injector, computed, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
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

  it('登记过的菜单可以撤销（传 null）：菜单栏回到应用的标准菜单，应用退出或实例销毁时用它解绑', () => {
    const win = new DesktopWindow('w1', testApps().terminal, {}, { left: 0, top: 0, width: 1, height: 1 });
    win.setMenus(signal<readonly MenuSection[]>([section('zsh', [])]));
    expect(win.menus()).not.toBeNull();
    win.setMenus(null);
    expect(win.menus()).toBeNull();
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
      keepOnScreen: vi.fn(),
      focusContent: vi.fn(),
      holdsFocus: vi.fn(() => false)
    };
    win.frame = frame;
    win.frame.minimize();
    win.frame.keepOnScreen();
    expect(frame.minimize).toHaveBeenCalledTimes(1);
    expect(frame.keepOnScreen).toHaveBeenCalledTimes(1);
    expect(frame.restore).not.toHaveBeenCalled();
  });
});

describe('DesktopWindow 给窗口布局用的状态（ADESK-US-104）', () => {
  beforeEach(() => {
    configureServices([]);
  });

  it('box 一开始就是初始几何，窗口框架在拖动、缩放结束时写入新的', () => {
    const win = testWindow('notes', {}, { left: 10, top: 20, width: 300, height: 200 });
    expect(win.box()).toEqual({ left: 10, top: 20, width: 300, height: 200 });
    win.box.set({ left: 50, top: 60, width: 400, height: 300 });
    expect(win.box()).toEqual({ left: 50, top: 60, width: 400, height: 300 });
    expect(win.initialBox).toEqual({ left: 10, top: 20, width: 300, height: 200 });
  });

  it('box 写入内容相同的几何不通知依赖者（点一下窗口没动也不会触发布局写回）', () => {
    const win = testWindow('notes', {}, { left: 10, top: 20, width: 300, height: 200 });
    const changes = vi.fn();
    const stop = effect(() => changes(win.box()), { injector: TestBed.inject(Injector) });
    TestBed.tick();
    win.box.set({ left: 10, top: 20, width: 300, height: 200 });
    TestBed.tick();
    expect(changes).toHaveBeenCalledTimes(1);
    win.box.set({ left: 11, top: 20, width: 300, height: 200 });
    TestBed.tick();
    expect(changes).toHaveBeenCalledTimes(2);
    stop.destroy();
  });

  it('restoreOptions 一开始是 null（按开窗参数记），应用上报后以上报的为准，内容相同不重复通知', () => {
    const win = testWindow('finder', { path: ['Trash'] });
    expect(win.restoreOptions()).toBeNull();
    const changes = vi.fn();
    const stop = effect(() => changes(win.restoreOptions()), { injector: TestBed.inject(Injector) });
    TestBed.tick();
    win.restoreOptions.set({ path: ['Macintosh HD', 'Users'] });
    TestBed.tick();
    win.restoreOptions.set({ path: ['Macintosh HD', 'Users'] });
    TestBed.tick();
    expect(win.restoreOptions()).toEqual({ path: ['Macintosh HD', 'Users'] });
    expect(changes).toHaveBeenCalledTimes(2);
    stop.destroy();
  });
});
