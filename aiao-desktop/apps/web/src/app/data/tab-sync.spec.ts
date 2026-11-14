import { describe, expect, it, vi } from 'vitest';

import { FakeLifecycle, FakeChannelHub as Hub, fakeLocks } from '../testing/fake-tab-sync';
import { DISK_LOCK, PREFERENCES_LOCK, STARTUP_LOCK, TabSync, browserLifecycle, seedLock } from './tab-sync';

function tab(hub: Hub, id: string, locks = fakeLocks(), lifecycle = new FakeLifecycle()) {
  const channel = hub.open();
  const sync = new TabSync({ locks, channel, lifecycle, tabId: id });
  return { sync, channel, locks, lifecycle };
}

describe('TabSync 独占锁', () => {
  it('所有标签页共用一把锁，名字沿用磁盘的 aiao-desktop-disk', async () => {
    const { sync, locks } = tab(new Hub(), 'a');
    expect(await sync.exclusive(async () => 42)).toBe(42);
    expect(locks.request).toHaveBeenCalledWith(DISK_LOCK, expect.any(Function));
    expect(DISK_LOCK).toBe('aiao-desktop-disk');
  });

  it('两个标签页的任务互斥、按请求顺序执行，不会交错', async () => {
    const hub = new Hub();
    const locks = fakeLocks();
    const first = tab(hub, 'a', locks);
    const second = tab(hub, 'b', locks);
    const events: string[] = [];
    const slow = async (name: string, ticks: number): Promise<void> => {
      events.push(`${name}:start`);
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      events.push(`${name}:end`);
    };
    await Promise.all([
      first.sync.exclusive(() => slow('a1', 5)),
      second.sync.exclusive(() => slow('b1', 1)),
      first.sync.exclusive(() => slow('a2', 3))
    ]);
    expect(events).toEqual(['a1:start', 'a1:end', 'b1:start', 'b1:end', 'a2:start', 'a2:end']);
  });

  it('不同名字的锁互不影响：启动、偏好与各数据域的种子各用自己的锁', async () => {
    const { sync, locks } = tab(new Hub(), 'a');
    const events: string[] = [];
    let releaseDisk!: () => void;
    const disk = sync.exclusive(
      () =>
        new Promise<void>(resolve => {
          events.push('disk:start');
          releaseDisk = resolve;
        })
    );
    await sync.exclusive(async () => void events.push('preferences'), PREFERENCES_LOCK);
    await sync.exclusive(async () => void events.push('seed'), seedLock('notes'));
    await sync.exclusive(async () => void events.push('start'), STARTUP_LOCK);
    expect(events).toEqual(['disk:start', 'preferences', 'seed', 'start']);
    releaseDisk();
    await disk;
    expect(locks.request.mock.calls.map(call => call[0])).toEqual([
      DISK_LOCK,
      'aiao-desktop-preferences',
      'aiao-desktop-seed:notes',
      'aiao-desktop-start'
    ]);
  });

  it('任务抛错时把错误交给调用方，也不会卡住后面的任务', async () => {
    const { sync } = tab(new Hub(), 'a');
    const failed = sync.exclusive(async () => {
      throw new Error('boom');
    });
    const next = sync.exclusive(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('TabSync 通知', () => {
  it('一个标签页通知，别的标签页收到同主题的变更，自己收不到', () => {
    const hub = new Hub();
    const a = tab(hub, 'a');
    const b = tab(hub, 'b');
    const own = vi.fn();
    const remote = vi.fn();
    a.sync.changes('disk').subscribe(own);
    b.sync.changes('disk').subscribe(remote);
    a.sync.notify('disk');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(own).not.toHaveBeenCalled();
  });

  it('按主题分开：偏好的通知不会惊动订阅磁盘的一方', () => {
    const hub = new Hub();
    const a = tab(hub, 'a');
    const b = tab(hub, 'b');
    const disk = vi.fn();
    const preferences = vi.fn();
    b.sync.changes('disk').subscribe(disk);
    b.sync.changes('preferences').subscribe(preferences);
    a.sync.notify('preferences');
    expect(disk).not.toHaveBeenCalled();
    expect(preferences).toHaveBeenCalledTimes(1);
  });

  it('三个标签页：一个通知，另外两个都收到', () => {
    const hub = new Hub();
    const tabs = ['a', 'b', 'c'].map(id => tab(hub, id));
    const heard = tabs.map(() => vi.fn());
    tabs.forEach((one, index) => one.sync.changes('disk').subscribe(heard[index]));
    tabs[0].sync.notify('disk');
    expect(heard.map(spy => spy.mock.calls.length)).toEqual([0, 1, 1]);
  });

  it('通道里的消息是不可信输入：结构不对的一律丢掉，不抛错', () => {
    const hub = new Hub();
    const a = tab(hub, 'a');
    const b = tab(hub, 'b');
    const remote = vi.fn();
    b.sync.changes('disk').subscribe(remote);
    for (const junk of [null, 'disk', 42, {}, { topic: 'disk' }, { from: 'a' }, { from: 1, topic: 'disk' }])
      a.channel.postMessage(junk);
    expect(remote).not.toHaveBeenCalled();
  });

  it('退订之后不再收到', () => {
    const hub = new Hub();
    const a = tab(hub, 'a');
    const b = tab(hub, 'b');
    const remote = vi.fn();
    const subscription = b.sync.changes('disk').subscribe(remote);
    subscription.unsubscribe();
    a.sync.notify('disk');
    expect(remote).not.toHaveBeenCalled();
  });

  it('close 之后通道关闭，再通知也不抛错、不发出', () => {
    const hub = new Hub();
    const a = tab(hub, 'a');
    const b = tab(hub, 'b');
    const remote = vi.fn();
    b.sync.changes('disk').subscribe(remote);
    a.sync.notify('preferences');
    a.sync.close();
    expect(a.channel.closed).toBe(true);
    a.sync.notify('disk');
    expect(remote).not.toHaveBeenCalled();
  });

  it('通道是用到时才打开的：只建不用的标签页（单测里的桌面库）不留下打开的通道', () => {
    const hub = new Hub();
    const idle = tab(hub, 'idle');
    idle.sync.close();
    expect(idle.channel.closed).toBe(false);
  });

  it('每个标签页有自己的标识，缺省时随机生成', () => {
    const hub = new Hub();
    const a = new TabSync({ locks: fakeLocks(), channel: hub.open(), lifecycle: new FakeLifecycle() });
    const b = new TabSync({ locks: fakeLocks(), channel: hub.open(), lifecycle: new FakeLifecycle() });
    expect(a.tabId).not.toBe(b.tabId);
    expect(a.tabId.length).toBeGreaterThan(8);
  });
});

describe('TabSync 恢复可见', () => {
  it('页面从后台回到前台时发出 resumed$，在后台时不发', () => {
    const { sync, lifecycle } = tab(new Hub(), 'a');
    const resumed = vi.fn();
    sync.resumed$.subscribe(resumed);
    lifecycle.visibilityState = 'hidden';
    lifecycle.fire('visibilitychange');
    expect(resumed).not.toHaveBeenCalled();
    lifecycle.visibilityState = 'visible';
    lifecycle.fire('visibilitychange');
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('从冻结状态解冻（resume）与从往返缓存恢复（pageshow）也算恢复', () => {
    const { sync, lifecycle } = tab(new Hub(), 'a');
    const resumed = vi.fn();
    sync.resumed$.subscribe(resumed);
    lifecycle.fire('resume');
    lifecycle.fire('pageshow', { persisted: true });
    lifecycle.fire('pageshow', { persisted: false });
    expect(resumed).toHaveBeenCalledTimes(2);
  });

  it('没有订阅者时不挂监听，退订后摘掉监听，close 后不再发出', () => {
    const { sync, lifecycle } = tab(new Hub(), 'a');
    expect(lifecycle.count('visibilitychange')).toBe(0);
    const subscription = sync.resumed$.subscribe();
    expect(lifecycle.count('visibilitychange')).toBe(1);
    subscription.unsubscribe();
    expect(lifecycle.count('visibilitychange')).toBe(0);
  });
});

describe('browserLifecycle', () => {
  it('没有文档的环境（Node）没有生命周期来源', () => {
    expect(browserLifecycle()).toBeUndefined();
  });

  it('visibilitychange 与 resume 挂在文档上，pageshow 挂在窗口上，可见性实时取文档的', () => {
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    Object.assign(documentTarget, { visibilityState: 'hidden' });
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('window', windowTarget);
    const source = browserLifecycle();
    expect(source?.visibilityState).toBe('hidden');
    const heard: string[] = [];
    const onVisibility = (): void => void heard.push('document');
    const onPageShow = (): void => void heard.push('window');
    source?.addEventListener('visibilitychange', onVisibility);
    source?.addEventListener('pageshow', onPageShow);
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    windowTarget.dispatchEvent(new Event('pageshow'));
    source?.removeEventListener('visibilitychange', onVisibility);
    source?.removeEventListener('pageshow', onPageShow);
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    windowTarget.dispatchEvent(new Event('pageshow'));
    expect(heard).toEqual(['document', 'window']);
  });
});

describe('TabSync 默认依赖', () => {
  it('不传依赖时用浏览器自带的 Web Locks 与 BroadcastChannel，并能互相通知', async () => {
    const a = new TabSync();
    const b = new TabSync();
    try {
      const heard = new Promise<void>(resolve => b.changes('disk').subscribe(() => resolve()));
      a.notify('disk');
      await heard;
      expect(await a.exclusive(async () => 'locked')).toBe('locked');
    } finally {
      a.close();
      b.close();
    }
  });

  it('环境里没有 Web Locks，用到时直接报错，不悄悄放行', () => {
    vi.stubGlobal('navigator', {});
    const sync = new TabSync();
    expect(() => sync.exclusive(async () => 1)).toThrow('Web Locks');
    vi.stubGlobal('navigator', undefined);
    expect(() => sync.exclusive(async () => 1)).toThrow('Web Locks');
  });

  it('不传 locks 时每次用到才取 navigator.locks：后装的替身也生效', async () => {
    const sync = new TabSync();
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal('navigator', { locks: { request } });
    await sync.exclusive(async () => 1);
    expect(request).toHaveBeenCalledWith(DISK_LOCK, expect.any(Function));
  });
});
