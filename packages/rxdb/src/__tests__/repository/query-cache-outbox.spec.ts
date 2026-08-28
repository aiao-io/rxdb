/**
 * @fileoverview QueryCache 出站重放（离线写攒下的改动，联网后按 REST 动词推回远端）
 *
 * @remarks
 * 这条路径存在的前提是 W4：QueryCache 在远端不可达时经**实体仓储**落本地，触发器随之
 * 产出正常的 `rxdb_change` 行。本文件盯的是那批行怎么回到远端。
 *
 * 三条不变量，坏了任何一条都是静默的数据丢失或数据回滚：
 *
 * 1. **水位线只在整批无失败时推进**。推进过了的行再也查不出来，等于把没送出去的写扔掉。
 * 2. **LWW 判负后的本地修复走 `localAdapter` 裸 SQL**（触发器已被 `withTriggersDisabled`
 *    抑制），不走实体仓储 —— 否则「接受远端」这个动作本身又排出一条出站行，
 *    下一轮再推回去，远端的赢面被本地反复覆盖。
 * 3. **远端不可达时立刻停手**，不把剩下的动作在一条已知断掉的连接上白跑一遍。
 */

import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { flushQueryCacheOutbox } from '../../repository/query-cache-outbox.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { detachedReachability } from '../fixtures/reachability.js';

@Entity({
  name: 'CachedRecipe',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'servings', type: PropertyType.number }
  ],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'http' }
  }
})
class CachedRecipe extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
  servings!: number;
}

/** 同形状的 Full 实体：用来证明入口确实拦住了非 querycache 的仓库 */
@Entity({
  name: 'VersionedRecipe',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.Full,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'http' }
  }
})
class VersionedRecipe extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

const NAMESPACE = getEntityMetadata(CachedRecipe).namespace;
const BRANCH = 'main';

let nextChangeId = 1;

/** 造一条触发器会写出来的 `rxdb_change` 行 */
const change = (over: Partial<RxDBChange> & Pick<RxDBChange, 'type' | 'entityId'>): RxDBChange =>
  Object.assign(new RxDBChange(), {
    id: nextChangeId++,
    namespace: NAMESPACE,
    entity: 'CachedRecipe',
    branchId: BRANCH,
    remoteId: null,
    revertChangeId: null,
    patch: null,
    inversePatch: null,
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    ...over
  });

interface SetupOptions {
  changes?: RxDBChange[];
  /** 远端 `fetchMetadata` 的返回；不给就是「远端没有这些行」 */
  remoteMetadata?: Array<{ id: string; updatedAt: string }>;
  /** 远端 `findByIds` 的返回，KEEP_REMOTE 修复本地缓存时读它 */
  remoteRows?: Array<Record<string, unknown>>;
  /** 预置的同步水位记录；不给就走懒创建 */
  sync?: Partial<RxDBSync>;
  entityType?: typeof CachedRecipe | typeof VersionedRecipe;
}

const setup = (options: SetupOptions = {}) => {
  const changeRows = options.changes ?? [];
  const changeQueries: unknown[] = [];

  const changeRepo = {
    find: vi.fn(async (query: unknown) => {
      changeQueries.push(query);
      return changeRows;
    }),
    update: vi.fn(async (entity: RxDBChange, patch: Partial<RxDBChange>) => Object.assign(entity, patch))
  };

  const syncRow =
    options.sync ?
      Object.assign(new RxDBSync(), {
        id: `${NAMESPACE}:CachedRecipe:${BRANCH}`,
        namespace: NAMESPACE,
        entity: 'CachedRecipe',
        branchId: BRANCH,
        syncType: 'querycache',
        lastPushedChangeId: null,
        enabled: true,
        ...options.sync
      })
    : undefined;

  const syncRepo = {
    find: vi.fn(async () => (syncRow ? [syncRow] : [])),
    create: vi.fn(async (entity: RxDBSync) => entity),
    update: vi.fn(async (entity: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(entity, patch))
  };

  const localAdapter = {
    getRepository: vi.fn((EntityType: unknown) => (EntityType === RxDBSync ? syncRepo : changeRepo)),
    getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
    upsertMany: vi.fn(() => of(undefined)),
    deleteByIds: vi.fn(() => of(undefined))
  };

  const remoteAdapter = {
    fetchMetadata: vi.fn(() => of(options.remoteMetadata ?? [])),
    findByIds: vi.fn(() => of(options.remoteRows ?? [])),
    create: vi.fn((_entity: string, data: unknown) => of(data)),
    update: vi.fn((_entity: string, id: string, patch: Record<string, unknown>) => of({ id, ...patch })),
    delete: vi.fn(() => of(undefined))
  };

  const reachability = detachedReachability();

  const vm = {
    rxdb: {
      config: { entities: [options.entityType ?? CachedRecipe], sync: undefined },
      entityManager: { instantiate: () => new RxDBSync() },
      reachability
    },
    getCurrentBranch: vi.fn(async () => ({ id: BRANCH })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter }))
  } as unknown as VersionManager;

  return { vm, changeRepo, changeQueries, syncRepo, syncRow, localAdapter, remoteAdapter, reachability };
};

const flush = (ctx: ReturnType<typeof setup>, entity = 'CachedRecipe') =>
  flushQueryCacheOutbox(ctx.vm, NAMESPACE, entity);

/** 从 change repo 拿到的那次查询里，把 and 规则摊平出来 */
const rulesOf = (query: unknown): Array<{ field: string; operator: string; value: unknown }> =>
  (query as { where: { rules: Array<{ field: string; operator: string; value: unknown }> } }).where.rules;

beforeEach(() => {
  nextChangeId = 1;
});

describe('flushQueryCacheOutbox', () => {
  describe('取待推行', () => {
    it('只查当前分支、本命名空间、未推送且未回滚的行', async () => {
      const ctx = setup({ changes: [], sync: { lastPushedChangeId: 7 } });

      await flush(ctx);

      expect(rulesOf(ctx.changeQueries[0])).toEqual(
        expect.arrayContaining([
          { field: 'namespace', operator: '=', value: NAMESPACE },
          { field: 'entity', operator: '=', value: 'CachedRecipe' },
          { field: 'branchId', operator: '=', value: BRANCH },
          { field: 'remoteId', operator: '=', value: null },
          { field: 'revertChangeId', operator: '=', value: null },
          { field: 'id', operator: '>', value: 7 }
        ])
      );
    });

    // 水位线为 null 表示「从未推过」，此时加一条 `id > null` 会把整批筛空
    it('从未推送过时不带 id 水位条件', async () => {
      const ctx = setup({ changes: [] });

      await flush(ctx);

      expect(rulesOf(ctx.changeQueries[0]).some(rule => rule.field === 'id')).toBe(false);
    });

    it('无待推行时不碰远端，也不动水位线', async () => {
      const ctx = setup({ changes: [], sync: { lastPushedChangeId: 7 } });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.fetchMetadata).not.toHaveBeenCalled();
      expect(ctx.syncRepo.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ replayed: 0, watermark: null });
    });
  });

  describe('重放净操作', () => {
    it('INSERT 用 change.patch 的整行调远端 create', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '红烧肉', servings: 4 } })]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledWith('CachedRecipe', {
        id: 'r1',
        title: '红烧肉',
        servings: 4
      });
      expect(result.replayed).toBe(1);
    });

    it('UPDATE 只把变更字段调远端 update', async () => {
      const ctx = setup({
        changes: [change({ type: 'UPDATE', entityId: 'r1', patch: { servings: 6 }, inversePatch: { servings: 4 } })],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T09:00:00Z' }]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.update).toHaveBeenCalledWith('CachedRecipe', 'r1', { servings: 6 });
      expect(result.replayed).toBe(1);
    });

    it('DELETE 调远端 delete', async () => {
      const ctx = setup({
        changes: [change({ type: 'DELETE', entityId: 'r1', inversePatch: { id: 'r1', title: '红烧肉' } })],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T09:00:00Z' }]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.delete).toHaveBeenCalledWith('CachedRecipe', ['r1']);
      expect(result.replayed).toBe(1);
    });

    // 同一行离线期间改了三次，远端只该收到一次终态 —— 中间态既没人看见过，
    // 逐条重放还会把「创建 → 改名 → 再改名」三次往返压在恢复连接的那一瞬间
    it('同一行的多次变更压成一次净操作', async () => {
      const ctx = setup({
        changes: [
          change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '初稿', servings: 2 } }),
          change({ type: 'UPDATE', entityId: 'r1', patch: { title: '二稿' }, inversePatch: { title: '初稿' } }),
          change({ type: 'UPDATE', entityId: 'r1', patch: { servings: 6 }, inversePatch: { servings: 2 } })
        ]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(ctx.remoteAdapter.create).toHaveBeenCalledWith('CachedRecipe', {
        id: 'r1',
        title: '二稿',
        servings: 6
      });
      expect(ctx.remoteAdapter.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ originalCount: 3, compacted: 2, replayed: 1 });
    });

    // 本地新建又删掉、远端从没见过 —— 一次请求都不该发，但水位线必须推进，
    // 否则这批行每轮都被重新查出来重新压缩，永远算作「待推」
    it('本地新建后删除整批抵消，只推进水位线', async () => {
      const ctx = setup({
        changes: [
          change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '草稿' } }),
          change({ type: 'DELETE', entityId: 'r1', inversePatch: null })
        ]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).not.toHaveBeenCalled();
      expect(ctx.remoteAdapter.delete).not.toHaveBeenCalled();
      expect(result).toMatchObject({ originalCount: 2, compacted: 2, replayed: 0, watermark: 2 });
      expect(ctx.syncRepo.update).toHaveBeenCalledWith(ctx.syncRow, expect.objectContaining({ lastPushedChangeId: 2 }));
    });

    // 「删掉旧行 + 新建复用同一 id 的行」这种批次，顺序反了会让新建的行当场被删掉
    it('DELETE 相位先于 INSERT/UPDATE 相位', async () => {
      const order: string[] = [];
      const ctx = setup({
        changes: [
          change({ type: 'INSERT', entityId: 'r2', patch: { id: 'r2', title: '新行' } }),
          change({ type: 'DELETE', entityId: 'r1', inversePatch: { id: 'r1', title: '旧行' } })
        ],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T09:00:00Z' }]
      });
      ctx.remoteAdapter.create.mockImplementation((_e: string, data: unknown) => {
        order.push('create');
        return of(data);
      });
      ctx.remoteAdapter.delete.mockImplementation(() => {
        order.push('delete');
        return of(undefined);
      });

      await flush(ctx);

      expect(order).toEqual(['delete', 'create']);
    });
  });

  describe('LWW 冲突判定', () => {
    it('远端更旧 → 保留本地，照常重放', async () => {
      const ctx = setup({
        changes: [
          change({
            type: 'UPDATE',
            entityId: 'r1',
            patch: { servings: 6 },
            createdAt: new Date('2026-03-01T10:00:00Z')
          })
        ],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T09:00:00Z' }]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.update).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ replayed: 1, discarded: 0 });
    });

    it('远端更新 → 丢弃本地改动，并把远端行拉回本地缓存', async () => {
      const ctx = setup({
        changes: [
          change({
            type: 'UPDATE',
            entityId: 'r1',
            patch: { servings: 6 },
            createdAt: new Date('2026-03-01T10:00:00Z')
          })
        ],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T11:00:00Z' }],
        remoteRows: [{ id: 'r1', title: '红烧肉', servings: 2 }]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.update).not.toHaveBeenCalled();
      expect(ctx.remoteAdapter.findByIds).toHaveBeenCalledWith('CachedRecipe', ['r1']);
      expect(ctx.localAdapter.upsertMany).toHaveBeenCalledWith('CachedRecipe', [
        { id: 'r1', title: '红烧肉', servings: 2 }
      ]);
      expect(result).toMatchObject({ replayed: 0, discarded: 1 });
    });

    // 接受远端是「把远端投影抄到本地」，不是一次用户改动。走实体仓储会让触发器
    // 再排一条出站行，下一轮把远端刚赢下的值又覆盖回去 —— 一个自我供给的循环
    it('接受远端时走裸 SQL 出口，不经实体仓储', async () => {
      const ctx = setup({
        changes: [change({ type: 'UPDATE', entityId: 'r1', patch: { servings: 6 } })],
        remoteMetadata: [{ id: 'r1', updatedAt: '2026-03-01T11:00:00Z' }],
        remoteRows: [{ id: 'r1', title: '红烧肉', servings: 2 }]
      });

      await flush(ctx);

      expect(ctx.localAdapter.getRepository).not.toHaveBeenCalledWith(CachedRecipe);
    });

    // 远端已经没有这一行了：LWW 无从比较（`fetchMetadata` 的契约里删除不带时间戳）。
    // 收敛到「都没有」而不是把行重新创建出来 —— 后者会让一次已经生效的删除自己复活
    it('远端行已消失时，本地 UPDATE 判负并清掉本地缓存行', async () => {
      const ctx = setup({
        changes: [change({ type: 'UPDATE', entityId: 'r1', patch: { servings: 6 } })],
        remoteMetadata: []
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.update).not.toHaveBeenCalled();
      expect(ctx.localAdapter.deleteByIds).toHaveBeenCalledWith('CachedRecipe', ['r1']);
      expect(result).toMatchObject({ replayed: 0, discarded: 1 });
    });

    it('远端行已消失时，本地 DELETE 直接算达成，一个请求都不发', async () => {
      const ctx = setup({
        changes: [change({ type: 'DELETE', entityId: 'r1', inversePatch: { id: 'r1' } })],
        remoteMetadata: []
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.delete).not.toHaveBeenCalled();
      expect(result).toMatchObject({ replayed: 0, discarded: 0, noop: 1, watermark: 1 });
    });

    it('远端没有这一行时 INSERT 不算冲突，照常创建', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '新建' } })],
        remoteMetadata: []
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ replayed: 1, discarded: 0 });
    });
  });

  describe('水位线与失败', () => {
    it('整批成功后把水位线推到本批最大 change id', async () => {
      const ctx = setup({
        changes: [
          change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } }),
          change({ type: 'INSERT', entityId: 'r2', patch: { id: 'r2' } })
        ],
        sync: { lastPushedChangeId: null }
      });

      const result = await flush(ctx);

      expect(result.watermark).toBe(2);
      expect(ctx.syncRepo.update).toHaveBeenCalledWith(
        ctx.syncRow,
        expect.objectContaining({ lastPushedChangeId: 2, lastPushedAt: expect.any(Date) })
      );
    });

    // 推进过的行再也查不出来。任何一条没送出去就推水位，等于把它扔了
    it('有失败时不推进水位线', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } })]
      });
      ctx.remoteAdapter.create.mockReturnValueOnce(
        throwError(() => Object.assign(new Error('Unprocessable'), { status: 422 }))
      );

      const result = await flush(ctx);

      expect(ctx.syncRepo.update).not.toHaveBeenCalled();
      expect(result.watermark).toBeNull();
      expect(result.failures).toHaveLength(1);
    });

    it('远端不可达时立刻停手，剩下的动作不再白跑', async () => {
      const ctx = setup({
        changes: [
          change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } }),
          change({ type: 'INSERT', entityId: 'r2', patch: { id: 'r2' } })
        ]
      });
      ctx.remoteAdapter.create.mockReturnValueOnce(throwError(() => new TypeError('Failed to fetch')));

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(ctx.reachability.online).toBe(false);
      expect(result.watermark).toBeNull();
    });

    // 一次成功的重放就是「已恢复」的证据；不上报的话退避会一直排下去
    it('重放成功把可达性翻回在线', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } })]
      });
      ctx.reachability.report(new TypeError('Failed to fetch'));
      expect(ctx.reachability.online).toBe(false);

      await flush(ctx);

      expect(ctx.reachability.online).toBe(true);
    });
  });

  describe('入口守卫', () => {
    it('非 querycache 的仓库直接拒绝', async () => {
      const ctx = setup({ entityType: VersionedRecipe });

      await expect(flushQueryCacheOutbox(ctx.vm, NAMESPACE, 'VersionedRecipe')).rejects.toThrow(/querycache/);
    });

    it('同步开关关掉时什么都不做', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } })],
        sync: { enabled: false }
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ replayed: 0, watermark: null, skipped: expect.stringContaining('disabled') });
    });

    // 恢复连接常常连着来好几个信号（navigator online 事件 + 首次探测成功），
    // 每个都起一轮 flush 会让同一批变更被并发重放两次
    it('同一仓库并发调用只跑一轮', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1' } })]
      });

      const [first, second] = await Promise.all([flush(ctx), flush(ctx)]);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
    });
  });
});
