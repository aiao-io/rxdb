/**
 * @fileoverview `0004-working-tree-commits`：本插件在**既有库**上的迁移，与在**新库**上的初始行。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/data-model.md` §8。
 *
 * 本文件守的是**顺序与原子性**，不是 SQL。真实建表行为在各 adapter 包的集成层验证
 * （见 `__tests__/fixtures/test-db-setup.ts` 的分层说明），unit 层再复制一份内存存储
 * 只会多出一个谁都不信的第三方版本。
 *
 * 抽包时从这份里切走了一条断言：**系统 schema 水位常量的当前值**。它留在
 * `packages/rxdb/src/__tests__/system/migration.spec.ts`（用例「系统 schema 版本常量与水位行
 * 停在当前值」）——常量在核心，而且本包的贡献是否落地已经不看那个号了（看的是
 * `__rxdb_capability__:workingTree:N` 认领行）。留一份跨包的值断言在这里，只会让核心 bump
 * 版本时红在插件包，而红的那一侧改不动它。
 *
 * 为什么这三组断言值得写：
 *
 * 1. **每分支初始行**。§8 第 2 步要求为**每个已存在分支**各写一行 2.5 与一行 2.6。
 *    只给当前激活分支写是最自然的写法，也是最难发现的错误：单分支库上两种写法行为完全
 *    一致，要到用户切到第二个分支才炸。
 * 2. **全有或全无**。§8 明确「任一分支初始化不成功，整条迁移回滚，数据库停在 v3」。
 *    `up()` 必须让错误穿出去——`runMigrations` 靠抛出来回滚整个引导事务，把认领记录
 *    一并撤掉。任何一句 try/catch 吞掉就等于库停在「已认领、没执行」的死状态：
 *    认领行还在，下次启动会跳过这条迁移，表永远不会建。
 * 3. **新库的初始行**（{@link RxDBSystemContribution.createInitialRows}）。新库**不跑** `up()`
 *    ——那条链的名字由宿主的 `createMigrationWatermarks()` 直接写成已执行水位，行则随
 *    `createTables()` 一次写入。于是「既有库升上来的库」与「新建出来的库」走的是两条**不同的
 *    代码路径**，只测其中一条，另一条缺行时没有任何东西会红：缺行的表与正常的空表在形态上
 *    完全一样。宿主侧那半条接缝（这批行有没有挤进同一次 `createTables()`）由
 *    `packages/rxdb/src/__tests__/RxDB.migration-watermark.spec.ts` 用一个**假贡献方**守，
 *    那边不认识本包的类；载荷长什么样只有这里知道。
 */

import type { EntityManager, EntityType, IRepository, TransactionExecutor } from '@aiao/rxdb';
import { RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import {
  createWorkingTreeCommitsMigration,
  WORKING_TREE_COMMITS_MIGRATION_NAME
} from '../../migrations/0004-working-tree-commits.js';
import { RxDBPluginWorkingTree, rxDBPluginWorkingTree } from '../../plugin.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { fakeTableRef } from '../fixtures/fake-table-ref.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 一个挂了 mock 适配器、尚未 `init()` 的宿主。 */
function createDatabase(): RxDB {
  const database = new RxDB({
    dbName: `rxdb-working-tree-migration-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
}

/** 只为拿一个真的 {@link EntityManager}——迁移要靠它 `instantiate()` 出初始行。 */
function createEntityManager(): EntityManager {
  const database = createDatabase();
  // 十张系统表由本插件贡献，必须赶在 `init()` 之前 `use()`：晚了核心会当场拒绝，
  // 而这些实体进不了 `config.entities` 时 `instantiate()` 抛的是「need init rxdb」。
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

interface ExecutorProbe {
  readonly executor: TransactionExecutor;
  readonly saved: InstanceType<EntityType>[];
}

/**
 * 最小 {@link TransactionExecutor} 替身：`RxDBBranch` 仓库返回给定分支，写入全部落进 `saved`。
 *
 * @param branches - 迁移应当看见的既有分支
 * @param saveManyImpl - 覆盖写入行为（用于「某个分支初始化失败」这一支）
 */
function createExecutorProbe(
  branches: RxDBBranch[],
  saveManyImpl?: (entities: InstanceType<EntityType>[]) => Promise<InstanceType<EntityType>[]>
): ExecutorProbe {
  const saved: InstanceType<EntityType>[] = [];
  const repository: IRepository<EntityType> = {
    find: vi.fn(async () => branches as InstanceType<EntityType>[]),
    count: vi.fn(async () => branches.length),
    create: vi.fn(async entity => entity),
    update: vi.fn(async entity => entity),
    remove: vi.fn(async entity => entity)
  };
  const saveMany =
    saveManyImpl ??
    (async (entities: InstanceType<EntityType>[]) => {
      saved.push(...entities);
      return entities;
    });
  const executor: TransactionExecutor = {
    id: 'probe-executor',
    state: 'active',
    query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
    tableRef: fakeTableRef,
    mutations: vi.fn(async () => []),
    getRepository: () => repository,
    saveMany: saveMany as TransactionExecutor['saveMany'],
    removeMany: vi.fn(async entities => entities),
    mergeChanges: vi.fn(async () => undefined),
    run: fn => fn(executor)
  };
  return { executor, saved };
}

/** 造 `count` 个分支实例，id 为 `main` / `feature-1` / `feature-2` …… */
function createBranches(entityManager: EntityManager, count: number): RxDBBranch[] {
  return Array.from({ length: count }, (_, index) => {
    const branch = entityManager.instantiate(RxDBBranch);
    branch.id = index === 0 ? 'main' : `feature-${index}`;
    branch.activated = index === 0;
    return branch;
  });
}

function pick<T>(saved: InstanceType<EntityType>[], EntityClass: new () => T): T[] {
  return saved.filter((entity): entity is T => entity instanceof EntityClass);
}

describe('0004-working-tree-commits 迁移', () => {
  it('本插件贡献的迁移清单只含本条，且名字与文件名一致', () => {
    const entityManager = createEntityManager();
    const migrations = new RxDBPluginWorkingTree(createDatabase()).system.createMigrations(entityManager);
    expect(migrations.map(migration => migration.name)).toEqual([WORKING_TREE_COMMITS_MIGRATION_NAME]);
    // 名字既是迁移的主键，也是水位行的内容；与文件名分叉不会编译报错，
    // 只会让既有库认领一个名、下次启动按另一个名判「还没跑过」。
    expect(WORKING_TREE_COMMITS_MIGRATION_NAME).toBe('0004-working-tree-commits');
  });

  it('为每个既有分支各写一行 branch ref 与一行 working tree state', async () => {
    const entityManager = createEntityManager();
    const branches = createBranches(entityManager, 3);
    const { executor, saved } = createExecutorProbe(branches);

    await createWorkingTreeCommitsMigration(entityManager).up(executor);

    const refs = pick(saved, CommitBranchRef);
    const states = pick(saved, WorkingTreeState);
    expect(refs.map(ref => ref.id)).toEqual(['main', 'feature-1', 'feature-2']);
    expect(states.map(state => state.id)).toEqual(['main', 'feature-1', 'feature-2']);
    for (const ref of refs) {
      expect({ headCommitId: ref.headCommitId, headRevision: ref.headRevision, status: ref.status }).toEqual({
        headCommitId: null,
        headRevision: 0,
        status: 'ok'
      });
    }
    for (const state of states) {
      expect({
        baseHeadCommitId: state.baseHeadCommitId,
        workingTreeRevision: state.workingTreeRevision,
        entryCount: state.entryCount
      }).toEqual({ baseHeadCommitId: null, workingTreeRevision: 0, entryCount: 0 });
    }
  });

  it('generation 依次取自 branchGenerationSeq，且单调不重复', async () => {
    const entityManager = createEntityManager();
    const { executor, saved } = createExecutorProbe(createBranches(entityManager, 3));

    await createWorkingTreeCommitsMigration(entityManager).up(executor);

    // 「create branch 时 +1 并取用」（data-model.md §2.2）⇒ 首个发放值是 1，不是 0。
    expect(pick(saved, CommitBranchRef).map(ref => ref.generation)).toEqual([1, 2, 3]);
    const [activation] = pick(saved, WorkingTreeActivationState);
    expect({ id: activation?.id, activationRevision: activation?.activationRevision }).toEqual({
      id: 'default',
      activationRevision: 0
    });
    // 已发放到 3，下一次 create branch 必须从 4 起，否则新分支会复用已删分支的代际（ABA）。
    expect(activation?.branchGenerationSeq).toBe(3);
  });

  it('能力行写入且默认关闭（FR-046：enabled=false 时行为与 v3 完全一致）', async () => {
    const entityManager = createEntityManager();
    const { executor, saved } = createExecutorProbe(createBranches(entityManager, 1));

    await createWorkingTreeCommitsMigration(entityManager).up(executor);

    const [capability] = pick(saved, CommitCapabilityState);
    expect({ id: capability?.id, enabled: capability?.enabled, enabledAt: capability?.enabledAt }).toEqual({
      id: 'default',
      enabled: false,
      enabledAt: null
    });
  });

  it('任一分支初始化失败时错误穿出 up()，不被吞掉', async () => {
    const entityManager = createEntityManager();
    const failure = new Error('branch init failed');
    const { executor } = createExecutorProbe(createBranches(entityManager, 2), async () => {
      throw failure;
    });

    // 抛出去才有回滚。吞掉则认领行留在 rxdb_migration 里，下次启动直接跳过，
    // 10 张表永远建不出来，而且没有任何报错。
    await expect(createWorkingTreeCommitsMigration(entityManager).up(executor)).rejects.toThrow(failure);
  });
});

describe('新库首装的初始行（createInitialRows）', () => {
  /** 走契约入口而不是直调 `createWorkingTreeCommitsInitialRows`：宿主拿到的就是这一个。 */
  const initialRowsFor = (entityManager: EntityManager, branchIds: readonly string[]): InstanceType<EntityType>[] => [
    ...new RxDBPluginWorkingTree(createDatabase()).system.createInitialRows(entityManager, { branchIds })
  ];

  it('单分支新库写满四行：branch ref、working tree state、激活状态、能力位', () => {
    const entityManager = createEntityManager();

    const rows = initialRowsFor(entityManager, ['main']);

    // 逐类计数而不是只看总数：四行里少一行、多一行同名的，总数都可能仍是 4。
    expect(rows).toHaveLength(4);
    expect(pick(rows, CommitBranchRef).map(ref => ref.id)).toEqual(['main']);
    expect(pick(rows, WorkingTreeState).map(state => state.id)).toEqual(['main']);
    expect(pick(rows, WorkingTreeActivationState)).toHaveLength(1);
    expect(pick(rows, CommitCapabilityState)).toHaveLength(1);
  });

  it('每条分支各得一行 branch ref 与一行 working tree state，代际依次发放', () => {
    const entityManager = createEntityManager();

    // 新库上宿主只传得出 `main`，但契约收的是**分支集合**：这里多喂两条，
    // 测的是「按分支展开」这件事本身，而不是它在今天那个调用点上的取值。
    const rows = initialRowsFor(entityManager, ['main', 'feature-1', 'feature-2']);

    const refs = pick(rows, CommitBranchRef);
    expect(refs.map(ref => ref.id)).toEqual(['main', 'feature-1', 'feature-2']);
    // 代际从 1 起：§2.2 的口径是「create branch 时 +1 并取用」，seq 的初值 0 永远不被发放。
    expect(refs.map(ref => ref.generation)).toEqual([1, 2, 3]);
    expect(pick(rows, WorkingTreeState).map(state => state.id)).toEqual(['main', 'feature-1', 'feature-2']);
    const [activation] = pick(rows, WorkingTreeActivationState);
    // 已发放到 3，下一次 create branch 必须从 4 起，否则新分支会复用已删分支的代际（ABA）。
    expect(activation?.branchGenerationSeq).toBe(3);
  });

  it('新库与既有库的初始行逐字段同值 —— 两条路径不得分叉', async () => {
    const entityManager = createEntityManager();
    const branchIds = ['main', 'feature-1'];

    const fresh = initialRowsFor(entityManager, branchIds);
    const { executor, saved } = createExecutorProbe(createBranches(entityManager, branchIds.length));
    await createWorkingTreeCommitsMigration(entityManager).up(executor);

    // 这是本组最重要的一条。新库走 `createInitialRows()`、既有库走 `up()`，两条路径各写各的，
    // 分叉了不会有编译错误，也不会有任何一条现有用例变红——只会让「升上来的库」与
    // 「新建出来的库」从第一天起就是两种库，而这一点要到某个只在其中一种上出现的 bug 才显形。
    //
    // 类身份按 label 取，不用 `row.constructor.name`：`@Entity()` 返回的是匿名子类，
    // `.name` 一律是空串，拿它比对等于在比两个常量，两边换了类也照样绿。
    const labels: readonly [label: string, EntityClass: new () => object][] = [
      ['CommitBranchRef', CommitBranchRef],
      ['WorkingTreeState', WorkingTreeState],
      ['WorkingTreeActivationState', WorkingTreeActivationState],
      ['CommitCapabilityState', CommitCapabilityState]
    ];
    const shapeOf = (rows: InstanceType<EntityType>[]): unknown[] =>
      rows.map(row => ({
        ...row,
        class: labels.find(([, EntityClass]) => row instanceof EntityClass)?.[0]
      }));

    const freshShape = shapeOf(fresh);
    // 先证这个比对不是空对空：两条路径都真的产出了行，且每行都认得出类与字段。
    expect(freshShape).toHaveLength(6);
    expect(freshShape[0]).toEqual(expect.objectContaining({ class: 'CommitBranchRef', id: 'main', generation: 1 }));
    expect(freshShape).toEqual(shapeOf(saved));
  });

  it('能力位默认关闭（FR-046：enabled=false 时行为与 v3 完全一致）', () => {
    const entityManager = createEntityManager();

    const [capability] = pick(initialRowsFor(entityManager, ['main']), CommitCapabilityState);

    // 建表本身不改变任何业务行为，启用是用户后续的一次显式 CAS。默认成 true 的新库，
    // 第一次写就会走进整套捕获路径，而用户从没要求过。
    expect({ id: capability?.id, enabled: capability?.enabled, enabledAt: capability?.enabledAt }).toEqual({
      id: 'default',
      enabled: false,
      enabledAt: null
    });
  });
});
