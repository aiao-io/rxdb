import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovedRelease, catalogManifest } from '../data/approved-catalog';
import { configureServices } from '../testing/angular';
import { ApplicationTransitions, applicationLeaseName } from './application-transitions';
import { DesktopWindow } from './desktop-window';
import { WindowManager } from './window-manager';

interface PendingLock {
  name: string;
  mode: LockMode;
  run(lock: Lock | null): Promise<void>;
  reject(reason: unknown): void;
}
class TestLocks {
  private readonly held = new Set<PendingLock>();
  private readonly waiting: PendingLock[] = [];
  request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const pending: PendingLock = {
        name,
        mode: options.mode ?? 'exclusive',
        reject,
        run: async lock => {
          try {
            resolve(await callback(lock));
          } catch (error) {
            reject(error);
          } finally {
            this.held.delete(pending);
            this.flush();
          }
        }
      };
      if (options.ifAvailable && this.busy(pending)) {
        void pending.run(null);
        return;
      }
      const abort = () => {
        const index = this.waiting.indexOf(pending);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        reject(options.signal?.reason);
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      this.waiting.push(pending);
      this.flush();
    });
  }
  private busy(pending: PendingLock): boolean {
    return [...this.held].some(
      held => held.name === pending.name && (held.mode === 'exclusive' || pending.mode === 'exclusive')
    );
  }
  private flush(): void {
    for (const pending of [...this.waiting]) {
      if (this.busy(pending)) continue;
      this.waiting.splice(this.waiting.indexOf(pending), 1);
      this.held.add(pending);
      void pending.run({ name: pending.name, mode: pending.mode } as Lock);
    }
  }
}

class TestChannel {
  static latest: TestChannel;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly close = vi.fn();
  constructor() {
    TestChannel.latest = this;
  }
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function setup() {
  const locks = new TestLocks();
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('BroadcastChannel', TestChannel);
  const windows: DesktopWindow[] = [];
  const wm = {
    focus: vi.fn(),
    unminimize: vi.fn(),
    closeApp: vi.fn(async (id: string) => {
      for (const win of windows.filter(win => win.appId === id && !win.closing())) {
        if (win.confirmClose && !(await win.confirmClose())) return false;
        win.closing.set(true);
        win.beforeClose.next();
      }
      return true;
    })
  };
  configureServices([ApplicationTransitions, { provide: WindowManager, useValue: wm }]);
  const transitions = TestBed.inject(ApplicationTransitions);
  const release: ApprovedRelease = {
    id: 'catalog:editor',
    name: 'Approved Editor',
    bundleId: 'io.example.editor',
    version: '1.0.0',
    url: 'https://apps.example/releases/1.0.0/',
    summary: 'Edit.',
    capabilities: ['window'],
    allow: [],
    readyTimeout: 10000
  };
  const win = new DesktopWindow(
    'w1',
    { ...catalogManifest(release), load: async () => class {} },
    {},
    { left: 0, top: 0, width: 600, height: 400 }
  );
  win.state.set('ready');
  windows.push(win);
  return { transitions, locks, win, wm, channel: TestChannel.latest };
}

afterEach(() => vi.useRealTimers());

describe('跨页应用关闭协商', () => {
  it('窗口先持有运行租约；取消确认保留会话，批准后才提交版本变更', async () => {
    const { transitions, win, wm } = setup();
    const lease = transitions.track(win);
    await lease.ready;
    const change = vi.fn(async () => undefined);
    const cancelled = transitions.change([win.appId], change);
    await vi.waitFor(() => expect(lease.confirming()).toBe(true));
    expect(change).not.toHaveBeenCalled();
    lease.answer(false);
    expect(await cancelled).toBe(false);
    expect(win.closing()).toBe(false);
    const accepted = transitions.change([win.appId], change);
    await vi.waitFor(() => expect(lease.confirming()).toBe(true));
    expect(wm.focus).toHaveBeenCalledWith(win.id);
    lease.answer(true);
    expect(await accepted).toBe(true);
    expect(change).toHaveBeenCalledOnce();
    expect(win.closing()).toBe(true);
  });

  it('收到其他页请求时也先确认；拒绝广播取消，发起页超时撤销挂起确认', async () => {
    const { transitions, win, channel } = setup();
    const lease = transitions.track(win);
    await lease.ready;
    channel.receive({ kind: 'prepare', id: win.appId, token: 'request-one' });
    expect(lease.confirming()).toBe(true);
    lease.answer(false);
    await vi.waitFor(() =>
      expect(channel.postMessage).toHaveBeenCalledWith({ kind: 'decline', id: win.appId, token: 'request-one' })
    );
    channel.receive({ kind: 'prepare', id: win.appId, token: 'request-two' });
    expect(lease.confirming()).toBe(true);
    channel.receive({ kind: 'cancel', id: win.appId, token: 'request-two' });
    expect(lease.confirming()).toBe(false);
    channel.receive({ kind: 'prepare', id: 'notes', token: 'bad' });
    channel.receive(null);
    expect(lease.confirming()).toBe(false);
    lease.dispose();
    lease.dispose();
  });

  it('未响应的其他页使变更明确超时，不提交安装状态', async () => {
    vi.useFakeTimers();
    const { transitions, locks, win } = setup();
    let releaseForeign: () => void = () => undefined;
    const foreign = locks.request(
      applicationLeaseName(win.appId),
      { mode: 'shared' },
      () =>
        new Promise<void>(resolve => {
          releaseForeign = resolve;
        })
    );
    const action = vi.fn(async () => undefined);
    const changing = transitions.change([win.appId], action);
    const rejected = expect(changing).rejects.toThrow('other desktop tabs');
    await vi.advanceTimersByTimeAsync(60000);
    await rejected;
    expect(action).not.toHaveBeenCalled();
    releaseForeign();
    await foreign;
  });

  it('发起页销毁撤销待办并释放租约；并行变更明确拒绝', async () => {
    const { transitions, win, channel } = setup();
    const lease = transitions.track(win);
    await lease.ready;
    const changing = transitions.change([win.appId], async () => undefined);
    await vi.waitFor(() => expect(lease.confirming()).toBe(true));
    await expect(transitions.change([win.appId], async () => undefined)).rejects.toThrow('already');
    const result = expect(changing).rejects.toThrow('closed');
    TestBed.resetTestingModule();
    await result;
    expect(channel.close).toHaveBeenCalledOnce();
  });
});

it('提交期间的新窗口等独占租约释放；其他页拒绝会撤销本页确认', async () => {
  const { transitions, win, channel } = setup();
  let finishCommit: () => void = () => undefined;
  const committing = new Promise<void>(resolve => {
    finishCommit = resolve;
  });
  const changed = transitions.change([win.appId], () => committing);
  const lease = transitions.track(win);
  let ready = false;
  void lease.ready.then(() => {
    ready = true;
  });
  await Promise.resolve();
  expect(ready).toBe(false);
  finishCommit();
  expect(await changed).toBe(true);
  await lease.ready;
  expect(ready).toBe(true);
  const cancelled = transitions.change([win.appId], async () => undefined);
  await vi.waitFor(() => expect(lease.confirming()).toBe(true));
  const request = channel.postMessage.mock.calls
    .map(call => call[0])
    .filter(message => message.kind === 'prepare')
    .at(-1);
  channel.receive({ ...request, kind: 'decline' });
  expect(await cancelled).toBe(false);
  expect(lease.confirming()).toBe(false);
  win.state.set('failed');
  expect(await transitions.change([win.appId], async () => undefined)).toBe(true);
});
