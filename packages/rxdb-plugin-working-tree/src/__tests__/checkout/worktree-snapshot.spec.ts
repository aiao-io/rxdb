/**
 * @fileoverview 建只读快照（US-313）：快照实例的形状、适配器校验、标记迁移、增量与分页的交接。
 *
 * @remarks
 * 行与增量真的搬进快照库、读出来与「切过去」一致，由 `worktreeConformanceSuite` 在六个后端上验；
 * 这里用替身钉死编排本身。
 */

import type {
  EntityType,
  LocalRxDBAdapter,
  Plugin,
  RxDB,
  SwitchVersionActions,
  TransactionExecutor,
  WorktreeSnapshotImport,
  WorktreeSnapshotPage
} from '@aiao/rxdb';
import {
  ACTIVE_BRANCH_KEY,
  Entity,
  EntityBase,
  getEntityMetadata,
  RxDBBranch,
  RxDB as RxDBClass,
  RxDBMigration,
  SyncType,
  WorktreeTableSet
} from '@aiao/rxdb';
import { compute_switch_branch_actions } from '@aiao/rxdb-plugin-history';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitViewActions, planCommitView } from '../../checkout/worktree-commit-view.js';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import {
  assertSnapshotSource,
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
  isSnapshotComplete,
  markSnapshotComplete,
  sealSnapshot
} from '../../checkout/worktree-snapshot.js';
import { MockLocalAdapter } from '../fixtures/test-db-setup.js';

vi.mock('../../checkout/worktree-commit-view.js', () => ({ planCommitView: vi.fn(), commitViewActions: vi.fn() }));

vi.mock('@aiao/rxdb-plugin-history', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-history')>()),
  compute_switch_branch_actions: vi.fn()
}));

@Entity({ name: 'SnapshotNote' })
class SnapshotNote extends EntityBase {}

@Entity({ name: 'SnapshotOther' })
class SnapshotOther extends EntityBase {}

/** 带全部快照原语的替身适配器。 */
class SnapshotCapableAdapter extends MockLocalAdapter {
  override readWorktreeSnapshotPage = vi.fn<NonNullable<LocalRxDBAdapter['readWorktreeSnapshotPage']>>();
  override importWorktreeSnapshot = vi.fn<NonNullable<LocalRxDBAdapter['importWorktreeSnapshot']>>(
    async () => undefined
  );
  override adoptWorktreeEncryption = vi.fn<NonNullable<LocalRxDBAdapter['adoptWorktreeEncryption']>>();
  override sealWorktreeReadOnly = vi.fn<NonNullable<LocalRxDBAdapter['sealWorktreeReadOnly']>>(async () => undefined);
  override dropStorage = vi.fn<NonNullable<LocalRxDBAdapter['dropStorage']>>(async () => undefined);
  override canDropStorage = vi.fn<NonNullable<LocalRxDBAdapter['canDropStorage']>>(() => true);
}

const opened: RxDB[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const mainAdapterNamed = (name: string): LocalRxDBAdapter => {
  const host = new RxDBClass({
    dbName: 'snapshot-main',
    entities: [],
    sync: { local: { adapter: name }, type: SyncType.None }
  });
  const adapter = new SnapshotCapableAdapter(host);
  adapter.name = name;
  return adapter as unknown as LocalRxDBAdapter;
};

const reasonOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(WorktreeUnavailableError);
  return (error as WorktreeUnavailableError).reason;
};

describe('assertSnapshotSource', () => {
  it('主库适配器读不出快照页：unsupported_adapter', () => {
    expect(() => assertSnapshotSource({ name: 'bare' } as LocalRxDBAdapter)).toThrow(WorktreeUnavailableError);
    expect(() => assertSnapshotSource(mainAdapterNamed('mock'))).not.toThrow();
  });
});

describe('createSnapshotDatabase', () => {
  it('克隆的实体、全部本地、只读、单实例，带一条标记迁移；读侧插件装上', () => {
    const install = vi.fn();
    const probe: Plugin = () => ({ name: 'worktreeProbe', lifecycle: 'scoped', install });
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), 'main~wt~1', [SnapshotNote], {
      adapter: db => new SnapshotCapableAdapter(db),
      plugins: [probe]
    });
    opened.push(snapshot);
    const { config } = snapshot;

    expect(config.readOnly).toBe(true);
    expect(config.multiInstance).toBe(false);
    const [Clone] = config.entities;
    expect(Clone).not.toBe(SnapshotNote);
    expect(getEntityMetadata(Clone).name).toBe('SnapshotNote');
    expect(getEntityMetadata(Clone).log).toBe(false);
    expect(config.syncOverrides?.map(override => [override.entity, override.sync.local?.adapter])).toEqual([
      [Clone, 'mock']
    ]);
    expect(config.migrations?.map(migration => migration.name)).toEqual(['worktree-snapshot:main~wt~1']);
    expect(snapshot.getPlugins('worktreeProbe')).toHaveLength(1);
  });

  it('标记迁移只在已有的库上跑 up()：一跑就是连错了库', async () => {
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), 'main~wt~2', [SnapshotNote], {
      adapter: db => new SnapshotCapableAdapter(db)
    });
    opened.push(snapshot);
    const [marker] = snapshot.config.migrations ?? [];

    expect(await reasonOf(marker.up({} as TransactionExecutor))).toBe('adapter_mismatch');
    await expect(marker.down()).resolves.toBeUndefined();
  });

  it('快照适配器换了后端：adapter_mismatch', async () => {
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), 'main~wt~3', [SnapshotNote], {
      adapter: db => {
        const adapter = new SnapshotCapableAdapter(db);
        adapter.name = 'other';
        return adapter as unknown as LocalRxDBAdapter;
      }
    });
    opened.push(snapshot);

    expect(await reasonOf(connectSnapshotDatabase(snapshot))).toBe('adapter_mismatch');
  });

  it('快照适配器缺原语：unsupported_adapter', async () => {
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), 'main~wt~4', [SnapshotNote], {
      adapter: db => new MockLocalAdapter(db) as unknown as LocalRxDBAdapter
    });
    opened.push(snapshot);

    expect(await reasonOf(connectSnapshotDatabase(snapshot))).toBe('unsupported_adapter');
  });

  // 建得出却删不掉的快照库，关闭时抛错、之后每次回收都报错；先删一次来试又会删掉没验明身份的库，只能问配置
  it('快照适配器按当前配置删不掉存储：unsupported_adapter，连接之前就拒', async () => {
    let created: SnapshotCapableAdapter | undefined;
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), 'main~wt~6', [SnapshotNote], {
      adapter: db => {
        created = new SnapshotCapableAdapter(db);
        created.canDropStorage.mockReturnValue(false);
        return created as unknown as LocalRxDBAdapter;
      }
    });
    opened.push(snapshot);

    expect(await reasonOf(connectSnapshotDatabase(snapshot))).toBe('unsupported_adapter');
    expect(created?.connect).not.toHaveBeenCalled();
    expect(created?.adoptWorktreeEncryption).not.toHaveBeenCalled();
    expect(created?.dropStorage).not.toHaveBeenCalled();
  });

  it('连上之后交回快照适配器，它已沿用主库的密钥环', async () => {
    const main = mainAdapterNamed('mock');
    let created: SnapshotCapableAdapter | undefined;
    const snapshot = createSnapshotDatabase(main, 'main~wt~5', [SnapshotNote], {
      adapter: async db => {
        created = new SnapshotCapableAdapter(db);
        return created as unknown as LocalRxDBAdapter;
      }
    });
    opened.push(snapshot);

    const adapter = await connectSnapshotDatabase(snapshot);

    expect(adapter).toBe(created);
    expect(created?.adoptWorktreeEncryption).toHaveBeenCalledWith(main);
  });
});

describe('快照库建完的哨兵', () => {
  /** 连上一个快照实例，交回它与替身适配器。 */
  const connected = async (dbName: string) => {
    let created: SnapshotCapableAdapter | undefined;
    const snapshot = createSnapshotDatabase(mainAdapterNamed('mock'), dbName, [SnapshotNote], {
      adapter: async db => {
        created = new SnapshotCapableAdapter(db);
        return created as unknown as LocalRxDBAdapter;
      }
    });
    opened.push(snapshot);
    const adapter = await connectSnapshotDatabase(snapshot);
    return { snapshot, adapter, created: created! };
  };

  it('建完写一行进快照库自己的迁移表；经执行器写，不记日志', async () => {
    const { snapshot, adapter, created } = await connected('main~wt~6');

    await markSnapshotComplete(snapshot, adapter);

    expect(created.transaction).toHaveBeenCalledWith(expect.any(Function), false);
    const [[saved]] = created.saveMany.mock.calls;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBeInstanceOf(RxDBMigration);
    expect(saved[0]).toMatchObject({ name: 'worktree-snapshot-complete' });
  });

  it('查得到这一行才算建完；连接时新建出来的空库查不到', async () => {
    const { adapter, created } = await connected('main~wt~7');
    const find = vi.fn<(options: unknown) => Promise<unknown[]>>(async () => []);
    created.getRepository.mockImplementation(EntityClass => {
      expect(EntityClass).toBe(RxDBMigration);
      return { find } as never;
    });

    expect(await isSnapshotComplete(adapter)).toBe(false);
    expect(find).toHaveBeenCalledWith({
      where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'worktree-snapshot-complete' }] },
      limit: 1
    });

    find.mockResolvedValueOnce([{ name: 'worktree-snapshot-complete' }]);
    expect(await isSnapshotComplete(adapter)).toBe(true);
  });
});

describe('importSnapshot', () => {
  const branchRows = [
    { id: 'main', activated: true },
    { id: 'feature', activated: false }
  ];

  /** 主库事务的执行器：分支表按 `activated` 过滤，变更表恒空。 */
  const executorWith = (
    branches: readonly { id: string; activated: boolean; activeKey?: string | null }[],
    tableSet: WorktreeTableSet = WorktreeTableSet.MAIN
  ): TransactionExecutor =>
    ({
      tableSet,
      getRepository: (EntityClass: EntityType) => ({
        find: async (options: { where: { rules: { field: string; value: unknown }[] } }) =>
          EntityClass === RxDBBranch ?
            branches.filter(row => options.where.rules.every(rule => Reflect.get(row, rule.field) === rule.value))
          : []
      })
    }) as unknown as TransactionExecutor;

  const snapshotWith = (adapter: SnapshotCapableAdapter): RxDB =>
    ({
      localAdapter$: of(adapter),
      schemaManager: { getEntityType: (name: string) => (name === 'SnapshotNote' ? SnapshotNote : undefined) }
    }) as unknown as RxDB;

  const consume = async (input: WorktreeSnapshotImport) => {
    const tables: [EntityType, WorktreeSnapshotPage[]][] = [];
    for (const table of input.tables) {
      const pages: WorktreeSnapshotPage[] = [];
      for await (const page of table.pages) pages.push(page);
      tables.push([table.EntityType, pages]);
    }
    return { tables, actions: input.actions };
  };

  it('打开 active 分支自己：增量为空；按页读到游标为 null 为止', async () => {
    const main = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    main.readWorktreeSnapshotPage
      .mockResolvedValueOnce({ rows: ['a'], count: 1, next: 1 })
      .mockResolvedValueOnce({ rows: [], count: 0, next: null });
    const target = new SnapshotCapableAdapter(main.rxdb);
    let imported: Awaited<ReturnType<typeof consume>> | undefined;
    target.importWorktreeSnapshot.mockImplementation(async input => {
      imported = await consume(input);
    });

    const source = await importSnapshot(
      executorWith(branchRows),
      main as unknown as LocalRxDBAdapter,
      snapshotWith(target),
      [SnapshotNote],
      { branchId: 'main' }
    );

    expect(compute_switch_branch_actions).not.toHaveBeenCalled();
    expect(main.readWorktreeSnapshotPage.mock.calls.map(call => call[2])).toEqual([null, 1]);
    expect(imported?.tables).toEqual([
      [
        SnapshotNote,
        [
          { rows: ['a'], count: 1, next: 1 },
          { rows: [], count: 0, next: null }
        ]
      ]
    ]);
    expect(imported?.actions.inserts.size).toBe(0);
    expect(source).toEqual({ sourceBranchId: 'main', sourceChangeId: null, targetChangeId: null });
  });

  it('另一条分支：增量只留快照里有的实体', async () => {
    const main = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    main.readWorktreeSnapshotPage.mockResolvedValue({ rows: [], count: 0, next: null });
    const { namespace } = getEntityMetadata(SnapshotNote);
    const change = { patch: { id: '1' }, inversePatch: null };
    const actions: SwitchVersionActions = {
      deletes: new Map([[`${namespace}:SnapshotOther:3`, change]]),
      updates: new Map([[`${namespace}:SnapshotNote:2`, change]]),
      inserts: new Map([
        [`${namespace}:SnapshotNote:1`, change],
        [`${namespace}:SnapshotOther:1`, change]
      ])
    };
    vi.mocked(compute_switch_branch_actions).mockResolvedValue(actions);
    const target = new SnapshotCapableAdapter(main.rxdb);

    await importSnapshot(
      executorWith(branchRows),
      main as unknown as LocalRxDBAdapter,
      snapshotWith(target),
      [SnapshotNote],
      { branchId: 'feature' }
    );

    const [input] = target.importWorktreeSnapshot.mock.calls[0];
    expect([...input.actions.inserts.keys()]).toEqual([`${namespace}:SnapshotNote:1`]);
    expect([...input.actions.updates.keys()]).toEqual([`${namespace}:SnapshotNote:2`]);
    expect(input.actions.deletes.size).toBe(0);
    expect(getEntityMetadata(SnapshotOther).name).toBe('SnapshotOther');
  });

  // 挂在可写检出位上的实例（US-314 B1.4）：复制的业务表是那套影子表，来源分支就得是它持有的分支——
  // 按主检出位激活的分支算增量，会把另一条分支的差异叠在影子表的数据上
  it('挂在可写检出位上：来源是那套表持有的分支', async () => {
    const tableSet = WorktreeTableSet.of('wt_snap', [SnapshotNote]);
    const main = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    main.readWorktreeSnapshotPage.mockResolvedValue({ rows: [], count: 0, next: null });
    const target = new SnapshotCapableAdapter(main.rxdb);
    const branches = [
      { id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY },
      { id: 'feature', activated: false, activeKey: tableSet.holderKey }
    ];

    const source = await importSnapshot(
      executorWith(branches, tableSet),
      main as unknown as LocalRxDBAdapter,
      snapshotWith(target),
      [SnapshotNote],
      { branchId: 'feature' }
    );

    expect(compute_switch_branch_actions).not.toHaveBeenCalled();
    expect(source).toEqual({ sourceBranchId: 'feature', sourceChangeId: null, targetChangeId: null });
  });

  it('挂在可写检出位上打开第三条分支：增量从持有分支算起', async () => {
    const tableSet = WorktreeTableSet.of('wt_snap', [SnapshotNote]);
    const main = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    main.readWorktreeSnapshotPage.mockResolvedValue({ rows: [], count: 0, next: null });
    vi.mocked(compute_switch_branch_actions).mockResolvedValue({
      deletes: new Map(),
      updates: new Map(),
      inserts: new Map()
    });
    const target = new SnapshotCapableAdapter(main.rxdb);
    const branches = [
      { id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY },
      { id: 'feature', activated: false, activeKey: tableSet.holderKey },
      { id: 'other', activated: false, activeKey: null }
    ];

    const source = await importSnapshot(
      executorWith(branches, tableSet),
      main as unknown as LocalRxDBAdapter,
      snapshotWith(target),
      [SnapshotNote],
      { branchId: 'other' }
    );

    expect(compute_switch_branch_actions).toHaveBeenCalledWith(expect.anything(), 'other', 'feature');
    expect(source.sourceBranchId).toBe('feature');
  });

  it('挂在可写检出位上而持有分支不见了：branch_not_found', async () => {
    const main = mainAdapterNamed('mock');
    const target = new SnapshotCapableAdapter(main.rxdb);
    const tableSet = WorktreeTableSet.of('wt_snap', [SnapshotNote]);

    expect(
      await reasonOf(
        importSnapshot(executorWith(branchRows, tableSet), main, snapshotWith(target), [SnapshotNote], {
          branchId: 'main'
        })
      )
    ).toBe('branch_not_found');
  });

  it('主库没有 active 分支：branch_not_found', async () => {
    const main = mainAdapterNamed('mock');
    const target = new SnapshotCapableAdapter(main.rxdb);

    expect(
      await reasonOf(importSnapshot(executorWith([]), main, snapshotWith(target), [SnapshotNote], { branchId: 'main' }))
    ).toBe('branch_not_found');
  });
});

describe('importSnapshot 的提交视图', () => {
  it('增量取自往回推，在同一个事务里重新判一次可达；目标变更点为 null', async () => {
    const main = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    main.readWorktreeSnapshotPage.mockResolvedValue({ rows: [], count: 0, next: null });
    const plan = { branchId: 'main', path: ['c2'] };
    vi.mocked(planCommitView).mockResolvedValue(plan);
    const { namespace } = getEntityMetadata(SnapshotNote);
    vi.mocked(commitViewActions).mockResolvedValue({
      deletes: new Map(),
      updates: new Map([[`${namespace}:SnapshotNote:1`, { patch: { title: 'a' }, inversePatch: { title: 'b' } }]]),
      inserts: new Map()
    });
    const target = new SnapshotCapableAdapter(main.rxdb);
    const executor = {
      tableSet: WorktreeTableSet.MAIN,
      getRepository: (EntityClass: EntityType) => ({
        find: async () => (EntityClass === RxDBBranch ? [{ id: 'main', activated: true }] : [])
      })
    } as unknown as TransactionExecutor;
    const snapshot = {
      localAdapter$: of(target),
      schemaManager: { getEntityType: () => SnapshotNote }
    } as unknown as RxDB;

    const source = await importSnapshot(executor, main as unknown as LocalRxDBAdapter, snapshot, [SnapshotNote], {
      commitId: 'c1'
    });

    expect(planCommitView).toHaveBeenCalledWith(executor, expect.anything(), 'c1');
    expect(commitViewActions).toHaveBeenCalledWith(executor, expect.anything(), plan);
    expect([...target.importWorktreeSnapshot.mock.calls[0][0].actions.updates.keys()]).toEqual([
      `${namespace}:SnapshotNote:1`
    ]);
    expect(source).toEqual({ sourceBranchId: 'main', sourceChangeId: null, targetChangeId: null });
  });
});

describe('sealSnapshot', () => {
  it('先封引擎，再装只读钩子', async () => {
    const adapter = mainAdapterNamed('mock') as unknown as SnapshotCapableAdapter;
    const install = vi.spyOn(adapter, 'setWorkingTreeCaptureHook');

    await sealSnapshot(adapter as unknown as LocalRxDBAdapter);

    expect(adapter.sealWorktreeReadOnly).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(Object.keys(install.mock.calls[0][0] ?? {}).sort()).toEqual([
      'bindMountTarget',
      'gateExternalNotify',
      'gateRawWrite',
      'interceptBulkWrite',
      'interceptMergeChanges',
      'interceptSwitchBranch',
      'interceptTransaction'
    ]);
  });
});
