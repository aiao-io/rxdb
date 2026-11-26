import { RxDB, RxDBIdentityMismatchError } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RemoteSyncState } from './remote-sync-state';
import { SyncCommands } from './sync-commands';

function setup(options: { pull?: () => Promise<unknown>; push?: () => Promise<unknown>; connected?: boolean } = {}) {
  const pushable$ = new BehaviorSubject(2);
  const pullable$ = new BehaviorSubject(1);
  const syncManager = {
    pull: vi.fn(
      options.pull ??
        (() =>
          Promise.resolve({ pulled: 3, applied: 2, failures: [], hasMore: false, compacted: 0 } as unknown as never))
    ),
    push: vi.fn(options.push ?? (() => Promise.resolve({ pushed: 2, rejected: 0, failures: [] } as unknown as never)))
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RxDB,
        useValue: { syncManager, versionManager: { pushableCount$: pushable$, pullableCount$: pullable$ } }
      }
    ]
  });
  TestBed.inject(RemoteSyncState).markConnected(options.connected ?? true);
  return { commands: TestBed.inject(SyncCommands), syncManager, pushable$ };
}

describe('SyncCommands', () => {
  it('拉取整机一次拉到底，推送整机；按钮上的数是待拉、待推', async () => {
    const { commands, syncManager } = setup();

    expect(commands.pull.count()).toBe(1);
    expect(commands.push.count()).toBe(2);
    await commands.pull.run();
    await commands.push.run();

    expect(syncManager.pull).toHaveBeenCalledWith({ fetchAll: true });
    expect(syncManager.push).toHaveBeenCalledWith();
  });

  it('每轮结束（成功或失败）轮次加一，结果写明条数', async () => {
    const { commands } = setup({ push: () => Promise.reject(new Error('网络断了')) });

    await commands.pull.run();
    expect(commands.round()).toBe(1);
    expect(commands.result()).toMatchObject({
      direction: 'pull',
      notice: '拉取完成：拉到 3 条，落库 2 条',
      error: null
    });

    await commands.push.run();
    expect(commands.round()).toBe(2);
    expect(commands.result()).toMatchObject({
      direction: 'push',
      notice: null,
      error: '推送失败：网络断了',
      identityMismatch: false
    });
  });

  it('会话已在别处换了身份：结果标出身份不匹配，好给出「重新加载」', async () => {
    const { commands } = setup({
      pull: () => Promise.reject(new RxDBIdentityMismatchError('remote', 'client-key', ['other-key']))
    });

    await commands.pull.run();

    expect(commands.result()).toMatchObject({
      identityMismatch: true,
      error:
        '拉取失败：身份不匹配。浏览器里的会话已经换成另一个身份，本页还开着上一个身份的库，本地数据没动；重新加载打开新身份的库'
    });
  });

  it('进行中两颗按钮都不可点；没有待推送时推送不可点', async () => {
    let finish: () => void = () => undefined;
    const { commands, pushable$ } = setup({
      pull: () => new Promise(resolve => (finish = () => resolve({ pulled: 0, applied: 0, failures: [] })))
    });

    const running = commands.pull.run();
    expect(commands.pull.pending()).toBe(true);
    expect(commands.pull.disabledReason()).toBe('正在同步');
    expect(commands.push.disabledReason()).toBe('正在同步');
    finish();
    await running;

    pushable$.next(0);
    expect(commands.push.disabledReason()).toBe('没有待推送的修改');
    expect(commands.pull.disabledReason()).toBeNull();
  });

  it('页面登记用：连着远端时给出推拉两条命令，本地模式没有', () => {
    expect(setup({ connected: true }).commands.forPage()).toMatchObject({
      push: expect.any(Object),
      pull: expect.any(Object)
    });
    TestBed.resetTestingModule();
    expect(setup({ connected: false }).commands.forPage()).toEqual({ push: null, pull: null });
  });
});
