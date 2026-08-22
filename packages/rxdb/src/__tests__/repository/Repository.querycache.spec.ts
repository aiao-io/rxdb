/**
 * US-020 阶段 A —— QueryCache 接入统一 Repository。
 *
 * 这些用例全部经**统一 `Repository`** 断言，而不是直接 `new QueryCacheRepository`：
 * 病灶 1 的核心正是「类是好的，生产路径打不到它」，只测类本身无法证伪。
 */
import { BehaviorSubject, delay, firstValueFrom, Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import type { SyncStats } from '../../repository/QueryCacheRepository.js';
import { Repository } from '../../repository/Repository.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { METADATA, STATUS } from '../../rxdb.private.js';
import { deterministicStringify } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBQueryCacheCapabilityError } from '../../RxDBError.js';

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

/** 本地行仓储（`RxDBAdapterBase.getRepository()` 的返回物），QueryCache 的最终读出口 */
const createLocalRepo = (rows: CachedEntity[]) => ({
  find: vi.fn(async () => rows),
  count: vi.fn(async () => rows.length),
  create: vi.fn(async (entity: CachedEntity) => entity),
  update: vi.fn(async (entity: CachedEntity) => entity),
  remove: vi.fn(async (entity: CachedEntity) => entity)
});

const createLocalAdapter = (localRepo: ReturnType<typeof createLocalRepo>, cachedRows: CachedEntity[] = []) => ({
  name: 'local',
  getRepository: vi.fn(() => localRepo),
  // QueryCacheLocalAdapter 的三个必需 duck（均为 RxDBAdapterLocalBase 的 abstract）
  getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
  upsertMany: vi.fn(() => of(undefined)),
  deleteByIds: vi.fn(() => of(undefined)),
  // SWR 的缓存读出口：只有 localCacheFirst 生效时才会被调用。
  // `delay(0)` 不是装饰：同步发射时订阅链还没建立完，退订传不上去，
  // 「缓存一发射就把后台校验取消掉」这个真实故障在同步 mock 下测不出来。
  findAll: vi.fn(() => of(cachedRows).pipe(delay(0)))
});

const createRemoteAdapter = () => ({
  name: 'remote',
  getRepository: vi.fn(),
  fetchMetadata: vi.fn(() => of([{ id: 'a', updatedAt: '2024-01-02T00:00:00Z' }])),
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
    cachedRows?: CachedEntity[];
    localAdapter?: unknown;
    remoteAdapter?: unknown;
    EntityType?: CachedEntityCtor;
  } = {}
) => {
  const localRepo = createLocalRepo(overrides.localRows ?? [row('a', '2024-01-02T00:00:00Z', 1)]);
  // 覆盖项按「完整 stub」类型对待：唯一的例外是 AC#7 那个故意缺 duck 的对象，
  // 而那条用例只断言抛错，不读适配器上的任何成员
  const localAdapter =
    (overrides.localAdapter as ReturnType<typeof createLocalAdapter> | undefined) ??
    createLocalAdapter(localRepo, overrides.cachedRows);
  const remoteAdapter =
    (overrides.remoteAdapter as ReturnType<typeof createRemoteAdapter> | undefined) ?? createRemoteAdapter();
  const localAdapter$ = new BehaviorSubject(localAdapter);
  const remoteAdapter$ = new BehaviorSubject(remoteAdapter);

  const rxdb = {
    localAdapter$,
    remoteAdapter$,
    config: { sync: undefined },
    addEventListener: vi.fn(),
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
    expect(ctx.localAdapter.getMetadataByIds).toHaveBeenCalledTimes(1);
    expect(ctx.remoteAdapter.findByIds).toHaveBeenCalledWith('CachedEntity', ['a']);
    expect(ctx.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  // AC#21 + D8：最终读出口是本地 IRepository，返回实体实例而不是裸数据
  it('AC#21 结果来自本地 IRepository，是实体实例', async () => {
    const result = await firstValueFrom(ctx.repository.find({ where: where() }));

    expect(ctx.localRepo.find).toHaveBeenCalledTimes(1);
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
  it('AC#24 配置 localCacheFirst: true 时 find 走 SWR', async () => {
    const swr = setup({ EntityType: CachedSwrEntity, cachedRows: [row('a', '2024-01-01T00:00:00Z', 1)] });

    await firstValueFrom(swr.repository.find({ where: where() }));

    expect(swr.localAdapter.findAll).toHaveBeenCalledTimes(1);
    // 缓存先发射不得把后台校验一起取消：否则「一旦有缓存就再也不同步」。
    // 断言落在 `upsertMany` 而不是 `fetchMetadata`：后者在 Observable 构造期就被调用，
    // 订阅与否都会被记一次，证明不了校验真的跑完
    expect(swr.localAdapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  // AC#24：调用级显式值压过配置值
  it('AC#24 调用级 localCacheFirst: false 覆盖配置的 true', async () => {
    const swr = setup({ EntityType: CachedSwrEntity, cachedRows: [row('a', '2024-01-01T00:00:00Z', 1)] });

    await firstValueFrom(swr.repository.find({ where: where(), localCacheFirst: false }));

    expect(swr.localAdapter.findAll).not.toHaveBeenCalled();
  });

  // AC#24：配置缺省是 false，调用级可以单独开
  it('AC#24 调用级 localCacheFirst: true 覆盖缺省的 false', async () => {
    const plain = setup({ cachedRows: [row('a', '2024-01-01T00:00:00Z', 1)] });

    await firstValueFrom(plain.repository.find({ where: where() }));
    expect(plain.localAdapter.findAll).not.toHaveBeenCalled();

    await firstValueFrom(plain.repository.find({ where: where(), localCacheFirst: true }));
    expect(plain.localAdapter.findAll).toHaveBeenCalledTimes(1);
  });

  // AC#24 + AC#13：模式进任务指纹；onSyncStats 是函数，进不了指纹也不该进
  it('AC#24 localCacheFirst 进任务指纹，onSyncStats 不进', async () => {
    await firstValueFrom(
      ctx.repository.find({ where: where(), localCacheFirst: true, onSyncStats: () => undefined })
    );

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
