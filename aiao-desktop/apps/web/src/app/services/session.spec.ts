import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeLocation, configureServices } from '../testing/angular';
import { createWindowManagerStub } from '../testing/stubs';
import { HOME_PATH } from './file-system';
import { Overlays } from './overlays';
import { PopoverService } from './popover';
import { Session } from './session';
import { WindowManager } from './window-manager';

function setup(location: Partial<FakeLocation> = {}) {
  const wm = createWindowManagerStub();
  configureServices([Session, PopoverService, Overlays, { provide: WindowManager, useValue: wm }], location);
  return {
    session: TestBed.inject(Session),
    wm,
    popover: TestBed.inject(PopoverService),
    overlays: TestBed.inject(Overlays)
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Session 开机画面', () => {
  it('默认带开机动画：第 0 次运行是 startup', () => {
    const { session } = setup();
    expect(session.boot()).toEqual({ id: 0, mode: 'startup' });
    expect(session.locked()).toBe(false);
    expect(session.sleep()).toBe('awake');
  });

  it('?boot=0 或 #noboot 跳过开机动画（测试脚本依赖这一点）', () => {
    expect(setup({ search: '?boot=0' }).session.boot()).toBeNull();
    expect(setup({ hash: '#noboot' }).session.boot()).toBeNull();
    expect(setup({ search: '?boot=1', hash: '#other' }).session.boot()).not.toBeNull();
  });

  it('开机进度走完进入锁屏；重启后的会话随后打开 Finder（主目录）', () => {
    const { session, wm } = setup();
    const startup = session.boot();
    if (!startup) throw new Error('应该有开机画面');
    session.bootFinished(startup);
    expect(session.locked()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(wm.open).not.toHaveBeenCalled();

    session.restart();
    const restarted = session.boot();
    if (!restarted) throw new Error('重启应该有开机画面');
    session.bootFinished(restarted);
    vi.advanceTimersByTime(899);
    expect(wm.open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: HOME_PATH });
  });

  it('bootDismissed 只移除对应的那次运行，过期的运行不影响新的', () => {
    const { session } = setup();
    const first = session.boot();
    if (!first) throw new Error('应该有开机画面');
    session.restart();
    session.bootDismissed(first);
    expect(session.boot()).toMatchObject({ mode: 'restart' });

    const current = session.boot();
    if (!current) throw new Error('重启应该有开机画面');
    session.bootDismissed(current);
    expect(session.boot()).toBeNull();
  });
});

describe('Session 锁屏、重启与关机', () => {
  it('lock 立即收起弹出层并锁屏，unlock 解锁', () => {
    const { session, popover } = setup();
    popover.openMenu([], { x: 0, y: 0 });
    session.lock();
    expect(session.locked()).toBe(true);
    expect(popover.entries()).toEqual([]);
    session.unlock();
    expect(session.locked()).toBe(false);
  });

  it('restart 真的拆掉会话：关所有窗口、收通知中心与弹出层，开始新的重启运行', () => {
    const { session, wm, popover, overlays } = setup();
    overlays.openNotifications();
    popover.openMenu([], { x: 0, y: 0 });

    session.restart();
    expect(wm.closeAll).toHaveBeenCalledTimes(1);
    expect(overlays.notifications()).toBe('closing');
    expect(popover.entries()).toEqual([]);
    expect(session.boot()).toEqual({ id: 1, mode: 'restart' });
  });

  it('shutDown 同样拆掉会话，进入关机状态；每次运行的 id 递增', () => {
    const { session, wm } = setup();
    session.restart();
    session.shutDown();
    expect(wm.closeAll).toHaveBeenCalledTimes(2);
    expect(session.boot()).toEqual({ id: 2, mode: 'off' });
  });

  it('sleepNow 先睡 1 秒，再用 0.9 秒唤醒；睡下前收起弹出层', () => {
    const { session, popover } = setup();
    popover.openMenu([], { x: 0, y: 0 });
    session.sleepNow();
    expect(session.sleep()).toBe('asleep');
    expect(popover.isOpen()).toBe(false);

    vi.advanceTimersByTime(999);
    expect(session.sleep()).toBe('asleep');
    vi.advanceTimersByTime(1);
    expect(session.sleep()).toBe('waking');
    vi.advanceTimersByTime(899);
    expect(session.sleep()).toBe('waking');
    vi.advanceTimersByTime(1);
    expect(session.sleep()).toBe('awake');
  });
});
