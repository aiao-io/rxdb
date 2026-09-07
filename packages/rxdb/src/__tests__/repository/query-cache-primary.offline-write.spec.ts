/**
 * @fileoverview QueryCache 的离线可写路径（local-first）
 *
 * @remarks
 * 推翻 US-020 D5「不为 QueryCache 做乐观离线写」。写路径的分流口径与读路径
 * （`QueryCacheRepository.#wrapWithOfflineFallback`，US-020 AC#16）**逐字一致**：
 * 只有 {@link isNetworkError} 认定的网络故障才落本地，401 / 校验 / 业务错误原样上抛。
 *
 * 本地落盘必须经 `localRepository`（实体仓储）而不是 `localAdapter.upsertMany`：
 * 后者是裸 SQL 且已被触发器三明治抑制（`withTriggersDisabled`），写进去**不会入队**，
 * 联网后没有任何东西可重放 —— 那是一次静默的数据丢失。
 */

import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, type QueryCacheEntityMetadata } from '../../entity/metadata-options.interface.js';
import type { ReachabilityMonitor } from '../../network/reachability.js';
import { createQueryCachePrimary } from '../../repository/query-cache-primary.js';
import { QueryCacheSyncMemo } from '../../repository/query-cache-sync-memo.js';
import { NetworkOfflineError } from '../../RxDBError.js';
import { SyncStateHub } from '../../sync-state.js';
import { detachedReachability } from '../fixtures/reachability.js';

/*
 * 只声明 `value` 一个属性，`updatedAt` 故意不进元数据。
 *
 * 写路径会拿元数据把远端响应解码回实体侧的运行时值（`parseEntityRecordValues`），
 * 元数据里没有的键**原样透传** —— 于是本文件里的 `updatedAt` 一直是 ISO 串，
 * 与下面所有断言一致。这套用例要验的是「网络故障如何分流」，不是解码本身；
 * 解码那条边界另有 `query-cache-primary.remote-decode.spec.ts` 专门守着。
 */
@Entity({
  name: 'CachedEntity',
  properties: [{ name: 'value', type: PropertyType.number }]
})
class CachedEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id!: string;
  updatedAt!: string;
  value?: number;
}

type CachedEntityCtor = typeof CachedEntity;

/*
 * 用裸对象而不是 `new CachedEntity()`：装饰过的构造函数要一个已初始化的 RxDB
 * （`need init rxdb`），而这里只需要一份数据形状。
 */
const row = (id: string, updatedAt: string, value = 0): CachedEntity => ({ id, updatedAt, value }) as CachedEntity;

/** 断网时 `fetch()` 抛的那个 `TypeError`，走 `isNetworkError` 的第 5 条判据 */
const offlineError = (): TypeError => new TypeError('Failed to fetch');

/** 远端给出的业务回答：拿到了状态码就说明连接是通的（第 2 条判据） */
const unauthorized = (): Error => Object.assign(new Error('Unauthorized'), { status: 401 });

const createLocalRepo = () => ({
  find: vi.fn(async () => [] as CachedEntity[]),
  count: vi.fn(async () => 0),
  create: vi.fn(async (entity: CachedEntity) => entity),
  update: vi.fn(async (entity: CachedEntity, patch: Partial<CachedEntity>) => Object.assign(entity, patch)),
  remove: vi.fn(async (entity: CachedEntity) => entity)
});

const createLocalAdapter = (localRepo: ReturnType<typeof createLocalRepo>) => ({
  getRepository: vi.fn(() => localRepo),
  getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
  upsertMany: vi.fn(() => of(undefined)),
  deleteByIds: vi.fn(() => of(undefined))
});

const createRemoteAdapter = () => ({
  fetchMetadata: vi.fn(() => of([] as QueryCacheEntityMetadata[])),
  findByIds: vi.fn(() => of([] as CachedEntity[])),
  create: vi.fn((_entityName: string, data: CachedEntity) => of(data)),
  update: vi.fn((_entityName: string, id: string, patch: Partial<CachedEntity>) =>
    of(row(id, '2026-01-02T00:00:00Z', patch.value ?? 0))
  ),
  delete: vi.fn(() => of(undefined))
});

const setup = () => {
  const localRepo = createLocalRepo();
  const localAdapter = createLocalAdapter(localRepo);
  const remoteAdapter = createRemoteAdapter();
  const reachability = detachedReachability();
  const syncState = new SyncStateHub({ online$: reachability.online$, pushableCount$: of(0) });
  const syncMemo = new QueryCacheSyncMemo(0);
  /* 出站队列此刻占着哪些 id；生产路径读 `rxdb_change`，这里直接摆结果 */
  const pendingWriteIds = vi.fn(async (): Promise<ReadonlySet<string>> => new Set<string>());
  const primary = createQueryCachePrimary<CachedEntityCtor>(
    'CachedEntity',
    CachedEntity,
    localAdapter as never,
    remoteAdapter as never,
    false,
    syncMemo,
    reachability,
    syncState,
    pendingWriteIds
  );
  return { primary, localRepo, localAdapter, remoteAdapter, reachability, syncMemo, syncState, pendingWriteIds };
};

/** 本次 `where` 的全集查询 */
const ALL = { combinator: 'and' as const, rules: [] };

/** 远端元数据一行 */
const meta = (id: string, updatedAt: string): QueryCacheEntityMetadata => ({ id, updatedAt });

/** 把监视器推到「已知离线」：`report` 认定网络故障后 `online` 立刻翻 false */
const goOffline = (reachability: ReachabilityMonitor): void => {
  reachability.report(new NetworkOfflineError(new Error('offline')));
  expect(reachability.online).toBe(false);
};

describe('QueryCache 离线可写（推翻 US-020 D5）', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  describe('已知离线时跳过注定失败的远端调用', () => {
    it('create 不打远端，直接经 localRepository 落本地', async () => {
      goOffline(ctx.reachability);
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      const created = await ctx.primary.create(entity);

      expect(ctx.remoteAdapter.create).not.toHaveBeenCalled();
      expect(ctx.localRepo.create).toHaveBeenCalledWith(entity);
      expect(created).toBe(entity);
    });

    it('update 不打远端，直接经 localRepository 落本地', async () => {
      goOffline(ctx.reachability);
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      await ctx.primary.update(entity, { value: 9 });

      expect(ctx.remoteAdapter.update).not.toHaveBeenCalled();
      expect(ctx.localRepo.update).toHaveBeenCalledWith(entity, { value: 9 });
    });

    it('remove 不打远端，直接经 localRepository 删本地', async () => {
      goOffline(ctx.reachability);
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      await ctx.primary.remove(entity);

      expect(ctx.remoteAdapter.delete).not.toHaveBeenCalled();
      expect(ctx.localRepo.remove).toHaveBeenCalledWith(entity);
    });

    // 出站队列由触发器产出，而触发器只认实体仓储的写。走 upsertMany 那条裸 SQL
    // 路径（已被 withTriggersDisabled 抑制）等于把改动写进本地却一个字都不入队。
    it('离线写不走 upsertMany / deleteByIds 这两条裸 SQL 出口', async () => {
      goOffline(ctx.reachability);

      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));
      await ctx.primary.update(row('b', '2026-01-01T00:00:00Z', 1), { value: 2 });
      await ctx.primary.remove(row('c', '2026-01-01T00:00:00Z', 1));

      expect(ctx.localAdapter.upsertMany).not.toHaveBeenCalled();
      expect(ctx.localAdapter.deleteByIds).not.toHaveBeenCalled();
    });
  });

  describe('在线但远端连不上：降级落本地', () => {
    it('create 网络错误 → 落本地并返回本地实体', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => offlineError()));
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      const created = await ctx.primary.create(entity);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(ctx.localRepo.create).toHaveBeenCalledWith(entity);
      expect(created).toBe(entity);
    });

    it('update 网络错误 → 落本地', async () => {
      ctx.remoteAdapter.update.mockReturnValueOnce(throwError(() => offlineError()));
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      await ctx.primary.update(entity, { value: 9 });

      expect(ctx.localRepo.update).toHaveBeenCalledWith(entity, { value: 9 });
    });

    it('remove 网络错误 → 删本地', async () => {
      ctx.remoteAdapter.delete.mockReturnValueOnce(throwError(() => offlineError()));
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      await ctx.primary.remove(entity);

      expect(ctx.localRepo.remove).toHaveBeenCalledWith(entity);
    });

    it('降级时把离线判定上报给可达性监视器', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => offlineError()));
      expect(ctx.reachability.online).toBe(true);

      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));

      expect(ctx.reachability.online).toBe(false);
    });
  });

  describe('非网络错误原样上抛，且不入队', () => {
    it('create 遇 401 上抛，本地不写', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => unauthorized()));

      await expect(ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1))).rejects.toMatchObject({ status: 401 });
      expect(ctx.localRepo.create).not.toHaveBeenCalled();
    });

    it('update 遇 401 上抛，本地不写', async () => {
      ctx.remoteAdapter.update.mockReturnValueOnce(throwError(() => unauthorized()));

      await expect(ctx.primary.update(row('a', '2026-01-01T00:00:00Z', 1), { value: 9 })).rejects.toMatchObject({
        status: 401
      });
      expect(ctx.localRepo.update).not.toHaveBeenCalled();
    });

    it('remove 遇 401 上抛，本地不删', async () => {
      ctx.remoteAdapter.delete.mockReturnValueOnce(throwError(() => unauthorized()));

      await expect(ctx.primary.remove(row('a', '2026-01-01T00:00:00Z', 1))).rejects.toMatchObject({ status: 401 });
      expect(ctx.localRepo.remove).not.toHaveBeenCalled();
    });

    // 401 不是「连不上」：拿到状态码说明连接是通的，翻成离线会让整个应用
    // 在一次鉴权失败后集体转入离线模式
    it('401 不改变可达性判定', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => unauthorized()));

      await expect(ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1))).rejects.toBeDefined();

      expect(ctx.reachability.online).toBe(true);
    });
  });

  describe('在线且远端可达：保持既有的远端优先行为', () => {
    it('create 先远端后回填缓存，不经 localRepository 写', async () => {
      const entity = row('a', '2026-01-01T00:00:00Z', 1);

      await ctx.primary.create(entity);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(ctx.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
      expect(ctx.localRepo.create).not.toHaveBeenCalled();
    });

    it('remove 先远端后删缓存，不经 localRepository 删', async () => {
      await ctx.primary.remove(row('a', '2026-01-01T00:00:00Z', 1));

      expect(ctx.remoteAdapter.delete).toHaveBeenCalledTimes(1);
      expect(ctx.localAdapter.deleteByIds).toHaveBeenCalledTimes(1);
      expect(ctx.localRepo.remove).not.toHaveBeenCalled();
    });

    // 一次成功的远端调用是「在线」的证据：没有它，离线期间的第一次成功重试
    // 无法把状态翻回来，退避会一直排下去
    it('远端成功把可达性翻回在线', async () => {
      goOffline(ctx.reachability);
      // 离线判定只影响「跳过远端」，这里显式恢复以验证成功路径会上报
      ctx.reachability.report(null);
      expect(ctx.reachability.online).toBe(true);

      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));

      expect(ctx.reachability.online).toBe(true);
    });
  });

  // 本地缓存内容变了，「刚同步过」的记忆必须作废 —— 否则窗口内的下一次读
  // 会跳过同步，直接把没带上本次改动的旧投影交出去
  it('三条写路径都清空同步记忆，离线分支也不例外', async () => {
    goOffline(ctx.reachability);
    const clear = vi.spyOn(ctx.syncMemo, 'clear');

    await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));
    await ctx.primary.update(row('b', '2026-01-01T00:00:00Z', 1), { value: 2 });
    await ctx.primary.remove(row('c', '2026-01-01T00:00:00Z', 1));

    expect(clear).toHaveBeenCalledTimes(3);
  });

  describe('入队的写要在同步面板上看得见', () => {
    it('三条离线写各把待推数加一', async () => {
      goOffline(ctx.reachability);

      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));
      await ctx.primary.update(row('b', '2026-01-01T00:00:00Z', 1), { value: 2 });
      await ctx.primary.remove(row('c', '2026-01-01T00:00:00Z', 1));

      expect(ctx.syncState.snapshot.pendingCount).toBe(3);
    });

    it('降级落本地同样计数', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => offlineError()));

      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));

      expect(ctx.syncState.snapshot.pendingCount).toBe(1);
    });

    it('远端写成功不计数', async () => {
      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));

      expect(ctx.syncState.snapshot.pendingCount).toBe(0);
    });

    // 上抛的写什么都没排上队，计上就等于面板永远显示一条推不掉的积压
    it('401 上抛不计数', async () => {
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => unauthorized()));

      await expect(ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1))).rejects.toBeDefined();

      expect(ctx.syncState.snapshot.pendingCount).toBe(0);
    });

    // 本地写自己失败了也没排上队
    it('本地写失败不计数', async () => {
      goOffline(ctx.reachability);
      ctx.localRepo.create.mockRejectedValueOnce(new Error('disk full'));

      await expect(ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1))).rejects.toThrow('disk full');

      expect(ctx.syncState.snapshot.pendingCount).toBe(0);
    });
  });

  /*
   * 同步流程按「远端权威」判定本地缓存：远端没返回的行是孤儿，删；远端更新的行是陈旧，
   * 拉回来盖。这套判据对**远端投影**是对的，对**还在出站队列里的行**是错的 —— 那些行
   * 远端还没见过，它的沉默不是权威答复，只是没收到。
   *
   * 三条支路都要拦，因为三种离线写各落一条：
   * 新建 → 孤儿删；删除 → 缺失拉回来复活；修改 → 陈旧被远端旧值盖掉。
   */
  describe('出站队列占着的行，同步一步都不许动', () => {
    /** 恢复联网：`report(null)` 是「已恢复」的唯一证据 */
    const goOnline = () => {
      ctx.reachability.report(null);
      expect(ctx.reachability.online).toBe(true);
    };

    it('离线新建的行不被当成孤儿删掉', async () => {
      goOffline(ctx.reachability);
      await ctx.primary.create(row('a', '2026-01-01T00:00:00Z', 1));

      // 远端还没收到这一行（出站队列还没推），但本地投影里有
      goOnline();
      ctx.localRepo.find.mockResolvedValue([row('a', '2026-01-01T00:00:00Z', 1)]);
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(of([]));
      ctx.pendingWriteIds.mockResolvedValue(new Set(['a']));

      await ctx.primary.find({ where: ALL } as never);

      expect(ctx.localAdapter.deleteByIds).not.toHaveBeenCalled();
    });

    it('离线删除的行不被远端拉回来复活', async () => {
      // 本地已经删掉了（投影为空），远端还留着 —— DELETE 还压在出站队列里
      ctx.localRepo.find.mockResolvedValue([]);
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(of([meta('a', '2026-01-01T00:00:00Z')]));
      ctx.pendingWriteIds.mockResolvedValue(new Set(['a']));

      await ctx.primary.find({ where: ALL } as never);

      expect(ctx.remoteAdapter.findByIds).not.toHaveBeenCalled();
      expect(ctx.localAdapter.upsertMany).not.toHaveBeenCalled();
    });

    it('离线改过的行不被更新的远端行盖掉', async () => {
      // 远端 updatedAt 更新 → diff 判 stale。但本地这一版还没推出去，
      // 拉回来盖掉等于绕过用户配的 conflictResolver 直接判本地输。
      ctx.localRepo.find.mockResolvedValue([row('a', '2026-01-01T00:00:00Z', 1)]);
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(of([meta('a', '2026-03-01T00:00:00Z')]));
      ctx.pendingWriteIds.mockResolvedValue(new Set(['a']));

      await ctx.primary.find({ where: ALL } as never);

      expect(ctx.remoteAdapter.findByIds).not.toHaveBeenCalled();
      expect(ctx.localAdapter.upsertMany).not.toHaveBeenCalled();
    });

    it('队列里没有的行照常按远端权威处置', async () => {
      ctx.localRepo.find.mockResolvedValue([row('a', '2026-01-01T00:00:00Z', 1)]);
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(of([meta('b', '2026-03-01T00:00:00Z')]));
      ctx.remoteAdapter.findByIds.mockReturnValue(of([row('b', '2026-03-01T00:00:00Z', 2)]));
      ctx.pendingWriteIds.mockResolvedValue(new Set<string>());

      await ctx.primary.find({ where: ALL } as never);

      expect(ctx.localAdapter.deleteByIds).toHaveBeenCalledWith('CachedEntity', ['a']);
      expect(ctx.remoteAdapter.findByIds).toHaveBeenCalledWith('CachedEntity', ['b']);
    });

    // 读不出队列就不知道哪些行归它管，此时任何一次删/盖都是赌。上抛，不猜。
    it('读不出出站队列时整轮同步失败，不写一个字节', async () => {
      ctx.localRepo.find.mockResolvedValue([row('a', '2026-01-01T00:00:00Z', 1)]);
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(of([]));
      ctx.pendingWriteIds.mockRejectedValue(new Error('change log unreadable'));

      await expect(ctx.primary.find({ where: ALL } as never)).rejects.toThrow('change log unreadable');

      expect(ctx.localAdapter.deleteByIds).not.toHaveBeenCalled();
    });
  });
});
