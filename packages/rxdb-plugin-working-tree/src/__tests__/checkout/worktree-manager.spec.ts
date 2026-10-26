/**
 * @fileoverview `rxdb.workingTree.checkouts`（US-313）：三笔主库事务的编排与登记行的生命周期。
 *
 * @remarks
 * 建快照的各步换成替身，这里只验编排：先登记再建库、建完转 `ready`、失败时撤销登记并断开快照实例、
 * 视图的关闭与刷新。真后端上的端到端语义由 `worktreeConformanceSuite` 验。
 */

import type { EntityType, LocalRxDBAdapter, RxDB as RxDBInstance, TransactionExecutor } from '@aiao/rxdb';
import { Entity, EntityBase, RxDB, RxDBBranch, RxDBError, SyncType } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planCommitView } from '../../checkout/worktree-commit-view.js';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import { WorktreeManager, type WorktreeTransactionRunner } from '../../checkout/worktree-manager.js';
import {
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
  isSnapshotComplete,
  markSnapshotComplete,
  sealSnapshot
} from '../../checkout/worktree-snapshot.js';
import { Worktree } from '../../checkout/worktree.entity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { classifyBranchMaterialization } from '../../working-tree/branch-materialization.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

vi.mock('../../checkout/worktree-snapshot.js', () => ({
  assertSnapshotSource: vi.fn(),
  createSnapshotDatabase: vi.fn(),
  connectSnapshotDatabase: vi.fn(),
  importSnapshot: vi.fn(),
  isSnapshotComplete: vi.fn(),
  markSnapshotComplete: vi.fn(),
  sealSnapshot: vi.fn()
}));

vi.mock('../../checkout/worktree-commit-view.js', () => ({ planCommitView: vi.fn() }));

vi.mock('../../working-tree/branch-materialization.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/branch-materialization.js')>()),
  classifyBranchMaterialization: vi.fn()
}));

@Entity({ name: 'ManagedNote' })
class ManagedNote extends EntityBase {}

type Row = Record<string, unknown>;

const matches = (row: Row, where: { rules: { field: string; value: unknown }[] }): boolean =>
  where.rules.every(rule => row[rule.field] === rule.value);

const databases: RxDBInstance[] = [];
let rows: Worktree[];
/** 每次连上的快照适配器替身，按连接顺序。 */
let snapshotAdapters: LocalRxDBAdapter[];
let runEnabled: WorktreeTransactionRunner;

/** 主实例：装了工作树插件（登记表因此在实体清单里），不连接。 */
const createMain = (): RxDBInstance => {
  const database = new RxDB({
    dbName: `checkout-manager-${Math.random().toString(36).slice(2)}`,
    entities: [ManagedNote],
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => createMockAdapter(db));
  database.use(rxDBPluginWorkingTree);
  database.init();
  databases.push(database);
  return database;
};

/** 快照实例的替身：只有视图会碰的两样。 */
const fakeSnapshot = () =>
  ({
    disconnectAll: vi.fn(async () => undefined),
    schemaManager: { getEntityType: vi.fn(() => ManagedNote) }
  }) as unknown as RxDBInstance & { disconnectAll: ReturnType<typeof vi.fn> };

beforeEach(() => {
  rows = [];
  snapshotAdapters = [];
  const branches = [{ id: 'main' }, { id: 'feature' }];
  const executor = {
    saveMany: vi.fn(async (entities: Worktree[]) => {
      rows.push(...entities);
      return entities;
    }),
    getRepository: (EntityClass: EntityType) => {
      if (EntityClass === RxDBBranch) {
        return { find: async ({ where }: { where: never }) => branches.filter(row => matches(row, where)) };
      }
      return {
        find: async ({ where }: { where: never }) => rows.filter(row => matches(row as unknown as Row, where)),
        update: async (row: Worktree, patch: Partial<Worktree>) => Object.assign(row, patch),
        remove: async (row: Worktree) => {
          rows.splice(rows.indexOf(row), 1);
          return row;
        }
      };
    }
  } as unknown as TransactionExecutor;
  // 提交视图要拿适配器造编解码上下文：它只在调用时才读 `rxdb` 上的两样
  runEnabled = run => run(executor, { rxdb: { entityManager: {}, schemaManager: {} } } as unknown as LocalRxDBAdapter);
  vi.mocked(classifyBranchMaterialization).mockResolvedValue({ kind: 'materialized', ref: {} as never });
  vi.mocked(planCommitView).mockResolvedValue({ branchId: 'main', path: [] });
  vi.mocked(createSnapshotDatabase).mockImplementation(() => fakeSnapshot());
  vi.mocked(connectSnapshotDatabase).mockImplementation(async () => {
    const adapter = { dropStorage: vi.fn(async () => undefined) } as unknown as LocalRxDBAdapter;
    snapshotAdapters.push(adapter);
    return adapter;
  });
  vi.mocked(importSnapshot).mockResolvedValue({ sourceBranchId: 'main', sourceChangeId: 4, targetChangeId: 9 });
  vi.mocked(markSnapshotComplete).mockResolvedValue(undefined);
  vi.mocked(isSnapshotComplete).mockResolvedValue(true);
  vi.mocked(sealSnapshot).mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.clearAllMocks();
  for (const database of databases.splice(0)) await database.disconnectAll();
});

const managerOf = (configured = true): WorktreeManager =>
  new WorktreeManager(
    createMain(),
    run => runEnabled(run),
    configured ? { adapter: () => ({}) as LocalRxDBAdapter } : undefined
  );

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(WorktreeUnavailableError);
  return (error as WorktreeUnavailableError).reason;
};

describe('WorktreeManager.open', () => {
  it('没给 worktrees.adapter：not_configured', async () => {
    expect(await reasonOf(managerOf(false).open({ branchId: 'feature' }))).toBe('not_configured');
  });

  it('分支不存在：branch_not_found，不写登记行', async () => {
    expect(await reasonOf(managerOf().open({ branchId: 'nope' }))).toBe('branch_not_found');
    expect(rows).toEqual([]);
  });

  it('分支本地只有 metadata：branch_not_materialized', async () => {
    vi.mocked(classifyBranchMaterialization).mockResolvedValue({ kind: 'metadata_only', branchId: 'feature' });
    expect(await reasonOf(managerOf().open({ branchId: 'feature' }))).toBe('branch_not_materialized');
    expect(rows).toEqual([]);
  });

  it('建完：登记行转 ready、记下主库停在哪；关闭断开快照实例并撤销登记，重复关闭无副作用', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' });
    const snapshot = vi.mocked(createSnapshotDatabase).mock.results[0].value as ReturnType<typeof fakeSnapshot>;

    expect(await manager.list()).toEqual([
      expect.objectContaining({
        id: view.id,
        kind: 'branch',
        branchId: 'feature',
        owner: 'session',
        state: 'ready',
        sourceBranchId: 'main',
        sourceChangeId: 4,
        targetChangeId: 9
      })
    ]);
    // wa-sqlite 的库名上限与 Electron 宿主的字符集都容得下
    expect(rows[0].dbName).toMatch(/^wt-[0-9a-f]{24}$/);
    expect(view.rxdb).toBe(snapshot);
    expect(view.entityOf(ManagedNote)).toBe(ManagedNote);
    // 哨兵写在封印之前：封印之后快照库就写不进了
    expect(markSnapshotComplete).toHaveBeenCalledWith(snapshot, snapshotAdapters[0]);
    expect(vi.mocked(markSnapshotComplete).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sealSnapshot).mock.invocationCallOrder[0]
    );
    expect(sealSnapshot).toHaveBeenCalledTimes(1);

    await view.close();
    await view.close();
    expect(snapshot.disconnectAll).toHaveBeenCalledTimes(1);
    expect(snapshotAdapters[0].dropStorage).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
  });

  it('提交视图：先过 restore 同口径的预检，登记行记下提交与它所在的 active 分支', async () => {
    vi.mocked(planCommitView).mockResolvedValue({ branchId: 'main', path: ['c2'] });
    vi.mocked(importSnapshot).mockResolvedValue({ sourceBranchId: 'main', sourceChangeId: 7, targetChangeId: null });
    const manager = managerOf();

    const view = await manager.open({ commitId: 'c1' });

    expect(planCommitView).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'c1');
    expect(vi.mocked(importSnapshot).mock.calls[0][4]).toEqual({ commitId: 'c1' });
    expect(await manager.list()).toEqual([
      expect.objectContaining({ id: view.id, kind: 'commit', branchId: 'main', commitId: 'c1', targetChangeId: null })
    ]);
  });

  it('提交视图打不开：预检的原因原样抛出，不写登记行', async () => {
    vi.mocked(planCommitView).mockRejectedValue(new WorktreeUnavailableError('unreachable_target', 'x'));

    expect(await reasonOf(managerOf().open({ commitId: 'elsewhere' }))).toBe('unreachable_target');
    expect(rows).toEqual([]);
  });

  it('建快照失败：断开快照实例、撤销登记，原错原样抛出', async () => {
    const failure = new Error('import failed');
    vi.mocked(importSnapshot).mockRejectedValue(failure);

    await expect(managerOf().open({ branchId: 'feature' })).rejects.toBe(failure);
    const snapshot = vi.mocked(createSnapshotDatabase).mock.results[0].value as ReturnType<typeof fakeSnapshot>;
    expect(snapshot.disconnectAll).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
  });

  it('快照库没连上：只断开，登记行留作 building 交给 prune()——库可能已在连接期建出来了', async () => {
    const failure = new Error('connect failed');
    vi.mocked(connectSnapshotDatabase).mockRejectedValueOnce(failure);
    const manager = managerOf();

    await expect(manager.open({ branchId: 'feature' })).rejects.toBe(failure);
    const snapshot = vi.mocked(createSnapshotDatabase).mock.results[0].value as ReturnType<typeof fakeSnapshot>;
    expect(snapshot.disconnectAll).toHaveBeenCalledTimes(1);
    expect(rows.map(row => row.state)).toEqual(['building']);
    const pending = rows.map(row => row.id);

    // 锁已放开：prune() 按登记行重连，确认是快照库之后删库、删登记行
    expect(await manager.prune()).toEqual(pending);
    expect(snapshotAdapters.at(-1)?.dropStorage).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
  });

  it('建快照期间登记行被删：报错并清理', async () => {
    vi.mocked(importSnapshot).mockImplementation(async () => {
      rows.splice(0);
      return { sourceBranchId: 'main', sourceChangeId: null, targetChangeId: null };
    });

    await expect(managerOf().open({ branchId: 'feature' })).rejects.toBeInstanceOf(RxDBError);
    expect(rows).toEqual([]);
  });
});

describe('生命周期：锁、release、attach 与 prune（阶段 C）', () => {
  it('release()：只断开、还锁，登记行与快照库留着；会话归属的随后被 prune() 回收', async () => {
    const manager = managerOf();
    const kept = await manager.open({ branchId: 'feature' });
    const gone = await manager.open({ branchId: 'feature' });
    await gone.release();
    expect(snapshotAdapters[1].dropStorage).not.toHaveBeenCalled();
    expect(rows.map(row => row.id)).toEqual([kept.id, gone.id]);
    const goneDbName = rows[1].dbName;

    expect(await manager.prune()).toEqual([gone.id]);

    // 回收先用空实体集连一次快照库确认身份，再删库、删登记行；还开着的那个锁在本页手里，碰不到
    const reclaimCall = vi.mocked(createSnapshotDatabase).mock.calls.at(-1);
    expect(reclaimCall?.[1]).toBe(goneDbName);
    expect(reclaimCall?.[2]).toEqual([]);
    expect(snapshotAdapters.at(-1)?.dropStorage).toHaveBeenCalledTimes(1);
    expect(rows.map(row => row.id)).toEqual([kept.id]);
  });

  it('持久归属：prune() 不碰；release() 之后 attach() 再打开，拿不到锁时 in_use', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' }, { owner: 'persistent' });
    expect(await reasonOf(manager.attach(view.id))).toBe('in_use');
    await view.release();
    expect(await manager.prune()).toEqual([]);

    const attached = await manager.attach(view.id);

    expect(attached).toMatchObject({ id: view.id, owner: 'persistent', target: { branchId: 'feature' } });
    expect(sealSnapshot).toHaveBeenCalledTimes(2);
    await attached.close();
    expect(rows).toEqual([]);
  });

  it('attach()：没有这个持久检出位 not_found；实体结构变了 schema_mismatch', async () => {
    const manager = managerOf();
    expect(await reasonOf(manager.attach('nope'))).toBe('not_found');
    const session = await manager.open({ branchId: 'feature' });
    await session.release();
    expect(await reasonOf(manager.attach(session.id))).toBe('not_found');

    const persistent = await manager.open({ commitId: 'c1' }, { owner: 'persistent' });
    await persistent.release();
    rows.find(row => row.id === persistent.id)!.schemaFingerprint = 'stale';
    expect(await reasonOf(manager.attach(persistent.id))).toBe('schema_mismatch');
  });

  it('attach()：登记行在、快照库已不在（连上的是新建的空库）：not_found，连带回收', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' }, { owner: 'persistent' });
    await view.release();
    vi.mocked(isSnapshotComplete).mockResolvedValueOnce(false);

    expect(await reasonOf(manager.attach(view.id))).toBe('not_found');

    expect(sealSnapshot).toHaveBeenCalledTimes(1);
    expect(snapshotAdapters.at(-1)?.dropStorage).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
    // 锁随之放开：同一个 id 再 attach 不是 in_use，而是查无此行
    expect(await reasonOf(manager.attach(view.id))).toBe('not_found');
  });

  it('attach() 失败后断开快照实例也失败：照样还锁，抛出的是原错', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' }, { owner: 'persistent' });
    await view.release();
    const failure = new Error('seal failed');
    vi.mocked(sealSnapshot).mockRejectedValueOnce(failure);
    vi.mocked(createSnapshotDatabase).mockImplementationOnce(() => {
      const snapshot = fakeSnapshot();
      snapshot.disconnectAll.mockRejectedValue(new Error('disconnect failed'));
      return snapshot;
    });

    await expect(manager.attach(view.id)).rejects.toBe(failure);

    // 失败的 attach() 交不出视图，调用方手里没有释放函数：锁这时已经还掉，再 attach 才不是 in_use
    const attached = await manager.attach(view.id);
    expect(attached.id).toBe(view.id);
    await attached.close();
  });

  it('prune() 里有一个回收失败：其余照常回收，最后一起报出来', async () => {
    const manager = managerOf();
    const first = await manager.open({ branchId: 'feature' });
    const second = await manager.open({ branchId: 'feature' });
    await first.release();
    await second.release();
    vi.mocked(connectSnapshotDatabase).mockRejectedValueOnce(new WorktreeUnavailableError('adapter_mismatch', 'x'));

    await expect(manager.prune()).rejects.toBeInstanceOf(AggregateError);
    expect(rows.map(row => row.id)).toEqual([first.id]);
  });
});

describe('WorktreeView.refresh', () => {
  it('按主库现状重建一个新视图，旧视图随之关闭', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' });
    const first = vi.mocked(createSnapshotDatabase).mock.results[0].value as ReturnType<typeof fakeSnapshot>;

    const refreshed = await view.refresh();

    expect(refreshed.id).not.toBe(view.id);
    expect(refreshed.target).toEqual({ branchId: 'feature' });
    expect(first.disconnectAll).toHaveBeenCalledTimes(1);
    expect((await manager.list()).map(record => record.id)).toEqual([refreshed.id]);
  });

  it('旧视图收尾失败（删库撞上占用）：新视图一并关掉再报错，不留调用方拿不到的检出位', async () => {
    const manager = managerOf();
    const view = await manager.open({ branchId: 'feature' });
    const busy = new Error('database_busy');
    vi.mocked(snapshotAdapters[0].dropStorage!).mockRejectedValueOnce(busy);

    await expect(view.refresh()).rejects.toBe(busy);

    const next = vi.mocked(createSnapshotDatabase).mock.results[1].value as ReturnType<typeof fakeSnapshot>;
    expect(next.disconnectAll).toHaveBeenCalledTimes(1);
    expect(snapshotAdapters[1].dropStorage).toHaveBeenCalledTimes(1);
    // 只剩旧视图那一行：它的库没删掉，登记行照「先删库再删登记」留着给 prune()
    expect(rows.map(row => row.id)).toEqual([view.id]);
    expect(await manager.prune()).toEqual([view.id]);
  });
});
