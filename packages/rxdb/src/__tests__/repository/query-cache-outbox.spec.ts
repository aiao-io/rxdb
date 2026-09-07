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
import { countQueryCacheOutbox, flushQueryCacheOutbox } from '../../repository/query-cache-outbox.js';
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

/**
 * 造一条触发器会写出来的 `rxdb_change` 行。
 *
 * @remarks
 * 用字面量而不是 `new RxDBChange()`：装饰器给实体构造函数装了「必须先有 EntityManager」
 * 的门禁（`entity.decorator.ts` 的 `need init rxdb`），而本文件测的是纯函数，不起库。
 */
const change = (over: Partial<RxDBChange> & Pick<RxDBChange, 'type' | 'entityId'>): RxDBChange =>
  ({
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
  }) as RxDBChange;

interface SetupOptions {
  changes?: RxDBChange[];
  /** `entityManager` 那侧 `count()` 的返回，供 {@link countQueryCacheOutbox} 用 */
  changeCount?: number;
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
      ({
        id: `${NAMESPACE}:CachedRecipe:${BRANCH}`,
        namespace: NAMESPACE,
        entity: 'CachedRecipe',
        branchId: BRANCH,
        syncType: 'querycache',
        lastPushedChangeId: null,
        enabled: true,
        ...options.sync
      } as RxDBSync)
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
    delete: vi.fn(() => of(undefined)),
    // QueryCache 的远端契约就是上面这五个 REST 动词。**仓储**是它明确不实现的东西 ——
    // `RxDBAdapterHttp.getRepository()` 无条件抛 `HttpUnsupportedOperationError`。
    // 假件照抄这个拒绝，出站重放才不可能偷偷绕回版本管理器那条管道。
    getRepository: vi.fn(() => {
      throw new Error('HTTP adapter does not support "getRepository": v1 supports SyncType.QueryCache only');
    })
  };

  const reachability = detachedReachability();

  // 计数走 `entityManager` 那条入口（与 `updatePushableCount` 同源），不是上面的
  // `localAdapter.getRepository` —— 两条入口的返回类型不同，探针也得分开。
  const countQueries: unknown[] = [];
  const countChanges = vi.fn((query: unknown) => {
    countQueries.push(query);
    return of(options.changeCount ?? 0);
  });

  const vm = {
    rxdb: {
      config: { entities: [options.entityType ?? CachedRecipe], sync: undefined },
      entityManager: {
        instantiate: () => ({ enabled: true }) as RxDBSync,
        getRepository: vi.fn(() => ({ count: countChanges }))
      },
      reachability,
      // 取远端适配器的正路：直接给实例，不附带任何仓储。
      remoteAdapter$: of(remoteAdapter)
    },
    getCurrentBranch: vi.fn(async () => ({ id: BRANCH })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    // 照抄 `VersionManager.getRemoteRepositories` 的**急切**形状：它一进门就建
    // changelog 的两个仓储，QueryCache 的远端一个都拿不出来，所以假件也必须在这里炸。
    // 先前的假件把 adapter 直接递出来，把「重放绕道版本管理器」这条 bug 整个藏住了 ——
    // 单测全绿，而 HTTP demo 里每一轮回推都死在第一行。
    getRemoteRepositories: vi.fn(async () => ({
      branchRepository: remoteAdapter.getRepository(),
      changeRepository: remoteAdapter.getRepository(),
      adapter: remoteAdapter
    }))
  } as unknown as VersionManager;

  return {
    vm,
    changeRepo,
    changeQueries,
    countChanges,
    countQueries,
    syncRepo,
    syncRow,
    localAdapter,
    remoteAdapter,
    reachability
  };
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

  describe('取远端适配器', () => {
    // QueryCache 的远端只有 REST 五件套。`getRemoteRepositories()` 除了给适配器，还会
    // 顺手建一对 changelog 仓储 —— HTTP 适配器对此直接抛，于是整轮回推在发出第一个
    // 请求之前就死了：面板上只留一句「不支持 getRepository」，用户离线时写的东西
    // 永远推不上去，而它跟出站重放要做的事没有半点关系。
    it('不经 changelog 仓储那条入口', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '红烧肉' } })]
      });

      const result = await flush(ctx);

      expect(ctx.vm.getRemoteRepositories).not.toHaveBeenCalled();
      expect(ctx.remoteAdapter.getRepository).not.toHaveBeenCalled();
      expect(result.replayed).toBe(1);
    });
  });

  describe('重放净操作', () => {
    /**
     * 注意这条用例的 `patch` 里**没有** `id` —— 触发器产出的就是这个形状。
     *
     * `trigger_sql.ts` 建 INSERT 触发器时明写 `if (jsName === 'id') continue`：行的身份
     * 记在变更行自己的 `entityId` 列上，不重复进 patch。所以直接把 patch 当请求体发出去，
     * 远端收到的是一条**没有身份的新行**，只能自己造一个 id —— 本地那份从此对不上远端，
     * 成了一条远端从不认识的孤儿行，下一轮元数据拉取就把它当孤儿清掉。用户离线时写的
     * 东西看着推上去了（水位线照常推进），其实丢了。
     */
    it('INSERT 把 entityId 补进请求体再调远端 create', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { title: '红烧肉', servings: 4 } })]
      });

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledWith('CachedRecipe', {
        id: 'r1',
        title: '红烧肉',
        servings: 4
      });
      expect(result.replayed).toBe(1);
    });

    // patch 里真带了 `id` 也只可能是同一个值（都来自那条变更行），补齐不改变结果。
    it('patch 已带 id 时不改写它', async () => {
      const ctx = setup({
        changes: [change({ type: 'INSERT', entityId: 'r1', patch: { id: 'r1', title: '红烧肉' } })]
      });

      await flush(ctx);

      expect(ctx.remoteAdapter.create).toHaveBeenCalledWith('CachedRecipe', { id: 'r1', title: '红烧肉' });
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
        sync: {},
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

    // 水位线整批不动的话，下一轮会把**已经推上去**的行重新判定一次 —— 那时远端的
    // `updatedAt` 是我们自己刚写进去的时刻，比本地变更还新，LWW 一比就判本地输：
    // 一次成功的推送被报成冲突，本地缓存还要被「修复」回远端行。
    it('失败轮次把水位线推到最早一条未结算变更之前', async () => {
      const changes = [
        change({ type: 'UPDATE', entityId: 'r1', patch: { title: 'a' } }),
        change({ type: 'UPDATE', entityId: 'r2', patch: { title: 'b' } })
      ];
      const ctx = setup({
        changes,
        sync: { lastPushedChangeId: null },
        remoteMetadata: [
          { id: 'r1', updatedAt: '2026-03-01T09:00:00Z' },
          { id: 'r2', updatedAt: '2026-03-01T09:00:00Z' }
        ]
      });
      // 假件按水位线过滤，第二轮才是真实的「重新取待推行」
      ctx.changeRepo.find.mockImplementation(async (query: unknown) => {
        const rule = rulesOf(query).find(item => item.field === 'id' && item.operator === '>');
        const floor = typeof rule?.value === 'number' ? rule.value : 0;
        return changes.filter(row => row.id > floor);
      });
      ctx.remoteAdapter.update.mockImplementationOnce((_e: string, id: string, patch: Record<string, unknown>) =>
        of({ id, ...patch })
      );
      ctx.remoteAdapter.update.mockImplementationOnce(() =>
        throwError(() => Object.assign(new Error('Unprocessable'), { status: 422 }))
      );

      const first = await flush(ctx);

      expect(first.replayed).toBe(1);
      expect(first.failures).toHaveLength(1);
      // r1（id=1）结算了，r2（id=2）没有 —— 水位线只能推到 1
      expect(first.watermark).toBe(1);
      // 本轮没推完，`lastPushedAt` 是展示字段，不该记成一次完整的推送
      expect(ctx.syncRepo.update).toHaveBeenCalledWith(
        ctx.syncRow,
        expect.not.objectContaining({ lastPushedAt: expect.anything() })
      );

      // 第二轮：r1 已在远端，服务端写入时刻比本地变更新
      ctx.remoteAdapter.fetchMetadata.mockReturnValue(
        of([
          { id: 'r1', updatedAt: '2026-03-01T11:00:00Z' },
          { id: 'r2', updatedAt: '2026-03-01T09:00:00Z' }
        ])
      );
      ctx.remoteAdapter.update.mockImplementation((_e: string, id: string, patch: Record<string, unknown>) =>
        of({ id, ...patch })
      );

      const second = await flush(ctx);

      // 关键断言：r1 一个字都不该再出现。整批不推水位线时它会是 conflicts: ['r1']
      expect(second.conflicts).toEqual([]);
      expect(second.originalCount).toBe(1);
      expect(second.replayed).toBe(1);
      expect(second.watermark).toBe(2);
    });

    // 一条都没结算时水位线原地不动：推过去就等于把没送出去的写扔掉
    it('第一条就失败时水位线一步都不挪', async () => {
      const ctx = setup({
        changes: [
          change({ type: 'UPDATE', entityId: 'r1', patch: { title: 'a' } }),
          change({ type: 'UPDATE', entityId: 'r2', patch: { title: 'b' } })
        ],
        sync: { lastPushedChangeId: null },
        remoteMetadata: [
          { id: 'r1', updatedAt: '2026-03-01T09:00:00Z' },
          { id: 'r2', updatedAt: '2026-03-01T09:00:00Z' }
        ]
      });
      ctx.remoteAdapter.update.mockReturnValueOnce(
        throwError(() => Object.assign(new Error('Unprocessable'), { status: 422 }))
      );

      const result = await flush(ctx);

      expect(result.watermark).toBeNull();
      expect(ctx.syncRepo.update).not.toHaveBeenCalled();
    });

    // 离线攒下的待推行没有上限。一次几千个 id 塞进 `id in (...)` 会把请求撑到网关 413
    // 或 URL 长度上限之外 —— 适配器侧 `fetchMetadata` 分的是**响应**的页，请求里那串 id
    // 原样透传，切分只能由调用方来做。
    it('元数据探测按 100 个 id 一块切开，串行发', async () => {
      const changes = Array.from({ length: 250 }, (_, index) =>
        change({ type: 'UPDATE', entityId: `r${index}`, patch: { title: 't' } })
      );
      const ctx = setup({ changes, sync: { lastPushedChangeId: null } });

      await flush(ctx);

      expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(3);
      // 假件的 `fetchMetadata` 没声明形参，实参类型得自己还原
      const sizes = ctx.remoteAdapter.fetchMetadata.mock.calls.map(call => {
        const [, query] = call as unknown as [string, { rules: [{ value: string[] }] }];
        return query.rules[0].value.length;
      });
      expect(sizes).toEqual([100, 100, 50]);
    });

    // 半张元数据表比没有更危险：缺席的 id 会被判成「远端没有这一行」，
    // UPDATE 于是降级成 INSERT，DELETE 直接丢弃
    it('某一块探测失败即整轮跳过，后面几块不再打', async () => {
      const changes = Array.from({ length: 250 }, (_, index) =>
        change({ type: 'UPDATE', entityId: `r${index}`, patch: { title: 't' } })
      );
      const ctx = setup({ changes, sync: { lastPushedChangeId: null } });
      ctx.remoteAdapter.fetchMetadata.mockReturnValueOnce(of([]));
      ctx.remoteAdapter.fetchMetadata.mockReturnValueOnce(throwError(() => new TypeError('Failed to fetch')));

      const result = await flush(ctx);

      expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
      expect(ctx.remoteAdapter.update).not.toHaveBeenCalled();
      expect(ctx.remoteAdapter.create).not.toHaveBeenCalled();
      expect(result.failures).toHaveLength(1);
      expect(ctx.reachability.online).toBe(false);
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

describe('countQueryCacheOutbox', () => {
  /** 计数查询的顶层 and 规则（含末尾那个仓库 OR 组），不复用只认字段规则的 `rulesOf` */
  const countRulesOf = (query: unknown): unknown[] => (query as { where: { rules: unknown[] } }).where.rules;

  it('返回 QueryCache 仓库当前分支上的待推行数', async () => {
    const ctx = setup({ changeCount: 3, sync: {} });

    await expect(countQueryCacheOutbox(ctx.vm)).resolves.toBe(3);
  });

  // 这一条盯的是 `SyncStateHub` 相加的前提：口径取的是 `push` 的补集，
  // 走版本管理器推送的仓库不能在这里再被数一遍
  it('没有 offlineWrite 且不可 push 的仓库时返回 0，且一次都不查', async () => {
    const ctx = setup({ changeCount: 9, entityType: VersionedRecipe });

    await expect(countQueryCacheOutbox(ctx.vm)).resolves.toBe(0);
    expect(ctx.countChanges).not.toHaveBeenCalled();
  });

  it('查询条件与 flush 取行口径一致：同分支、未回滚、未推送、水位线之后', async () => {
    const ctx = setup({ sync: { lastPushedChangeId: 7 } });

    await countQueryCacheOutbox(ctx.vm);

    expect(countRulesOf(ctx.countQueries[0])).toEqual([
      { field: 'branchId', operator: '=', value: BRANCH },
      { field: 'revertChangeId', operator: '=', value: null },
      { field: 'remoteId', operator: '=', value: null },
      {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'namespace', operator: '=', value: NAMESPACE },
              { field: 'entity', operator: '=', value: 'CachedRecipe' },
              { field: 'id', operator: '>', value: 7 }
            ]
          }
        ]
      }
    ]);
  });

  it('同步开关关掉的仓库不计入积压', async () => {
    const ctx = setup({ changeCount: 4, sync: { enabled: false } });

    await expect(countQueryCacheOutbox(ctx.vm)).resolves.toBe(0);
    expect(ctx.countChanges).not.toHaveBeenCalled();
  });
});
