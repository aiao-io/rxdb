import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import { SyncStateHub, type SyncState } from '../sync-state.js';

type Sources = {
  online$: BehaviorSubject<boolean>;
  pushableCount$: BehaviorSubject<number>;
};

const createHub = (
  overrides: Partial<{ online: boolean; pushable: number; outbox: number }> = {}
): { hub: SyncStateHub; sources: Sources } => {
  const sources: Sources = {
    online$: new BehaviorSubject(overrides.online ?? true),
    pushableCount$: new BehaviorSubject(overrides.pushable ?? 0)
  };
  const hub = new SyncStateHub(sources);
  if (overrides.outbox !== undefined) {
    hub.reportOutboxCount(overrides.outbox);
  }
  return { hub, sources };
};

const snapshot = (hub: SyncStateHub): Promise<SyncState> => firstValueFrom(hub.state$);

describe('SyncStateHub', () => {
  it('把五个字段汇总成一份快照', async () => {
    const { hub } = createHub({ online: false, pushable: 2, outbox: 3 });

    await expect(snapshot(hub)).resolves.toEqual({
      online: false,
      pendingCount: 5,
      syncing: false,
      lastError: null,
      lastConflict: null
    });

    hub.destroy();
  });

  it('pendingCount 是两条推送路径之和', async () => {
    const { hub, sources } = createHub({ pushable: 1, outbox: 1 });

    expect((await snapshot(hub)).pendingCount).toBe(2);

    hub.reportOutboxCount(4);
    expect((await snapshot(hub)).pendingCount).toBe(5);

    sources.pushableCount$.next(0);
    expect((await snapshot(hub)).pendingCount).toBe(4);

    hub.destroy();
  });

  // 离线写只知道「又多了一条」，不知道总数；重算一遍要多打一次库，而这个 +1 是确定的
  it('reportOfflineWrite 把出站数加一', async () => {
    const { hub } = createHub({ pushable: 2, outbox: 1 });

    hub.reportOfflineWrite();

    expect((await snapshot(hub)).pendingCount).toBe(4);
    hub.destroy();
  });

  // 一轮回推跑完会重算，重算的绝对值必须压过此前累加出来的数
  it('重算的绝对值覆盖累加值', async () => {
    const { hub } = createHub();
    hub.reportOfflineWrite();
    hub.reportOfflineWrite();

    hub.reportOutboxCount(0);

    expect((await snapshot(hub)).pendingCount).toBe(0);
    hub.destroy();
  });

  it('online 透传上游可达性', async () => {
    const { hub, sources } = createHub({ online: true });

    sources.online$.next(false);

    expect((await snapshot(hub)).online).toBe(false);
    hub.destroy();
  });

  it('beginRound / endRound 翻转 syncing', async () => {
    const { hub } = createHub();

    hub.beginRound();
    expect((await snapshot(hub)).syncing).toBe(true);

    hub.endRound();
    expect((await snapshot(hub)).syncing).toBe(false);

    hub.destroy();
  });

  it('reportError 记下最后一次失败', async () => {
    const { hub } = createHub();
    const failure = new Error('push down');

    hub.reportError(failure);

    expect((await snapshot(hub)).lastError).toBe(failure);
    hub.destroy();
  });

  // 回推链吞掉的原始值可能是任何东西，面板要显示的是 Error
  it('非 Error 的失败被规范成 Error', async () => {
    const { hub } = createHub();

    hub.reportError('offline');

    const { lastError } = await snapshot(hub);
    expect(lastError).toBeInstanceOf(Error);
    expect(lastError?.message).toBe('offline');
    hub.destroy();
  });

  // 一轮跑完且没有任何失败，上一次的错误就不该继续挂在面板上
  it('reportSuccess 清掉上一次的失败', async () => {
    const { hub } = createHub();
    hub.reportError(new Error('push down'));

    hub.reportSuccess();

    expect((await snapshot(hub)).lastError).toBeNull();
    hub.destroy();
  });

  it('reportConflict 记下最后一次判负的实体', async () => {
    const { hub } = createHub();

    hub.reportConflict({ namespace: 'app', entity: 'Recipe', entityId: 'r-1', winner: 'remote' });

    const { lastConflict } = await snapshot(hub);
    expect(lastConflict).toMatchObject({ namespace: 'app', entity: 'Recipe', entityId: 'r-1', winner: 'remote' });
    expect(lastConflict?.at).toBeInstanceOf(Date);
    hub.destroy();
  });

  // 框架侧会把 state$ 直接绑到渲染上，字段没变还重发就是白刷一帧
  it('字段没变化时不重复发值', async () => {
    const { hub, sources } = createHub({ pushable: 1 });
    const seen = firstValueFrom(hub.state$.pipe(take(2), toArray()));

    sources.pushableCount$.next(1);
    sources.online$.next(true);
    hub.reportOutboxCount(7);

    const states = await seen;
    expect(states.map(state => state.pendingCount)).toEqual([1, 8]);
    hub.destroy();
  });

  it('后订阅的人立刻拿到当前值', async () => {
    const { hub } = createHub({ pushable: 3 });
    hub.beginRound();

    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(snapshot(hub)).resolves.toMatchObject({ pendingCount: 3, syncing: true });
    hub.destroy();
  });

  it('destroy 之后上游再发值也不再更新', async () => {
    const { hub, sources } = createHub({ pushable: 1 });

    hub.destroy();
    sources.pushableCount$.next(99);

    expect((await snapshot(hub)).pendingCount).toBe(1);
  });

  // 上游是冷流时（非 BehaviorSubject），快照必须仍然可读
  it('上游还没发过值时给出零值快照', async () => {
    const online$ = new Subject<boolean>();
    const pushableCount$ = new Subject<number>();
    const hub = new SyncStateHub({ online$, pushableCount$ });

    await expect(snapshot(hub)).resolves.toEqual({
      online: true,
      pendingCount: 0,
      syncing: false,
      lastError: null,
      lastConflict: null
    });

    hub.destroy();
  });
});
