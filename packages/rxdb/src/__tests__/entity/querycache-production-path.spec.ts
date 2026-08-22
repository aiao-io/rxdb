/**
 * @fileoverview US-020 阶段 B —— QueryCache 生产路径的两条收口断言（AC#18 / AC#20）。
 *
 * 与 `entity-manager.querycache.spec.ts` 的分工：那份盯批量入口的**去向**（走哪条写路径），
 * 这份盯两件别处证明不了的事 ——
 *
 * - **AC#18**：US-203 AC#6 与 US-006 AC#6 这两条已经 ✅ 的验收，在 `getRepository` 的生产
 *   路径上仍然成立。它们原先只在适配器单测 / `QueryCacheRepository` 类测里被证明过，
 *   而病灶 1 的形态恰恰是「类是好的、生产路径打不到它」。此处按 `sqlite` + `supabase`
 *   两个注册名接线，经 `entityManager.getRepository()` 复现，不动那两个故事的 ✅。
 * - **AC#20**：缓存写与孤儿清理都是**可丢弃投影**上的操作，不得留下 Full 同步那种
 *   local changelog 条目。core 里 changelog 只由两条路产出 —— `adapter.mutations()`
 *   （带 `localChanges`）与本地行仓储的 `create/update/remove`；`upsertMany` / `deleteByIds`
 *   在真实适配器里走的是 `transaction(..., false)`（不记事务日志）。所以断言口径是：
 *   QueryCache 只碰后两个 duck，前两条路一次都不亮。
 */
import { delay, firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { isEntityMatchWhere } from '../../query/query-matching.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';

@Entity({
  name: 'CachedArticle',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'status', type: PropertyType.string }
  ],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedArticle extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  status!: string;
}

/** 同形状的 Full 实体：AC#20 的对照组，用来证明「进 changelog 的那条路」确实存在且没被改道 */
@Entity({
  name: 'VersionedArticle',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'status', type: PropertyType.string }
  ],
  sync: {
    type: SyncType.Full,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class VersionedArticle extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  status!: string;
}

interface Row {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

const row = (id: string, updatedAt: string, status = 'published'): Row => ({
  id,
  title: `article-${id}`,
  status,
  updatedAt
});

/** 只要 `status = 'published'`：用来证明「命中范围外的行不参与同步」 */
const PUBLISHED: RuleGroup<Row> = {
  combinator: 'and',
  rules: [{ field: 'status', operator: '=', value: 'published' }]
};

/**
 * 站在真实 sqlite 位置的本地适配器替身。
 *
 * @remarks
 * `getRepository()` 返回的行仓储用真的 `isEntityMatchWhere` 求值 —— `where` 是不是真被下推
 * 到本地读，靠断言它收到的参数，而不是靠「读全表再在内存里筛」。
 * `mutations` 与行仓储的 `create/update/remove` 是 AC#20 的负向哨兵：它们一响就意味着
 * 这次写落进了版本化路径。
 */
const createLocalAdapter = (initial: Row[] = []) => {
  const store = new Map(initial.map(item => [item.id, item]));
  // 真实行仓储返回的是**实体实例**（带状态机），统一 `Repository` 会对每行读状态。
  // 只有 `rxdb.init()` 之后才拿得到 `entityManager`，所以这里留一个装配口。
  let toEntity: (data: Row) => Row = data => data;

  const repository = {
    find: vi.fn(({ where }: { where: RuleGroup<Row> }) =>
      Promise.resolve([...store.values()].filter(entity => isEntityMatchWhere(entity, where)).map(toEntity))
    ),
    count: vi.fn(() => Promise.resolve(store.size)),
    create: vi.fn((entity: Row) => Promise.resolve(entity)),
    update: vi.fn((entity: Row) => Promise.resolve(entity)),
    remove: vi.fn((entity: Row) => Promise.resolve(entity))
  };

  const adapter = {
    name: 'sqlite',
    mutations: vi.fn(async () => []),
    getRepository: () => repository,
    getMetadataByIds: vi.fn((_entityName: string, ids: string[]) =>
      of(new Map(ids.filter(id => store.has(id)).map(id => [id, store.get(id)!.updatedAt])))
    ),
    upsertMany: vi.fn((_entityName: string, data: Row[]) => {
      for (const item of data) {
        store.set(item.id, item);
      }
      return of(undefined);
    }),
    deleteByIds: vi.fn((_entityName: string, ids: string[]) => {
      for (const id of ids) {
        store.delete(id);
      }
      return of(undefined);
    })
  };

  const attach = (materialize: (data: Row) => Row): void => {
    toEntity = materialize;
  };

  return { adapter, repository, store, attach };
};

/**
 * 远端只认 `rows`：`fetchMetadata` 按 `where` 求值，保证「元数据本身就是收窄过的」。
 *
 * @param delayMs - 让元数据晚于本地缓存到达。SWR 与标准模式的差别只有「交付时远端回来没有」
 *   这一处可观测，不延后就无从区分（同 `Repository.querycache.spec.ts` 的口径）。
 */
const createRemoteAdapter = (rows: Row[] = [], delayMs = 0) => {
  const store = new Map(rows.map(item => [item.id, item]));

  const adapter = {
    name: 'supabase',
    mutations: vi.fn(async () => []),
    getRepository: () => adapter,
    fetchMetadata: vi.fn((_entityName: string, where: RuleGroup<Row>) =>
      of(
        [...store.values()]
          .filter(entity => isEntityMatchWhere(entity, where))
          .map(({ id, updatedAt }) => ({ id, updatedAt }))
      ).pipe(delay(delayMs))
    ),
    findByIds: vi.fn((_entityName: string, ids: string[]) =>
      of(ids.filter(id => store.has(id)).map(id => store.get(id)!))
    ),
    create: vi.fn((_entityName: string, data: Row) => of(data)),
    update: vi.fn((_entityName: string, id: string, patch: Partial<Row>) => of({ ...patch, id })),
    delete: vi.fn(() => of(undefined))
  };

  return { adapter };
};

const createDatabase = (dbName: string, localRows: Row[], remoteRows: Row[], remoteDelayMs = 0) => {
  const local = createLocalAdapter(localRows);
  const remote = createRemoteAdapter(remoteRows, remoteDelayMs);
  const rxdb = new RxDB({
    dbName,
    entities: [CachedArticle, VersionedArticle],
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
  });
  rxdb.adapter('sqlite', () => local.adapter as unknown as IRxDBAdapter);
  rxdb.adapter('supabase', () => remote.adapter as unknown as IRxDBAdapter);
  rxdb.init();
  local.attach(
    data => rxdb.entityManager.createEntityRef(CachedArticle, data, { local: true }) as unknown as Row
  );
  return { rxdb, local, remote };
};

describe('US-020 阶段 B：QueryCache 生产路径（AC#18 / AC#20）', () => {
  describe('AC#18 复现 US-203 AC#6 —— 选 querycache 时只同步查询命中的数据', () => {
    // 远端一共四条，其中 `draft` 不在 `where` 内；本地已有一条新鲜的 `a1`。
    // 只有「命中 where 且本地缺失/过期」的那两条该回源。
    const build = () =>
      createDatabase(
        'QueryCacheProdScope',
        [row('a1', '2026-08-01T00:00:00.000Z')],
        [
          row('a1', '2026-08-01T00:00:00.000Z'),
          row('a2', '2026-08-02T00:00:00.000Z'),
          row('a3', '2026-08-03T00:00:00.000Z'),
          row('draft', '2026-08-04T00:00:00.000Z', 'draft')
        ]
      );

    it('回源只包含命中 where 且本地缺失的 id，范围外的行一条都不拉', async () => {
      const ctx = build();

      const result = await firstValueFrom(
        ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED })
      );

      expect(ctx.remote.adapter.findByIds).toHaveBeenCalledWith('CachedArticle', ['a2', 'a3']);
      expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1);
      expect(result.map(item => item.id).sort()).toEqual(['a1', 'a2', 'a3']);
      // `draft` 既没进元数据，也没落本地缓存
      expect(ctx.local.store.has('draft')).toBe(false);
    });

    it('本地已新鲜的那条不重复回源', async () => {
      const ctx = build();

      await firstValueFrom(ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED }));
      const pulled = vi.mocked(ctx.remote.adapter.findByIds).mock.calls[0][1];

      expect(pulled).not.toContain('a1');
    });

    it('同步范围经 where 收窄：远端 fetchMetadata 收到原样的 RuleGroup', async () => {
      const ctx = build();

      await firstValueFrom(ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED }));

      expect(ctx.remote.adapter.fetchMetadata).toHaveBeenCalledWith('CachedArticle', PUBLISHED);
    });
  });

  describe('AC#18 复现 US-006 AC#6 —— 缓存过期走元数据 diff + 最小拉取', () => {
    // 本地两条：`a1` 过期、`a2` 新鲜。SWR 下先交付缓存，后台只补 `a1` 一条。
    const build = () =>
      createDatabase(
        'QueryCacheProdSwr',
        [row('a1', '2026-08-01T00:00:00.000Z'), row('a2', '2026-08-02T00:00:00.000Z')],
        [row('a1', '2026-08-09T00:00:00.000Z'), row('a2', '2026-08-02T00:00:00.000Z')],
        20
      );

    it('缓存先交付，后台按 diff 只拉过期的那条', async () => {
      const ctx = build();

      const first = await firstValueFrom(
        ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED, localCacheFirst: true })
      );

      // 远端元数据还在路上，结果已经交付 → 首发确实来自本地缓存
      expect(ctx.remote.adapter.findByIds).not.toHaveBeenCalled();
      expect(first.map(item => item.id).sort()).toEqual(['a1', 'a2']);
      // 缓存先发射不取消后台校验；校验只补 diff 出来的那一条，不是整页重拉
      await vi.waitFor(() => expect(ctx.remote.adapter.findByIds).toHaveBeenCalledTimes(1));
      expect(ctx.remote.adapter.findByIds).toHaveBeenCalledWith('CachedArticle', ['a1']);
    });

    it('后台校验把过期行刷进本地缓存，下一次查询读到新值', async () => {
      const ctx = build();

      await firstValueFrom(
        ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED, localCacheFirst: true })
      );
      await vi.waitFor(() => expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1));

      expect(ctx.local.store.get('a1')?.updatedAt).toBe('2026-08-09T00:00:00.000Z');
    });
  });

  describe('AC#20 缓存写与孤儿清理不产生 local changelog 条目', () => {
    let ctx: ReturnType<typeof createDatabase>;

    beforeEach(() => {
      ctx = createDatabase(
        'QueryCacheProdChangelog',
        [row('a1', '2026-08-01T00:00:00.000Z'), row('orphan', '2026-08-01T00:00:00.000Z')],
        [row('a1', '2026-08-01T00:00:00.000Z')]
      );
    });

    it('create 只落 upsertMany，不碰 mutations 也不碰本地行仓储的写方法', async () => {
      const entity = ctx.rxdb.entityManager.createEntityRef(CachedArticle, {
        id: 'a9',
        title: 'a9',
        status: 'published'
      });

      await ctx.rxdb.entityManager.getRepository(CachedArticle).create(entity);

      expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1);
      expect(ctx.local.adapter.mutations).not.toHaveBeenCalled();
      expect(ctx.local.repository.create).not.toHaveBeenCalled();
      expect(ctx.local.repository.update).not.toHaveBeenCalled();
    });

    it('remove 只落 deleteByIds，不碰 mutations 也不碰本地行仓储的 remove', async () => {
      const entity = ctx.rxdb.entityManager.createEntityRef(
        CachedArticle,
        { id: 'a1', title: 'a1', status: 'published' },
        { local: true }
      );

      await ctx.rxdb.entityManager.getRepository(CachedArticle).remove(entity);

      expect(ctx.local.adapter.deleteByIds).toHaveBeenCalledWith('CachedArticle', ['a1']);
      expect(ctx.local.adapter.mutations).not.toHaveBeenCalled();
      expect(ctx.local.repository.remove).not.toHaveBeenCalled();
    });

    it('孤儿清理走 deleteByIds，同样不进 mutations', async () => {
      await firstValueFrom(ctx.rxdb.entityManager.getRepository(CachedArticle).find({ where: PUBLISHED }));

      expect(ctx.local.adapter.deleteByIds).toHaveBeenCalledWith('CachedArticle', ['orphan']);
      expect(ctx.local.adapter.mutations).not.toHaveBeenCalled();
      expect(ctx.local.repository.remove).not.toHaveBeenCalled();
    });

    it('对照组：Full 实体的写仍经本地行仓储（版本化路径靠它进 changelog）', async () => {
      const entity = ctx.rxdb.entityManager.createEntityRef(VersionedArticle, {
        id: 'v1',
        title: 'v1',
        status: 'published'
      });

      await ctx.rxdb.entityManager.getRepository(VersionedArticle).create(entity);

      expect(ctx.local.repository.create).toHaveBeenCalledTimes(1);
      expect(ctx.local.adapter.upsertMany).not.toHaveBeenCalled();
    });
  });
});
