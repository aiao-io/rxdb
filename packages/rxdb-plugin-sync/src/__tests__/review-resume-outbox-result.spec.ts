import {
  createEntitySyncResolver,
  Entity,
  ENTITY_STATIC_TYPES,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  type SyncOptions,
  SyncStateHub,
  SyncType
} from '@aiao/rxdb';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { flushQueryCacheOutbox } from '../query-cache-outbox.js';
import { setupSyncListeners } from '../sync-listeners.js';
import type { SyncManager } from '../SyncManager.js';
import { detachedReachability } from './fixtures/reachability.js';

@Entity({
  name: 'ReviewOutboxArticle',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
})
class ReviewOutboxArticle extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

const settleDetachedTasks = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 出站重放和监听器均用原实现；系统仓储、远端 REST 和宿主事件源是接缝。 */
const createHarness = (failure?: Error) => {
  const namespace = getEntityMetadata(ReviewOutboxArticle).namespace;
  const syncRow = {
    id: `${namespace}:ReviewOutboxArticle:main`,
    namespace,
    entity: 'ReviewOutboxArticle',
    branchId: 'main',
    syncType: 'querycache',
    enabled: true,
    lastPushedChangeId: null
  } as RxDBSync;
  const change = {
    id: 1,
    namespace,
    entity: 'ReviewOutboxArticle',
    entityId: 'a',
    branchId: 'main',
    type: 'INSERT',
    remoteId: null,
    revertChangeId: null,
    patch: { title: 'queued' },
    inversePatch: null,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    updatedAt: new Date('2026-10-04T00:00:00.000Z')
  } satisfies Partial<RxDBChange>;
  const pending = () => (syncRow.lastPushedChangeId === null || syncRow.lastPushedChangeId < 1 ? [change] : []);
  const branchRepo = { find: vi.fn(async () => [{ id: 'main', activated: true }]) };
  const changeRepo = { find: vi.fn(async () => pending()) };
  const syncRepo = {
    find: vi.fn(async () => [syncRow]),
    update: vi.fn(async (row: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(row, patch))
  };
  const local = {
    getRepository: (type: unknown) => {
      if (type === RxDBBranch) return branchRepo;
      if (type === RxDBChange) return changeRepo;
      if (type === RxDBSync) return syncRepo;
      throw new Error('未授权的测试仓储');
    },
    upsertMany: vi.fn(() => of(undefined)),
    deleteByIds: vi.fn(() => of(undefined))
  };
  const remote = {
    fetchMetadata: vi.fn(() => of([])),
    findByIds: vi.fn(() => of([])),
    create: vi.fn((_entity: string, data: unknown) => (failure ? throwError(() => failure) : of(data)))
  };
  const connected$ = new BehaviorSubject(false);
  const reachability = detachedReachability();
  const syncState = new SyncStateHub({ online$: reachability.online$ });
  const reportSuccess = vi.spyOn(syncState, 'reportSuccess');
  const configSync: SyncOptions = {
    type: SyncType.QueryCache,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  };
  const rxdb = {
    config: { entities: [ReviewOutboxArticle], sync: configSync },
    entitySync: createEntitySyncResolver(configSync),
    connected$,
    reachability,
    syncState,
    localAdapter$: of(local),
    remoteAdapter$: of(remote),
    entityManager: { getRepository: () => ({ count: () => of(pending().length) }) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as RxDB;
  const manager = { rxdb } as SyncManager;
  const listeners = setupSyncListeners(manager);
  const cleanup = () => {
    listeners.subscriptions.forEach(sub => sub.unsubscribe());
    listeners.removers.forEach(remove => remove());
    syncState.destroy();
    reachability.destroy();
    reportSuccess.mockRestore();
  };
  return { rxdb, namespace, connected$, syncRow, syncState, reportSuccess, remote, cleanup };
};

describe('评审复验：自动恢复必须消费 outbox 结构化失败', () => {
  it('REST 403 被真实 flush 转成 failures 后，不应宣布成功并清除错误', async () => {
    const failure = Object.assign(new Error('Forbidden'), { status: 403 });
    const ctx = createHarness(failure);
    try {
      const manual = await flushQueryCacheOutbox(ctx.rxdb, ctx.namespace, 'ReviewOutboxArticle');
      expect(manual.failures).toEqual([{ entityId: 'a', error: failure }]);
      expect(manual.watermark).toBeNull();
      ctx.syncState.reportError(new Error('上一轮错误'));
      ctx.connected$.next(true);
      await settleDetachedTasks();
      expect(ctx.remote.create).toHaveBeenCalledTimes(2);
      expect(ctx.syncRow.lastPushedChangeId).toBeNull();
      expect(ctx.syncState.snapshot.pendingCount).toBe(1);
      expect(ctx.syncState.snapshot.syncing).toBe(false);
      expect.soft(ctx.syncState.snapshot.lastError).toBe(failure);
      expect.soft(ctx.reportSuccess).not.toHaveBeenCalled();
    } finally {
      ctx.cleanup();
    }
  });

  it('网络失败被真实 flush 转成 failures 后，不应宣布成功', async () => {
    const failure = new TypeError('Failed to fetch');
    const ctx = createHarness(failure);
    try {
      ctx.connected$.next(true);
      await settleDetachedTasks();
      expect(ctx.remote.create).toHaveBeenCalledTimes(1);
      expect(ctx.syncRow.lastPushedChangeId).toBeNull();
      expect(ctx.syncState.snapshot.pendingCount).toBe(1);
      expect(ctx.syncState.snapshot.online).toBe(false);
      expect.soft(ctx.syncState.snapshot.lastError).toBe(failure);
      expect.soft(ctx.reportSuccess).not.toHaveBeenCalled();
    } finally {
      ctx.cleanup();
    }
  });

  it('对照：REST 写成功推进水位后，才允许宣布成功并清除旧错误', async () => {
    const ctx = createHarness();
    try {
      ctx.syncState.reportError(new Error('上一轮错误'));
      ctx.connected$.next(true);
      await settleDetachedTasks();
      expect(ctx.remote.create).toHaveBeenCalledTimes(1);
      expect(ctx.syncRow.lastPushedChangeId).toBe(1);
      expect(ctx.syncState.snapshot.pendingCount).toBe(0);
      expect(ctx.syncState.snapshot.lastError).toBeNull();
      expect(ctx.reportSuccess).toHaveBeenCalledTimes(1);
    } finally {
      ctx.cleanup();
    }
  });
});
