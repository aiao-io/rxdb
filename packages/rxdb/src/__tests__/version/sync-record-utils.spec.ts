import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBSync } from '../../system/sync.js';
import { getOrCreateSyncRecord } from '../../version/sync-record-utils.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

// `new RxDBSync()` 依赖已初始化的 EntityManager，所以这里必须先起一个 RxDB
let database!: RxDB;

beforeAll(() => {
  database = new RxDB({
    dbName: 'sync-record-utils',
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', () => createMockAdapter());
  database.init();
});

afterAll(async () => {
  await database.disconnectAll();
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** 从 where 条件里取出 `id` 规则的值 */
function idFromWhere(where: unknown): string | undefined {
  if (!isRecord(where) || !Array.isArray(where['rules'])) return undefined;
  for (const rule of where['rules']) {
    if (isRecord(rule) && rule['field'] === 'id' && typeof rule['value'] === 'string') return rule['value'];
  }
  return undefined;
}

/**
 * 一个会像真实主键那样拒绝重复 id 的 RxDBSync 仓库。
 *
 * `find` 前面挂了一个**一次性栅栏**：前 `participants` 个调用都必须到齐才放行，
 * 用来把「两个任务都查不到记录 → 都去创建」这个窗口稳定复现出来，而不是靠调度巧合。
 */
function createRacingRepo(participants: number) {
  const store = new Map<string, RxDBSync>();
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));

  const find = vi.fn(async (options: { where?: unknown }): Promise<RxDBSync[]> => {
    if (arrived < participants) {
      arrived += 1;
      if (arrived === participants) release();
      await gate;
    }
    const id = idFromWhere(options.where);
    const record = id === undefined ? undefined : store.get(id);
    return record ? [record] : [];
  });

  const create = vi.fn(async (record: RxDBSync): Promise<RxDBSync> => {
    if (store.has(record.id)) {
      // 真实适配器在这里报的是主键冲突：`id` 就是 `${namespace}:${entity}:${branchId}`
      throw new Error(`UNIQUE constraint failed: RxDBSync.id (${record.id})`);
    }
    store.set(record.id, record);
    return record;
  });

  return { repo: { find, create } as unknown as IRepository<typeof RxDBSync>, find, create, store };
}

const params = {
  namespace: 'public',
  entity: 'User',
  branchId: 'main',
  syncType: 'full'
} as const;

const instantiateSyncRecord = () => database.entityManager.instantiate(RxDBSync);

/**
 * RXD-061：`getOrCreateSyncRecord` 的 find-then-create 之间没有原子性。
 *
 * 评审说「无唯一约束时产生多条水位记录」—— 这一半不成立：`id` 本身就是
 * `${namespace}:${entity}:${branchId}`，是主键，两条重复行根本写不进去。
 * 但另一半是真的：并发的首次同步（例如同一个 repository 上并发 push + pull）会让
 * 两个任务都查不到记录、都去 create，其中一个稳定撞主键冲突而整条同步失败。
 *
 * `HistoryManager.syncing()` 只是把同步深度计数加一，没有任何串行化。
 */
describe('getOrCreateSyncRecord', () => {
  it('多个数据库同时注册系统实体时使用调用方提供的实体工厂（RXD-046）', async () => {
    const second = new RxDB({
      dbName: 'sync-record-utils-second',
      entities: [],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    second.adapter('local', () => createMockAdapter());
    second.init();

    const { repo } = createRacingRepo(0);
    const instantiate = vi.fn(() => database.entityManager.instantiate(RxDBSync));

    try {
      await expect(getOrCreateSyncRecord(repo, params, instantiate)).resolves.toMatchObject({
        id: 'public:User:main'
      });
      expect(instantiate).toHaveBeenCalledOnce();
    } finally {
      await second.disconnectAll();
    }
  });

  it('并发首次同步时两边拿到同一条记录，不因主键冲突失败', async () => {
    const { repo, create } = createRacingRepo(2);

    const [first, second] = await Promise.all([
      getOrCreateSyncRecord(repo, params, instantiateSyncRecord),
      getOrCreateSyncRecord(repo, params, instantiateSyncRecord)
    ]);

    expect(first.id).toBe('public:User:main');
    expect(second.id).toBe('public:User:main');
    // 落库的只能是同一条：谁先写入，另一边就复用谁
    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('create 因主键之外的原因失败时原样抛出', async () => {
    const failure = new Error('disk is full');
    const repo = {
      find: vi.fn(async () => []),
      create: vi.fn(async () => {
        throw failure;
      })
    } as unknown as IRepository<typeof RxDBSync>;

    await expect(getOrCreateSyncRecord(repo, params, instantiateSyncRecord)).rejects.toThrow(failure);
  });

  it('记录已存在时直接复用，不调用 create', async () => {
    const { repo, create } = createRacingRepo(0);

    const created = await getOrCreateSyncRecord(repo, params, instantiateSyncRecord);
    create.mockClear();
    const reused = await getOrCreateSyncRecord(repo, params, instantiateSyncRecord);

    expect(reused).toBe(created);
    expect(create).not.toHaveBeenCalled();
  });
});
