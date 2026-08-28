/**
 * US-020 阶段 A —— QueryCache 接入统一 Repository。
 *
 * 这些用例全部经**统一 `Repository`** 断言，而不是直接 `new QueryCacheRepository`：
 * 病灶 1 的核心正是「类是好的，生产路径打不到它」，只测类本身无法证伪。
 */
import { BehaviorSubject, delay, firstValueFrom, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { SyncStats } from '../../repository/QueryCacheRepository.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { Repository } from '../../repository/Repository.js';
import { deterministicStringify } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA, STATUS } from '../../rxdb.private.js';
import { RxDBQueryCacheCapabilityError } from '../../RxDBError.js';
import { detachedReachability } from '../fixtures/reachability.js';

class CachedEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id!: string;
  updatedAt!: string;
  value?: number;
}

type CachedEntityCtor = typeof CachedEntity;

Object.assign(CachedEntity, {
  [METADATA]: {
    name: 'CachedEntity',
    namespace: 'public',
    repository: 'Repository',
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }
  }
});

/** 同一实体形状，配置级开启 SWR：用于 AC#24 的「调用 &gt; 配置 &gt; false」三档 */
class CachedSwrEntity extends CachedEntity {}

Object.assign(CachedSwrEntity, {
  [METADATA]: {
    name: 'CachedSwrEntity',
    namespace: 'public',
    repository: 'Repository',
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local', localCacheFirst: true },
      remote: { adapter: 'remote' }
    }
  }
});

/** AC#23 D13：显式关掉同步记忆，证明 `syncStaleTime` 真的可配置到 0（每次读都重新校验） */
class CachedNoMemoEntity extends CachedEntity {}

Object.assign(CachedNoMemoEntity, {
  [METADATA]: {
    name: 'CachedNoMemoEntity',
    namespace: 'public',
    repository: 'Repository',
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local', syncStaleTime: 0 },
      remote: { adapter: 'remote' }
    }
  }
});

/** AC#23 D13：把记忆窗口压到 1ms，用来证明它会过期而不是常驻 */
class CachedShortMemoEntity extends CachedEntity {}

Object.assign(CachedShortMemoEntity, {
  [METADATA]: {
    name: 'CachedShortMemoEntity',
    namespace: 'public',
    repository: 'Repository',
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local', syncStaleTime: 1 },
      remote: { adapter: 'remote' }
    }
  }
});

/** 对照组：同一形状配 Full 同步，用来证明 QueryCache 分支没有渗进版本化路径 */
class VersionedEntity extends CachedEntity {}

Object.assign(VersionedEntity, {
  [METADATA]: {
    name: 'VersionedEntity',
    namespace: 'public',
    repository: 'Repository',
    sync: {
      type: SyncType.Full,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }
  }
});

/** 直通 QueryManager：只暴露 runner 的结果，同时留下任务 key 供指纹断言 */
class StubQueryManager {
  lastOptions: QueryOptions<CachedEntityCtor> | undefined;

  createTask<RT>(taskOptions: { options: QueryOptions<CachedEntityCtor>; runner: () => Observable<RT> }) {
    this.lastOptions = taskOptions.options;
    return { result$: taskOptions.runner() } as { result$: Observable<RT> };
  }
}

const row = (id: string, updatedAt: string, value = 0): CachedEntity => {
  const entity = new CachedEntity();
  entity.id = id;
  entity.updatedAt = updatedAt;
  entity.value = value;
  Object.assign(entity, { [STATUS]: { local: false } });
  return entity;
};

const where = (): RuleGroup<CachedEntity> => ({ combinator: 'and', rules: [] });

/**
 * 本地行仓储（`RxDBAdapterBase.getRepository()` 的返回物）。
 *
 * @remarks
 * US-020 D8 之后它同时承担两个角色：同步流程里读 `where` 的本地投影（算新鲜度与孤儿），
 * 以及同步跑完后门面读最终结果。因此 QueryCache 的一次 `find` 会打到它两次，
 * SWR 再多一次缓存首发 —— 用调用次数区分模式很脆，用例改用「交付时远端是否已回来」判定。
 */
const createLocalRepo = (rows: CachedEntity[]) => ({
  find: vi.fn(async () => rows),
  count: vi.fn(async () => rows.length),
  create: vi.fn(async (entity: CachedEntity) => entity),
  update: vi.fn(async (entity: CachedEntity) => entity),
  remove: vi.fn(async (entity: CachedEntity) => entity)
});

const createLocalAdapter = (localRepo: ReturnType<typeof createLocalRepo>) => ({
  name: 'local',
  getRepository: vi.fn(() => localRepo),
  // QueryCacheLocalAdapter 的三个必需 duck（均为 RxDBAdapterLocalBase 的 abstract）
  getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
  upsertMany: vi.fn(() => of(undefined)),
  deleteByIds: vi.fn(() => of(undefined))
});

const createRemoteAdapter = (delayMs = 0) => ({
  name: 'remote',
  getRepository: vi.fn(),
  fetchMetadata: vi.fn(() => of([{ id: 'a', updatedAt: '2024-01-02T00:00:00Z' }]).pipe(delay(delayMs))),
  findByIds: vi.fn(() => of([row('a', '2024-01-02T00:00:00Z', 1)])),
  create: vi.fn((_entityName: string, data: CachedEntity) => of(data)),
  update: vi.fn((_entityName: string, id: string, patch: Partial<CachedEntity>) =>
    of(row(id, '2024-01-03T00:00:00Z', patch.value ?? 0))
  ),
  delete: vi.fn(() => of(undefined))
});

const setup = (
  overrides: {
    localRows?: CachedEntity[];
    localAdapter?: unknown;
    remoteAdapter?: unknown;
    /** 让远端元数据晚于本地缓存到达，SWR 与标准模式才有可观测差异 */
    remoteDelayMs?: number;
    EntityType?: CachedEntityCtor;
  } = {}
) => {
  // 默认本地比远端旧一档：同步必须真的回源一次，AC#1 的 pull 断言才有意义
  const localRepo = createLocalRepo(overrides.localRows ?? [row('a', '2024-01-01T00:00:00Z', 1)]);
  // 覆盖项按「完整 stub」类型对待：唯一的例外是 AC#7 那个故意缺 duck 的对象，
  // 而那条用例只断言抛错，不读适配器上的任何成员
  const localAdapter =
    (overrides.localAdapter as ReturnType<typeof createLocalAdapter> | undefined) ?? createLocalAdapter(localRepo);
  const remoteAdapter =
    (overrides.remoteAdapter as ReturnType<typeof createRemoteAdapter> | undefined) ??
    createRemoteAdapter(overrides.remoteDelayMs);
  const localAdapter$ = new BehaviorSubject(localAdapter);
  const remoteAdapter$ = new BehaviorSubject(remoteAdapter);

  const rxdb = {
    localAdapter$,
    remoteAdapter$,
    config: { sync: undefined },
    addEventListener: vi.fn(),
    reachability: detachedReachability(),
    entityManager: { createEntityRef: vi.fn((_type: unknown, entity: CachedEntity) => entity) }
  } as unknown as RxDB;

  const repository = new Repository<CachedEntityCtor>(rxdb, overrides.EntityType ?? CachedEntity);
  const queryManager = new StubQueryManager();
  Object.assign(repository, { queryManager });

  return { repository, queryManager, localRepo, localAdapter, remoteAdapter, localAdapter$, remoteAdapter$ };
};

describe('US-020 阶段 A：QueryCache 接入统一 Repository', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  // AC#1：读走 metadata-diff / 增量 pull，而不是统一 Repository 的本地 find
  it('AC#1 find 触发远端 metadata 同步，而不是直接读本地', async () => {
    await firstValueFrom(ctx.repository.find({ where: where() }));

    expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);
    expect(ctx.remoteAdapter.findByIds).toHaveBeenCalledWith('CachedEntity', ['a']);
    expect(ctx.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  // AC#1 + D8：本地这一侧的新鲜度也从行仓储读，不再走 getMetadataByIds duck。
  // 只按远端 id 问本地，永远问不出「本地有、远端没有」的孤儿（AC#11）。
  it('AC#1 本地投影经 IRepository 下推 where，不经 getMetadataByIds', async () => {
    await firstValueFrom(ctx.repository.find({ where: where() }));

    expect(ctx.localAdapter.getMetadataByIds).not.toHaveBeenCalled();
    expect(ctx.localRepo.find).toHaveBeenCalledWith({ where: where() });
  });

  // AC#1 + D8 回归护栏：本地出口换成 IRepository 之后，读回来的是**实体实例**，
  // `updatedAt` 在真实实体上是 `Date`（sqlite 里 PropertyType.date 存 TEXT、读成 Date）。
  // 新鲜度比较按 ISO 字典序做，`'2024-01-02T…' > Date` 会先把两边按 number 提示取原始值 ——
  // 字符串那侧成 NaN，比较恒为 false，于是所有行都判 fresh、远端更新永远拉不下来。
  // 这个塌陷是静默的（查询照常返回，内容停在第一次同步那一刻），必须在核心层钉死。
  it('AC#1 本地 updatedAt 为 Date 时仍能判出 stale', async () => {
    const local = row('a', '2024-01-01T00:00:00Z', 1);
    Object.assign(local, { updatedAt: new Date('2024-01-01T00:00:00Z') });
    const dateCtx = setup({ localRows: [local as CachedEntity] });

    await firstValueFrom(dateCtx.repository.find({ where: where() }));

    expect(dateCtx.remoteAdapter.findByIds).toHaveBeenCalledWith('CachedEntity', ['a']);
  });

  // 反向：Date 比远端新时不该回源，证明上一条不是「无脑全拉」蒙对的
  it('AC#1 本地 updatedAt 为 Date 且更新时不回源', async () => {
    const local = row('a', '2024-01-03T00:00:00Z', 1);
    Object.assign(local, { updatedAt: new Date('2024-01-03T00:00:00Z') });
    const dateCtx = setup({ localRows: [local as CachedEntity] });

    await firstValueFrom(dateCtx.repository.find({ where: where() }));

    expect(dateCtx.remoteAdapter.findByIds).not.toHaveBeenCalled();
  });

  // AC#21 + D8：最终读出口是本地 IRepository，返回实体实例而不是裸数据
  it('AC#21 结果来自本地 IRepository，是实体实例', async () => {
    const result = await firstValueFrom(ctx.repository.find({ where: where() }));

    // 最后一次读带着调用方的完整 options —— 那次才是交付给调用方的结果
    expect(ctx.localRepo.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: where() }));
    expect(result[0]).toBeInstanceOf(CachedEntity);
  });

  // AC#23：limit / offset / orderBy 原样下推给本地 IRepository，不是内存切片、也不 fail-fast
  it('AC#23 分页与排序下推本地 IRepository', async () => {
    await firstValueFrom(ctx.repository.find({ where: where(), limit: 10, offset: 20 }));

    expect(ctx.localRepo.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });

  // AC#23：count 取远端 metadata 基数，不拉行
  it('AC#23 count 走远端 fetchMetadata 基数，不调用 findByIds', async () => {
    const count = await firstValueFrom(ctx.repository.count({ where: where() }));

    expect(count).toBe(1);
    expect(ctx.remoteAdapter.findByIds).not.toHaveBeenCalled();
  });

  // AC#23：D9 矩阵的 8 个入口逐个走通，无一 fail-fast —— 读侧五个入口最终都收敛到 primary.find
  it('AC#23 D9 矩阵的 8 个入口全部可用', async () => {
    const orderBy = [{ field: 'id' as const, sort: 'asc' as const }];

    await expect(firstValueFrom(ctx.repository.get('a'))).resolves.toBeInstanceOf(CachedEntity);
    await expect(firstValueFrom(ctx.repository.findOne({ where: where() }))).resolves.toBeInstanceOf(CachedEntity);
    await expect(firstValueFrom(ctx.repository.findOneOrFail({ where: where() }))).resolves.toBeInstanceOf(
      CachedEntity
    );
    await expect(firstValueFrom(ctx.repository.find({ where: where() }))).resolves.toHaveLength(1);
    await expect(firstValueFrom(ctx.repository.findAll({ where: where() }))).resolves.toHaveLength(1);
    await expect(firstValueFrom(ctx.repository.findByCursor({ where: where(), orderBy }))).resolves.toHaveLength(1);
    await expect(firstValueFrom(ctx.repository.count({ where: where() }))).resolves.toBe(1);
    await expect(ctx.repository.create(row('b', '2024-01-04T00:00:00Z'))).resolves.toBeDefined();
  });

  // AC#2：写入远程优先，且返回 Promise 而不是 Observable
  it('AC#2 create 先远程后本地，返回 Promise', async () => {
    const created = ctx.repository.create(row('b', '2024-01-04T00:00:00Z'));

    expect(created).toBeInstanceOf(Promise);
    await created;
    expect(ctx.remoteAdapter.create).toHaveBeenCalledTimes(1);
    expect(ctx.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  // AC#2：远程失败则本地不写
  it('AC#2 远程写失败时本地不落缓存', async () => {
    ctx.remoteAdapter.create.mockReturnValueOnce(
      new Observable(subscriber => subscriber.error(new Error('remote down')))
    );

    await expect(ctx.repository.create(row('b', '2024-01-04T00:00:00Z'))).rejects.toThrow('remote down');
    expect(ctx.localAdapter.upsertMany).not.toHaveBeenCalled();
  });

  // AC#2：update / remove 同样是 remote-then-local
  it('AC#2 update 与 remove 走 remote-then-local', async () => {
    await ctx.repository.update(row('a', '2024-01-02T00:00:00Z'), { value: 9 });
    expect(ctx.remoteAdapter.update).toHaveBeenCalledTimes(1);

    await ctx.repository.remove(row('a', '2024-01-02T00:00:00Z'));
    expect(ctx.remoteAdapter.delete).toHaveBeenCalledTimes(1);
    expect(ctx.localAdapter.deleteByIds).toHaveBeenCalledWith('CachedEntity', ['a']);
  });

  // AC#4：QueryCache 的写不得经由本地行仓储（那条路径会进 changelog）
  it('AC#4 写不落本地 changelog（不经本地 IRepository.create）', async () => {
    await ctx.repository.create(row('b', '2024-01-04T00:00:00Z'));

    expect(ctx.localRepo.create).not.toHaveBeenCalled();
  });

  // AC#22 + D10：适配器不得在构造期固化，重连后必须打到新实例
  it('AC#22 重连后打到新适配器实例', async () => {
    await firstValueFrom(ctx.repository.find({ where: where() }));

    const nextRemote = createRemoteAdapter();
    ctx.remoteAdapter$.next(nextRemote);
    await firstValueFrom(ctx.repository.find({ where: where() }));

    expect(nextRemote.fetchMetadata).toHaveBeenCalledTimes(1);
    expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);
  });

  // AC#24：不传 localCacheFirst 时用配置值 —— 配置开了就得真的走 SWR
  //
  // 判定口径：本地读与远端校验都经同一个 `localRepo.find`，靠调用次数区分模式既脆又有竞态。
  // 改看**交付时远端有没有回来**：远端延后 20ms，SWR 会在那之前就把缓存交出去。
  it('AC#24 配置 localCacheFirst: true 时 find 走 SWR', async () => {
    const swr = setup({ EntityType: CachedSwrEntity, remoteDelayMs: 20 });

    await firstValueFrom(swr.repository.find({ where: where() }));

    // 远端还没回来，结果已经交付 → 走的是缓存首发
    expect(swr.localAdapter.upsertMany).not.toHaveBeenCalled();
    // 缓存先发射不得把后台校验一起取消：否则「一旦有缓存就再也不同步」
    await vi.waitFor(() => expect(swr.localAdapter.upsertMany).toHaveBeenCalledTimes(1));
  });

  // AC#24：调用级显式值压过配置值
  it('AC#24 调用级 localCacheFirst: false 覆盖配置的 true', async () => {
    const swr = setup({ EntityType: CachedSwrEntity, remoteDelayMs: 20 });

    await firstValueFrom(swr.repository.find({ where: where(), localCacheFirst: false }));

    // 标准模式：等远端校验落盘后才交付
    expect(swr.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  // AC#24：配置缺省是 false，调用级可以单独开
  it('AC#24 调用级 localCacheFirst: true 覆盖缺省的 false', async () => {
    const plain = setup({ remoteDelayMs: 20 });

    await firstValueFrom(plain.repository.find({ where: where() }));
    expect(plain.localAdapter.upsertMany).toHaveBeenCalledTimes(1);

    await firstValueFrom(plain.repository.find({ where: where(), localCacheFirst: true }));
    expect(plain.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(plain.localAdapter.upsertMany).toHaveBeenCalledTimes(2));
  });

  // AC#16 经统一 Repository 复验（US-214 发现）：`QueryCacheRepository` 早就实现了
  // offlineFallback，但 `QueryCachePrimaryRepository.find` 只透传 where / localCacheFirst /
  // onSyncStats，这个字段在生产路径上被丢掉。症状与病灶 1 同型 ——「类是好的，
  // 生产路径打不到它」，所以断言必须经门面发起。
  it('AC#16 offlineFallback 经统一 Repository 透传，网络错误时交付本地缓存', async () => {
    const offline = setup();
    // 用 `throwError` 而不是同步 `throw`：真实适配器返回的是会 error 的 Observable，
    // 同步抛会在 `forkJoin` 构造时就逃逸，测的就不是降级路径了。
    offline.remoteAdapter.fetchMetadata.mockReturnValue(throwError(() => new TypeError('Failed to fetch')));

    const rows = await firstValueFrom(offline.repository.find({ where: where(), offlineFallback: true }));

    expect(rows).toHaveLength(1);
  });

  // 反向：不开开关时网络错误照常上抛，证明上一条不是「无脑吞异常」蒙对的
  it('AC#16 未开 offlineFallback 时网络错误上抛', async () => {
    const offline = setup();
    // 用 `throwError` 而不是同步 `throw`：真实适配器返回的是会 error 的 Observable，
    // 同步抛会在 `forkJoin` 构造时就逃逸，测的就不是降级路径了。
    offline.remoteAdapter.fetchMetadata.mockReturnValue(throwError(() => new TypeError('Failed to fetch')));

    await expect(firstValueFrom(offline.repository.find({ where: where() }))).rejects.toThrow('Failed to fetch');
  });

  // AC#13：两种模式各自成任务，互不复用缓存 —— 否则先跑的那次会把降级语义带给后跑的
  it('AC#13 offlineFallback 进任务指纹', async () => {
    await firstValueFrom(ctx.repository.find({ where: where(), offlineFallback: true }));

    expect(deterministicStringify(ctx.queryManager.lastOptions)).toContain('"offlineFallback":true');
  });

  // AC#24 + AC#13：模式进任务指纹；onSyncStats 是函数，进不了指纹也不该进
  it('AC#24 localCacheFirst 进任务指纹，onSyncStats 不进', async () => {
    await firstValueFrom(ctx.repository.find({ where: where(), localCacheFirst: true, onSyncStats: () => undefined }));

    const key = deterministicStringify(ctx.queryManager.lastOptions);
    expect(key).toContain('"localCacheFirst":true');
    expect(key).not.toContain('onSyncStats');
  });

  // AC#25：同步范围是整个 where，不受 limit 影响 —— 拉取放大必须可观测
  it('AC#25 onSyncStats.remoteCount 报 where 命中数而非 limit', async () => {
    const metadata = Array.from({ length: 25 }, (_, index) => ({
      id: `id-${index}`,
      updatedAt: '2024-01-02T00:00:00Z'
    }));
    const remoteAdapter = createRemoteAdapter();
    remoteAdapter.fetchMetadata.mockReturnValue(of(metadata));
    const amplified = setup({ remoteAdapter });
    const stats: SyncStats[] = [];

    await firstValueFrom(
      amplified.repository.find({ where: where(), limit: 10, onSyncStats: value => stats.push(value) })
    );

    expect(stats).toHaveLength(1);
    expect(stats[0].remoteCount).toBe(25);
  });

  // AC#3：Full 实体一步都不许踏进 QueryCache 分支 —— 读仍是本地 find，写仍落本地（进 changelog）
  it('AC#3 SyncType.Full 的读写不经 QueryCache 路径', async () => {
    const full = setup({ EntityType: VersionedEntity });

    await firstValueFrom(full.repository.find({ where: where(), limit: 10, offset: 20 }));
    expect(full.localRepo.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
    expect(full.remoteAdapter.fetchMetadata).not.toHaveBeenCalled();
    expect(full.localAdapter.getMetadataByIds).not.toHaveBeenCalled();

    await full.repository.create(row('b', '2024-01-04T00:00:00Z'));
    // 写落本地行仓储（版本化路径靠它进 changelog），而不是 remote-then-local
    expect(full.localRepo.create).toHaveBeenCalledTimes(1);
    expect(full.remoteAdapter.create).not.toHaveBeenCalled();
    expect(full.localAdapter.upsertMany).not.toHaveBeenCalled();
  });

  // AC#3：QueryCache 新增的两个 FindOptions 字段对其余策略是惰性的，不得改变行为
  it('AC#3 Full 实体忽略 localCacheFirst / onSyncStats', async () => {
    const full = setup({ EntityType: VersionedEntity });
    const stats: SyncStats[] = [];

    await firstValueFrom(
      full.repository.find({ where: where(), localCacheFirst: true, onSyncStats: value => stats.push(value) })
    );

    expect(stats).toHaveLength(0);
    // Full 只读一次本地（QueryCache 才会为同步多读一次投影）
    expect(full.localRepo.find).toHaveBeenCalledTimes(1);
  });

  // AC#23 + D13：同步粒度是 `where`，翻页只换 limit / offset —— 第二页不该再问一次远端。
  //
  // 记忆的键就是 AC#13 那把尺（`where` + `localCacheFirst` + `offlineFallback`），
  // 因此 `limit` / `offset` / `orderBy` 变了照样命中。
  it('AC#23 同一 where 翻第二页只发生一次远端同步', async () => {
    await firstValueFrom(ctx.repository.find({ where: where(), limit: 10, offset: 0 }));
    await firstValueFrom(ctx.repository.find({ where: where(), limit: 10, offset: 10 }));

    expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);
    // 第二页仍然是一次真实的本地读，只是不再重新同步
    expect(ctx.localRepo.find).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 10 }));
  });

  // AC#23 + D13：记忆按 `where` 分桶 —— 换查询范围就是另一次同步，不能借上一次的新鲜度
  it('AC#23 换 where 不复用同步记忆', async () => {
    await firstValueFrom(ctx.repository.find({ where: where() }));
    await firstValueFrom(
      ctx.repository.find({ where: { combinator: 'and', rules: [{ field: 'value', operator: '=', value: 1 }] } })
    );

    expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
  });

  // AC#23 + D13：写之后本地投影已经不是刚才同步出来的那份，记忆必须作废
  it('AC#23 写入使同步记忆失效', async () => {
    await firstValueFrom(ctx.repository.find({ where: where() }));
    await ctx.repository.create(row('b', '2024-01-04T00:00:00Z'));
    await firstValueFrom(ctx.repository.find({ where: where() }));

    expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
  });

  // AC#23 + D13：`syncStaleTime: 0` 关掉记忆，回到「每次读都向远端校验」
  it('AC#23 syncStaleTime: 0 时每次 find 都重新校验', async () => {
    const noMemo = setup({ EntityType: CachedNoMemoEntity });

    await firstValueFrom(noMemo.repository.find({ where: where(), offset: 0 }));
    await firstValueFrom(noMemo.repository.find({ where: where(), offset: 10 }));

    expect(noMemo.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
  });

  // AC#23 + D13：记忆是有界的 —— 窗口过了就重新校验，不是「同步过一次就永远新鲜」
  it('AC#23 记忆窗口过期后重新校验', async () => {
    const shortMemo = setup({ EntityType: CachedShortMemoEntity });

    await firstValueFrom(shortMemo.repository.find({ where: where() }));
    await new Promise(resolve => setTimeout(resolve, 10));
    await firstValueFrom(shortMemo.repository.find({ where: where() }));

    expect(shortMemo.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
  });

  // AC#7：不继承 base 的自定义适配器缺 duck 时 fail-fast，不降级成空数组
  it('AC#7 缺必需 duck 时抛 RxDBQueryCacheCapabilityError 并列出缺失项', async () => {
    const localRepo = createLocalRepo([]);
    const crippled = { name: 'local', getRepository: vi.fn(() => localRepo), upsertMany: vi.fn(() => of(undefined)) };
    const broken = setup({ localAdapter: crippled });

    await expect(firstValueFrom(broken.repository.find({ where: where() }))).rejects.toThrow(
      RxDBQueryCacheCapabilityError
    );
    await expect(firstValueFrom(broken.repository.find({ where: where() }))).rejects.toThrow(
      /getMetadataByIds.*deleteByIds|deleteByIds.*getMetadataByIds/
    );
  });
});
