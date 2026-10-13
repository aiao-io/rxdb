/**
 * @fileoverview US-310 AC#2～#4：`0005-worktrees` 在既有库上补主 worktree 行，新库随建表写同一行。
 *
 * @remarks
 * 与 `0004-working-tree-commits` 同一套分工：新库走 `createInitialRows()`（随 `createTables()` 一次写入，
 * 迁移名直接记成已执行水位），既有库走 `up()`。两条路径各测一遍，再测一次「逐字段同值」。
 *
 * **零 active 不抛**是本文件最要紧的一条。迁移对**所有**既有库都跑，而零 active 是从没启用过能力的
 * 老库的合法态——`commit-error-codes.ts` 的 `no_active_branch` 写明「迁移期不抛」，`bootstrapExisting()`
 * 也只在能力已启用时才断言基数。照着 `assertSingleActiveBranch()` 写，这类库升级当场拒连。
 * 多 active 则与 `ensureBranchActiveKey` 同口径：「当前 checkout 是谁」没有答案，整条回滚。
 */

import type { EntityManager, EntityType, IRepository, RuleGroup, TransactionExecutor } from '@aiao/rxdb';
import { AmbiguousActiveBranchError, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { WORKING_TREE_COMMITS_MIGRATION_NAME } from '../../migrations/0004-working-tree-commits.js';
import { createWorktreesMigration, WORKTREES_MIGRATION_NAME } from '../../migrations/0005-worktrees.js';
import { RxDBPluginWorktree, rxDBPluginWorktree } from '../../plugin.js';
import { Worktree } from '../../worktree/worktree.entity.js';
import { fakeTableRef } from '../fixtures/fake-table-ref.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 一个挂了 mock 适配器、尚未 `init()` 的宿主。 */
const createDatabase = (): RxDB => {
  const database = new RxDB({
    dbName: `rxdb-worktrees-migration-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
};

/** 只为拿一个真的 {@link EntityManager}——迁移要靠它 `instantiate()` 出主行。 */
const createEntityManager = (): EntityManager => {
  const database = createDatabase();
  database.use(rxDBPluginWorktree);
  database.init();
  return database.entityManager;
};

/**
 * 最小执行器替身：`RxDBBranch` 仓库按 `activated = true` 过滤给定分支，写入落进 `saved`。
 *
 * @remarks
 * 过滤条件**照实**解释而不是无视：迁移若写成「读全部分支再挑」或带了 `limit: 1`，
 * 断言要能看出来——后者正是 `active-branch-guard.ts` 点名禁止的「先把答案截断再问答案是多少」。
 */
const createExecutorProbe = (branches: RxDBBranch[]) => {
  const saved: InstanceType<EntityType>[] = [];
  const finds: { where: RuleGroup; limit: number | undefined }[] = [];
  const repository: IRepository<EntityType> = {
    find: vi.fn(async options => {
      finds.push({ where: options.where as RuleGroup, limit: options.limit });
      const rules = (options.where as RuleGroup).rules as { field: string; operator: string; value: unknown }[];
      return branches.filter(branch =>
        rules.every(rule => (branch as unknown as Record<string, unknown>)[rule.field] === rule.value)
      ) as InstanceType<EntityType>[];
    }),
    count: vi.fn(async () => branches.length),
    create: vi.fn(async entity => entity),
    update: vi.fn(async entity => entity),
    remove: vi.fn(async entity => entity)
  };
  const executor: TransactionExecutor = {
    id: 'worktrees-migration-probe',
    state: 'active',
    query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
    tableRef: fakeTableRef,
    mutations: vi.fn(async () => []),
    getRepository: () => repository,
    saveMany: (async (entities: InstanceType<EntityType>[]) => {
      saved.push(...entities);
      return entities;
    }) as TransactionExecutor['saveMany'],
    removeMany: vi.fn(async entities => entities),
    mergeChanges: vi.fn(async () => undefined),
    run: fn => fn(executor)
  };
  return { executor, saved, finds };
};

/** 造分支；`activeIds` 里的为 active。 */
const createBranches = (entityManager: EntityManager, ids: readonly string[], activeIds: readonly string[]) =>
  ids.map(id => {
    const branch = entityManager.instantiate(RxDBBranch);
    branch.id = id;
    branch.activated = activeIds.includes(id);
    return branch;
  });

const worktreesOf = (saved: InstanceType<EntityType>[]): Worktree[] =>
  saved.filter((row): row is Worktree => row instanceof Worktree);

describe('0005-worktrees 迁移（既有库）', () => {
  it('名字与文件名一致，且排在 0004 之后', () => {
    const migrations = new RxDBPluginWorktree(createDatabase()).system.createMigrations(createEntityManager());
    expect(migrations.map(migration => migration.name)).toEqual([
      WORKING_TREE_COMMITS_MIGRATION_NAME,
      WORKTREES_MIGRATION_NAME
    ]);
    // 名字是 `rxdb_migration."name"` 唯一索引上的仲裁键：合入即钉死，改名等于在既有库上再跑一遍。
    expect(WORKTREES_MIGRATION_NAME).toBe('0005-worktrees');
  });

  it('恰一条 active 分支：主行钉在它上面（不是钉 main）', async () => {
    const entityManager = createEntityManager();
    const { executor, saved, finds } = createExecutorProbe(
      createBranches(entityManager, ['main', 'feature-x'], ['feature-x'])
    );

    await createWorktreesMigration(entityManager).up(executor);

    const [row, ...rest] = worktreesOf(saved);
    expect(rest).toEqual([]);
    expect({ branchId: row?.branchId, label: row?.label }).toEqual({ branchId: 'feature-x', label: null });
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    // 读基数不带 limit：带了就是先把答案截断再问答案是多少。
    expect(finds).toEqual([
      { where: { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] }, limit: undefined }
    ]);
  });

  it('零 active：一行不写、不抛——未启用能力的老库照常打开', async () => {
    const entityManager = createEntityManager();
    const { executor, saved } = createExecutorProbe(createBranches(entityManager, ['main', 'feature-x'], []));

    await expect(createWorktreesMigration(entityManager).up(executor)).resolves.toBeUndefined();
    expect(saved).toEqual([]);
  });

  it('多 active：抛 AmbiguousActiveBranchError、一行不写（整条迁移回滚）', async () => {
    const entityManager = createEntityManager();
    const { executor, saved } = createExecutorProbe(
      createBranches(entityManager, ['main', 'feature-x', 'feature-y'], ['feature-y', 'main'])
    );

    const error = await createWorktreesMigration(entityManager)
      .up(executor)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AmbiguousActiveBranchError);
    expect((error as AmbiguousActiveBranchError).branchIds).toEqual(['feature-y', 'main']);
    expect(saved).toEqual([]);
  });

  it('写入失败时错误穿出 up()，不被吞掉', async () => {
    const entityManager = createEntityManager();
    const probe = createExecutorProbe(createBranches(entityManager, ['main'], ['main']));
    const failure = new Error('insert failed');
    const executor: TransactionExecutor = { ...probe.executor, saveMany: () => Promise.reject(failure) };

    // 吞掉的话认领行留在 rxdb_migration 里，下次启动直接跳过本条，主行永远补不上。
    await expect(createWorktreesMigration(entityManager).up(executor)).rejects.toBe(failure);
  });

  it('down() 一律拒绝', async () => {
    await expect(createWorktreesMigration(createEntityManager()).down()).rejects.toThrow(/0005-worktrees/);
  });
});

describe('新库的主 worktree 行（createInitialRows）', () => {
  /** 走契约入口：宿主拿到的就是这一个。 */
  const initialWorktreesFor = (entityManager: EntityManager, branchIds: readonly string[]): Worktree[] =>
    worktreesOf([...new RxDBPluginWorktree(createDatabase()).system.createInitialRows(entityManager, { branchIds })]);

  it('新库恰一行，钉在 main、label 为 null', () => {
    const [row, ...rest] = initialWorktreesFor(createEntityManager(), ['main']);
    expect(rest).toEqual([]);
    expect({ branchId: row?.branchId, label: row?.label }).toEqual({ branchId: 'main', label: null });
  });

  it('与既有库迁移写出的主行逐字段同值（id 与库时钟列除外）', async () => {
    const entityManager = createEntityManager();
    const [fresh] = initialWorktreesFor(entityManager, ['main']);
    const { executor, saved } = createExecutorProbe(createBranches(entityManager, ['main'], ['main']));
    await createWorktreesMigration(entityManager).up(executor);
    const [migrated] = worktreesOf(saved);

    // 两条路径各写一份的话，「新建的库」与「升上来的库」从第一天起就是两种库。
    const shapeOf = (row: Worktree | undefined) => ({ ...row, id: typeof row?.id, createdAt: row?.createdAt });
    expect(shapeOf(migrated)).toEqual(shapeOf(fresh));
    expect(fresh?.createdAt).toBeUndefined();
  });
});
