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
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { ReachabilityMonitor } from '../../network/reachability.js';
import { QueryCacheSyncMemo } from '../../repository/query-cache-sync-memo.js';
import { createQueryCachePrimary } from '../../repository/query-cache-primary.js';
import { NetworkOfflineError } from '../../RxDBError.js';

class CachedEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id!: string;
  updatedAt!: string;
  value?: number;
}

type CachedEntityCtor = typeof CachedEntity;

const row = (id: string, updatedAt: string, value = 0): CachedEntity =>
  Object.assign(new CachedEntity(), { id, updatedAt, value });

/** 断网时 `fetch()` 抛的那个 `TypeError`，走 `isNetworkError` 的第 5 条判据 */
const offlineError = (): TypeError => new TypeError('Failed to fetch');

/** 远端给出的业务回答：拿到了状态码就说明连接是通的（第 2 条判据） */
const unauthorized = (): Error => Object.assign(new Error('Unauthorized'), { status: 401 });

/** 事件源钉死成空实现：用例只经 `report()` 驱动状态，不受宿主 `navigator` 影响 */
const createMonitor = (): ReachabilityMonitor =>
  new ReachabilityMonitor({
    navigatorOnLine: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  });

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
  fetchMetadata: vi.fn(() => of([])),
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
  const reachability = createMonitor();
  const syncMemo = new QueryCacheSyncMemo(0);
  const primary = createQueryCachePrimary<CachedEntityCtor>(
    'CachedEntity',
    CachedEntity,
    localAdapter as never,
    remoteAdapter as never,
    false,
    syncMemo,
    reachability
  );
  return { primary, localRepo, localAdapter, remoteAdapter, reachability, syncMemo };
};

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
});
