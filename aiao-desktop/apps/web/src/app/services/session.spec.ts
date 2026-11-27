import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeLocation, configureServices } from '../testing/angular';
import { createWindowManagerStub } from '../testing/stubs';
import { HOME_PATH } from './file-system';
import { Overlays } from './overlays';
import { PopoverService } from './popover';
import { Session } from './session';
import { WindowManager } from './window-manager';

/** 给假的 DOCUMENT 补上事件监听面：睡眠唤醒要挂 / 摘 document 级监听。 */
interface FakeDocumentWithEvents {
  location: FakeLocation;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatch(type: string): void;
  listenersOf(type: string): readonly EventListener[];
}

function setup(location: Partial<FakeLocation> = {}) {
  const wm = createWindowManagerStub();
  const dom = configureServices(
    [Session, PopoverService, Overlays, { provide: WindowManager, useValue: wm }],
    location
  );
  const listeners = new Map<string, EventListener[]>();
  const document = dom.document as unknown as FakeDocumentWithEvents;
  document.addEventListener = (type, listener) => {
    const list = listeners.get(type) ?? [];
    list.push(listener);
    listeners.set(type, list);
  };
  document.removeEventListener = (type, listener) => {
    const next = (listeners.get(type) ?? []).filter(item => item !== listener);
    if (next.length) listeners.set(type, next);
    else listeners.delete(type);
  };
  document.dispatch = type => {
    for (const listener of listeners.get(type) ?? []) listener({ type } as Event);
  };
  document.listenersOf = type => listeners.get(type) ?? [];
  return {
    session: TestBed.inject(Session),
    wm,
    popover: TestBed.inject(PopoverService),
    overlays: TestBed.inject(Overlays),
    document
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
    session.resolveConfirm(true);
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
    session.resolveConfirm(true);
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

  it('restart 先弹确认对话框：取消后什么都不发生', () => {
    const { session, wm } = setup();
    session.restart();
    expect(session.confirm()).toEqual({ id: 1, mode: 'restart' });
    expect(wm.closeAll).not.toHaveBeenCalled();
    session.resolveConfirm(false);
    expect(session.confirm()).toBeNull();
    expect(wm.closeAll).not.toHaveBeenCalled();
    expect(session.boot()).toEqual({ id: 0, mode: 'startup' });
  });

  it('restart(false) 跳过确认直接拆会话（磁盘工具抹掉后的重启是抹掉确认的后续）', () => {
    const { session, wm } = setup();
    session.restart(false);
    expect(session.confirm()).toBeNull();
    expect(wm.closeAll).toHaveBeenCalledTimes(1);
    expect(session.boot()).toEqual({ id: 1, mode: 'restart' });
  });

  it('restart 确认后真的拆掉会话：关所有窗口、收通知中心与弹出层，开始新的重启运行', () => {
    const { session, wm, popover, overlays } = setup();
    overlays.openNotifications();
    popover.openMenu([], { x: 0, y: 0 });

    session.restart();
    expect(wm.closeAll).not.toHaveBeenCalled();
    session.resolveConfirm(true);
    expect(wm.closeAll).toHaveBeenCalledTimes(1);
    expect(overlays.notifications()).toBe('closing');
    expect(popover.entries()).toEqual([]);
    expect(session.boot()).toEqual({ id: 1, mode: 'restart' });
  });

  it('shutDown 确认后同样拆掉会话，进入关机状态；每次运行的 id 递增', () => {
    const { session, wm } = setup();
    session.restart();
    session.resolveConfirm(true);
    session.shutDown();
    session.resolveConfirm(true);
    expect(wm.closeAll).toHaveBeenCalledTimes(2);
    expect(session.boot()).toEqual({ id: 2, mode: 'off' });
  });

  it('确认面板打开时重复请求（重启/关机）被忽略，以先到的为准', () => {
    const { session } = setup();
    session.restart();
    session.shutDown();
    expect(session.confirm()).toEqual({ id: 1, mode: 'restart' });
    session.resolveConfirm(false);
    expect(session.confirm()).toBeNull();
  });

  it('开机画面期间（关机画面上的「点击启动」）重启不弹确认，直接开机', () => {
    const { session, wm } = setup();
    session.restart();
    session.resolveConfirm(true);
    session.shutDown();
    session.resolveConfirm(true);
    expect(session.boot()).toEqual({ id: 2, mode: 'off' });
    /* 关机画面上点击启动：走 restart 但不经过确认面板。 */
    session.restart();
    expect(session.confirm()).toBeNull();
    expect(wm.closeAll).toHaveBeenCalledTimes(3);
    expect(session.boot()).toEqual({ id: 3, mode: 'restart' });
  });
});

describe('Session 睡眠输入唤醒', () => {
  it('sleepNow 睡下后收起弹出层，不再自动定时醒来', () => {
    const { session, popover } = setup();
    popover.openMenu([], { x: 0, y: 0 });
    session.sleepNow();
    expect(session.sleep()).toBe('asleep');
    expect(popover.isOpen()).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(session.sleep()).toBe('asleep');
  });

  it('任意键按下进入 waking，0.9 秒后 awake', () => {
    const { session, document } = setup();
    session.sleepNow();
    document.dispatch('keydown');
    expect(session.sleep()).toBe('waking');
    vi.advanceTimersByTime(899);
    expect(session.sleep()).toBe('waking');
    vi.advanceTimersByTime(1);
    expect(session.sleep()).toBe('awake');
  });

  it('点击同样唤醒；唤醒监听成对移除，之后的输入不再生效', () => {
    const { session, document } = setup();
    session.sleepNow();
    expect(document.listenersOf('keydown')).toHaveLength(1);
    expect(document.listenersOf('pointerdown')).toHaveLength(1);
    document.dispatch('pointerdown');
    expect(session.sleep()).toBe('waking');
    expect(document.listenersOf('keydown')).toHaveLength(0);
    expect(document.listenersOf('pointerdown')).toHaveLength(0);
    document.dispatch('keydown');
    expect(session.sleep()).toBe('waking');
    vi.advanceTimersByTime(900);
    expect(session.sleep()).toBe('awake');
  });

  it('睡下期间重复 sleepNow 不叠加监听', () => {
    const { session, document } = setup();
    session.sleepNow();
    session.sleepNow();
    expect(document.listenersOf('keydown')).toHaveLength(1);
    expect(document.listenersOf('pointerdown')).toHaveLength(1);
  });
});

describe('Session 登出', () => {
  it('logOut 同步通过时立即回到锁屏', () => {
    const { session, wm } = setup();
    session.logOut();
    expect(wm.closeAll).toHaveBeenCalledTimes(1);
    expect(session.locked()).toBe(true);
  });

  it('logOut 走未保存协商：被拒则留在原处，通过后锁屏并收通知中心', async () => {
    const { session, wm, overlays } = setup();
    overlays.openNotifications();
    wm.closeAll.mockReturnValue(Promise.resolve(false));
    session.logOut();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.locked()).toBe(false);
    expect(overlays.notifications()).toBe('open');

    wm.closeAll.mockReturnValue(Promise.resolve(true));
    session.logOut();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.locked()).toBe(true);
    expect(overlays.notifications()).toBe('closing');
  });
});

describe('Session 等待未保存内容协商', () => {
  it('取消确认或协商被拒都保留会话和通知中心', async () => {
    const { session, wm, overlays } = setup({ search: '?boot=0' });
    overlays.openNotifications();
    session.restart();
    session.resolveConfirm(false);
    expect(wm.closeAll).not.toHaveBeenCalled();

    wm.closeAll.mockReturnValue(Promise.resolve(false));
    session.restart();
    session.resolveConfirm(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.boot()).toBeNull();
    expect(overlays.notifications()).toBe('open');
  });

  it('批准之后才关闭会话并启动开机流程', async () => {
    const { session, wm } = setup({ search: '?boot=0' });
    let approve!: (value: boolean) => void;
    wm.closeAll.mockReturnValue(new Promise<boolean>(resolve => (approve = resolve)));
    session.restart();
    expect(wm.closeAll).not.toHaveBeenCalled();
    session.resolveConfirm(true);
    expect(session.boot()).toBeNull();
    approve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.boot()).toEqual({ id: 1, mode: 'restart' });
  });
});

it('重启协商中重复重启或关机不会重复执行会话替换', async () => {
  const { session, wm } = setup({ search: '?boot=0' });
  let approve!: (value: boolean) => void;
  wm.closeAll.mockReturnValue(new Promise<boolean>(resolve => (approve = resolve)));
  session.restart();
  session.resolveConfirm(true);
  session.restart();
  session.shutDown();
  expect(wm.closeAll).toHaveBeenCalledTimes(1);
  approve(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(session.boot()).toEqual({ id: 1, mode: 'restart' });
});
