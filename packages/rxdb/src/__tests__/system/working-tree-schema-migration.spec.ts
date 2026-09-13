/**
 * @fileoverview T006 红测试：系统 schema 3 → 4 的单条迁移。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/data-model.md` §8。
 *
 * 本文件守的是**顺序与原子性**，不是 SQL。真实建表行为在各 adapter 包的集成层验证
 * （见 `__tests__/fixtures/test-db-setup.ts` 的分层说明），unit 层再复制一份内存存储
 * 只会多出一个谁都不信的第三方版本。
 *
 * 为什么这三组断言值得写：
 *
 * 1. **水位常量**。`RXDB_SYSTEM_SCHEMA_WATERMARK` 是模板字符串拼出来的，改 `3` 为 `4`
 *    之后它自动跟着变——正因为自动，**忘记改**也一样自动：整份代码没有任何一处会因为
 *    常量停在 3 而编译失败，而停在 3 的后果是既有库永远不会进入升级路径，10 张表永远
 *    建不出来，且没有任何报错。
 * 2. **每分支初始行**。§8 第 2 步要求为**每个已存在分支**各写一行 2.5 与一行 2.6。
 *    只给当前激活分支写是最自然的写法，也是最难发现的错误：单分支库上两种写法行为完全
 *    一致，要到用户切到第二个分支才炸。
 * 3. **全有或全无**。§8 明确「任一分支初始化不成功，整条迁移回滚，数据库停在 v3」。
 *    `up()` 必须让错误穿出去——`runMigrations` 靠抛出来回滚整个引导事务，把认领记录
 *    一并撤掉。任何一句 try/catch 吞掉就等于库停在「已认领、没执行」的死状态：
 *    认领行还在，下次启动会跳过这条迁移，表永远不会建。
 */

import { describe, expect, it, vi } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import {
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX
} from '../../system/migration.js';
import {
  createWorkingTreeCommitsMigration,
  WORKING_TREE_COMMITS_MIGRATION_NAME
} from '../../system/migrations/0004-working-tree-commits.js';
import { createSystemMigrations } from '../../system/migrations/index.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 只为拿一个真的 {@link EntityManager}——迁移要靠它 `instantiate()` 出初始行。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-working-tree-migration-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
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

describe('系统 schema 3 → 4 迁移', () => {
  it('版本常量与水位线停在 4', () => {
    expect(RXDB_SYSTEM_SCHEMA_VERSION).toBe(4);
    expect(RXDB_SYSTEM_SCHEMA_WATERMARK).toBe(`${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}4`);
  });

  it('系统迁移清单只含本条迁移，且名字与文件名一致', () => {
    const entityManager = createEntityManager();
    const migrations = createSystemMigrations(entityManager);
    expect(migrations.map(migration => migration.name)).toEqual([WORKING_TREE_COMMITS_MIGRATION_NAME]);
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
