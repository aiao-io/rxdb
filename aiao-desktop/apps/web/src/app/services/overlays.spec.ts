import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { Overlays } from './overlays';
import { PopoverService } from './popover';

function setup() {
  configureServices([Overlays, PopoverService]);
  return { overlays: TestBed.inject(Overlays), popover: TestBed.inject(PopoverService) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Overlays 启动台与聚焦搜索', () => {
  it('出厂时三个浮层都是关闭状态', () => {
    const { overlays } = setup();
    expect([overlays.launchpad(), overlays.spotlight(), overlays.notifications()]).toEqual([
      'closed',
      'closed',
      'closed'
    ]);
  });

  it('打开启动台会立刻收起正在显示的弹出层', () => {
    const { overlays, popover } = setup();
    popover.openMenu([], { x: 0, y: 0 });
    overlays.openLaunchpad();
    expect(overlays.launchpad()).toBe('open');
    expect(popover.isOpen()).toBe(false);
    expect(popover.entries()).toEqual([]);
  });

  it('关闭启动台先进入 closing，200ms 淡出后才是 closed；closing 期间不能重新打开', () => {
    const { overlays } = setup();
    overlays.openLaunchpad();
    overlays.closeLaunchpad();
    expect(overlays.launchpad()).toBe('closing');

    overlays.openLaunchpad();
    expect(overlays.launchpad()).toBe('closing');
    vi.advanceTimersByTime(199);
    expect(overlays.launchpad()).toBe('closing');
    vi.advanceTimersByTime(1);
    expect(overlays.launchpad()).toBe('closed');
  });

  it('聚焦搜索的淡出时间是 150ms', () => {
    const { overlays } = setup();
    overlays.openSpotlight();
    overlays.closeSpotlight();
    vi.advanceTimersByTime(149);
    expect(overlays.spotlight()).toBe('closing');
    vi.advanceTimersByTime(1);
    expect(overlays.spotlight()).toBe('closed');
  });

  it('重复打开、关闭一个没打开的浮层，都不起作用', () => {
    const { overlays } = setup();
    overlays.closeLaunchpad();
    overlays.closeSpotlight();
    expect(vi.getTimerCount()).toBe(0);
    overlays.openLaunchpad();
    overlays.openLaunchpad();
    expect(overlays.launchpad()).toBe('open');
  });

  it('toggle 在打开与关闭之间切换', () => {
    const { overlays } = setup();
    overlays.toggleLaunchpad();
    expect(overlays.launchpad()).toBe('open');
    overlays.toggleLaunchpad();
    expect(overlays.launchpad()).toBe('closing');

    overlays.toggleSpotlight();
    expect(overlays.spotlight()).toBe('open');
    overlays.toggleSpotlight();
    expect(overlays.spotlight()).toBe('closing');
    vi.advanceTimersByTime(200);
    expect(overlays.launchpad()).toBe('closed');
    expect(overlays.spotlight()).toBe('closed');
  });
});

describe('Overlays 通知中心', () => {
  it('打开会收起弹出层；已经打开时再打开不重复处理', () => {
    const { overlays, popover } = setup();
    popover.openMenu([], { x: 0, y: 0 });
    overlays.openNotifications();
    expect(overlays.notifications()).toBe('open');
    expect(popover.isOpen()).toBe(false);

    popover.openMenu([], { x: 0, y: 0 });
    overlays.openNotifications();
    expect(popover.isOpen()).toBe(true);
  });

  it('关闭只把状态改成 closing，由组件播完动画后自己回到 closed；关闭途中可以重新打开', () => {
    const { overlays } = setup();
    overlays.openNotifications();
    overlays.closeNotifications();
    expect(overlays.notifications()).toBe('closing');
    vi.advanceTimersByTime(1000);
    expect(overlays.notifications()).toBe('closing');

    overlays.openNotifications();
    expect(overlays.notifications()).toBe('open');
  });

  it('没打开时 closeNotifications 不起作用；toggle 在打开与关闭之间切换', () => {
    const { overlays } = setup();
    overlays.closeNotifications();
    expect(overlays.notifications()).toBe('closed');
    overlays.toggleNotifications();
    expect(overlays.notifications()).toBe('open');
    overlays.toggleNotifications();
    expect(overlays.notifications()).toBe('closing');
    overlays.toggleNotifications();
    expect(overlays.notifications()).toBe('open');
  });
});
