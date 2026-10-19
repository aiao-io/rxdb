/**
 * @fileoverview 启动清理（US-313 AC9 的「任一标签页启动」那一半）：连接期判定有没有孤儿，有才在连上之后回收一次。
 *
 * @remarks
 * 关掉或崩掉的标签页没有机会自己收尾，它留下的会话归属检出位只能靠别的标签页启动时收走。
 * 但回收要开事务，而另一个连接的 `connect()` 开头先拿系统迁移的排他锁、拿不到就失败：连上之后无条件回收一次，
 * 每次启动都多一笔事务，正赶上它的别的连接就连不上（失败现场归档的第二连接就这样挂过）。所以判定放进连接期
 * 本来就有的引导事务：读一次登记表，只有会话归属或没建完、且锁此刻没人持有的检出位存在时，才在连上之后回收。
 * `prune()` 本身的判据由一致性套件在真后端上验，这里只验「什么时候回收、什么时候连登记表都不读」。
 */

import { RxDB, RxDBBranch, SyncType, type EntityType } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdWorktreeLock, worktreeLockName } from '../../checkout/worktree-locks.js';
import { WorktreeManager } from '../../checkout/worktree-manager.js';
import { Worktree } from '../../checkout/worktree.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createCapabilityStateRow, createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
  vi.restoreAllMocks();
});

/** 等后台的回收有机会跑起来：宏任务一轮不够，事务链要几轮微任务与宏任务 */
const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setTimeout(resolve, 0));
};

/** 登记表里的一行，只给判定读得到的字段 */
const record = (id: string, owner: Worktree['owner'], state: Worktree['state']): object => ({ id, owner, state });

interface SceneOptions {
  /** 装插件时给 `worktrees` */
  readonly worktrees: boolean;
  /** 库上的提交能力已启用 */
  readonly enabled: boolean;
  /** 登记表里的行 */
  readonly registry: readonly object[];
  /** 既有库（走 `bootstrapExisting()`）；新库不调它 */
  readonly existing?: boolean;
  /** 连接前先建好实例，给调用方拿 `config.dbName` 去拿锁 */
  readonly beforeConnect?: (database: RxDB) => Promise<void>;
  /** 再配一个远端适配器并连上：只断本地时还有别的适配器连着，插件不随之重装 */
  readonly withRemote?: boolean;
}

interface Scene {
  readonly database: RxDB;
  readonly adapter: MockLocalAdapter;
  /** 登记表仓库的 `find`：判定读没读登记表看它 */
  readonly registryFind: ReturnType<typeof vi.fn>;
}

const connectScene = async (options: SceneOptions): Promise<Scene> => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-working-tree-startup-prune-${databaseSequence}`,
    entities: [],
    sync:
      options.withRemote ?
        { local: { adapter: 'local' }, remote: { adapter: 'remote' }, type: SyncType.Full }
      : { local: { adapter: 'local' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  vi.mocked(adapter.isTableExisted).mockResolvedValue(options.existing ?? true);
  const registryFind = vi.fn(async () => options.registry);
  const rows = new Map<EntityType, readonly object[]>([
    [CommitCapabilityState, [{ ...createCapabilityStateRow(), enabled: options.enabled }]],
    [RxDBBranch, [{ id: 'main', activated: true }]]
  ]);
  const defaultGetRepository = adapter.getRepository.getMockImplementation();
  adapter.getRepository.mockImplementation(EntityType => {
    if (EntityType === Worktree) {
      return { find: registryFind, count: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } as never;
    }
    const stubbed = rows.get(EntityType);
    if (!stubbed) return defaultGetRepository?.(EntityType) as never;
    return {
      find: vi.fn(async () => stubbed),
      count: vi.fn(async () => stubbed.length),
      create: vi.fn(async (entity: object) => entity),
      update: vi.fn(async (entity: object) => entity),
      remove: vi.fn(async (entity: object) => entity)
    } as never;
  });
  database.adapter('local', () => adapter);
  database.use(
    rxDBPluginWorkingTree,
    options.worktrees ? { worktrees: { adapter: db => createMockAdapter(db) as never } } : undefined
  );
  databases.add(database);
  await options.beforeConnect?.(database);
  await database.connect('local');
  if (options.withRemote) {
    database.adapter('remote', db => createMockAdapter(db));
    await database.connect('remote');
  }
  return { database, adapter, registryFind };
};

describe('启动清理：连接期判定有没有孤儿，有才在连上之后回收一次', () => {
  it('会话归属、锁没人持有的检出位：连上之后回收一次', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    await connectScene({ worktrees: true, enabled: true, registry: [record('wt-1', 'session', 'ready')] });

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));
  });

  it('没建完的检出位同样算孤儿：持久归属也回收', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    await connectScene({ worktrees: true, enabled: true, registry: [record('wt-1', 'persistent', 'building')] });

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));
  });

  it('只有持久归属且已建完的检出位：不回收，连上之后一笔事务都不多开', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    const { registryFind } = await connectScene({
      worktrees: true,
      enabled: true,
      registry: [record('wt-1', 'persistent', 'ready')]
    });
    await settle();

    expect(registryFind).toHaveBeenCalledTimes(1);
    expect(prune).not.toHaveBeenCalled();
  });

  // 别的标签页正开着它：那不是孤儿，回收也拿不到锁，白开一笔事务
  it('候选检出位的锁还被别处持有：不回收', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);
    let release: (() => Promise<void>) | null = null;

    await connectScene({
      worktrees: true,
      enabled: true,
      registry: [record('wt-1', 'session', 'ready')],
      beforeConnect: async database => {
        release = await holdWorktreeLock(worktreeLockName(database.config.dbName, 'wt-1'));
      }
    });
    await settle();

    expect(prune).not.toHaveBeenCalled();
    await release!();
  });

  it('库还没启用：不读登记表，也不回收', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    const { registryFind } = await connectScene({
      worktrees: true,
      enabled: false,
      registry: [record('wt-1', 'session', 'ready')]
    });
    await settle();

    expect(registryFind).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
  });

  it('没配快照库：不读登记表，也不回收', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    const { registryFind } = await connectScene({
      worktrees: false,
      enabled: true,
      registry: [record('wt-1', 'session', 'ready')]
    });
    await settle();

    expect(registryFind).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
  });

  // 新库的登记表是这次建表刚建的，必然是空的
  it('新库：不回收', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    await connectScene({
      worktrees: true,
      enabled: true,
      existing: false,
      registry: [record('wt-1', 'session', 'ready')]
    });
    await settle();

    expect(prune).not.toHaveBeenCalled();
  });

  it('断开重连是新的连接纪元：重新判定，还有孤儿就再回收一次，不会叠成两次', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);
    const { database } = await connectScene({
      worktrees: true,
      enabled: true,
      registry: [record('wt-1', 'session', 'ready')]
    });
    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));

    await database.disconnectAll();
    await database.connect('local');

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(2));
    await settle();
    expect(prune).toHaveBeenCalledTimes(2);
  });

  // 还有别的适配器连着时只断本地：全局拆卸不跑，插件不重装，`install()` 里那个订阅还是同一个。
  // 它只取第一次连上的话，重连时引导事务新判定出的孤儿就没人回收，直到整页刷新（RV-083 P2-11）
  it('只断本地适配器再连回来（远端一直连着）：重新判定，还有孤儿就再回收一次', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);
    const { database } = await connectScene({
      worktrees: true,
      enabled: true,
      registry: [record('wt-1', 'session', 'ready')],
      withRemote: true
    });
    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));

    await database.disconnect('local');
    await database.connect('local');

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(2));
    await settle();
    expect(prune).toHaveBeenCalledTimes(2);
  });

  // 没有调用方能接住后台的错误：回收失败只是留下几个没删的快照库，不能拖垮这次连接
  it('回收失败：打到控制台，连接照常', async () => {
    const failure = new Error('prune exploded');
    vi.spyOn(WorktreeManager.prototype, 'prune').mockRejectedValue(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await connectScene({ worktrees: true, enabled: true, registry: [record('wt-1', 'session', 'ready')] });

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.stringContaining('回收只读检出位失败'), failure));
  });
});
