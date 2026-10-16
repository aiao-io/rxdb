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
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import { WorktreeManager, type WorktreeTransactionRunner } from '../../checkout/worktree-manager.js';
import {
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
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
  sealSnapshot: vi.fn()
}));

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
  runEnabled = run => run(executor, {} as LocalRxDBAdapter);
  vi.mocked(classifyBranchMaterialization).mockResolvedValue({ kind: 'materialized', ref: {} as never });
  vi.mocked(createSnapshotDatabase).mockImplementation(() => fakeSnapshot());
  vi.mocked(connectSnapshotDatabase).mockResolvedValue({} as LocalRxDBAdapter);
  vi.mocked(importSnapshot).mockResolvedValue({ sourceBranchId: 'main', sourceChangeId: 4, targetChangeId: 9 });
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
    expect(rows[0].dbName).toMatch(new RegExp(`~wt~${view.id}$`));
    expect(view.rxdb).toBe(snapshot);
    expect(view.entityOf(ManagedNote)).toBe(ManagedNote);
    expect(sealSnapshot).toHaveBeenCalledTimes(1);

    await view.close();
    await view.close();
    expect(snapshot.disconnectAll).toHaveBeenCalledTimes(1);
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

  it('建快照期间登记行被删：报错并清理', async () => {
    vi.mocked(importSnapshot).mockImplementation(async () => {
      rows.splice(0);
      return { sourceBranchId: 'main', sourceChangeId: null, targetChangeId: null };
    });

    await expect(managerOf().open({ branchId: 'feature' })).rejects.toBeInstanceOf(RxDBError);
    expect(rows).toEqual([]);
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
});
