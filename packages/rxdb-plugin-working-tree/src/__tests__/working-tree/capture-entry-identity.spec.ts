/**
 * @fileoverview 工作树单元的主键由捕获端口自己写下（data-model.md §2.7）。
 *
 * @remarks
 * `WorkingTreeEntry.id` 在实体元数据里是 `primary: true` 且**没有默认值**——与 `Commit` /
 * `CommitChangeSet` / `CommitBranchRef` 一致，这个特性里所有系统实体的主键都由写入方赋值
 * （`commit/write-commit.ts` 的 `row.id = uuid()`）。于是「谁来写 id」这件事在
 * `createWorkingTreeCapturePort()` 这一处，而它是**唯一**造单元行的地方。
 *
 * 为什么这三条值得单独写：
 *
 * 1. **漏赋 id 在类型层完全看不见**。`instantiate(WorkingTreeEntry)` 交回的实例上
 *    `id!: string` 是 definite assignment，少写一行 `entry.id = ...` 既不报错也不告警；
 *    六个后端要到真的 INSERT 时才以 `NOT NULL constraint failed` 报出来，而那条报错出现在
 *    适配器包的一致性套件里，离出错的那一行隔着一个包。
 * 2. **主键不能撞号**。折叠的唯一约束是 `(branch, namespace, entity, entityId)`，主键是纯代理键；
 *    若实现图省事拿 `unitId` 或指纹当 id，同一事务里写两个实体会共用一个 unitId，
 *    第二行当场撞主键，而这在单实体的用例里永远看不出来。
 * 3. **折叠不得换主键**。第二次写同一实体走的是 `update` 分支：patch 里一旦捎上 id，
 *    同一个未提交单元会在每次 `save()` 之后换一个身份，而 `status()` / `diff()` 之外还有
 *    恢复会话按行身份记进度。
 *
 * 真实 SQL 的 NOT NULL 行为由 `workingTreeCommitConformanceSuite` 在六个后端上验证；
 * 这里的替身不是数据库，约束只能靠断言显式写出来。
 */

import type { EntityManager } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import type { WorkingTreeCaptureHost } from '../../working-tree/capture-runtime.js';
import { createWorkingTreeCapturePort } from '../../working-tree/capture-runtime.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import type { ActiveBranchToken, WorkingTreeEntryKey, WorkingTreeEntryRow } from '../../working-tree/write-entry.js';
import { createCommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 只为拿一个真的 {@link EntityManager}——单元行要靠它 `instantiate()` 出来。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-capture-entry-identity-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  // 十张系统表由插件贡献，必须赶在 `init()` 之前 `use()`：晚了核心会当场拒绝，
  // 而这些实体进不了 `config.entities` 时 `instantiate()` 抛的是「need init rxdb」。
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

const TOKEN: ActiveBranchToken = { branchId: 'branch-main', activationRevision: 1 };

/** 一行折叠结果；默认是「改了一次 Note#note-1」。 */
const rowOf = (overrides: Partial<WorkingTreeEntryRow> = {}): WorkingTreeEntryRow => ({
  namespace: 'demo',
  entity: 'Note',
  entityId: 'note-1',
  operation: 'update',
  patch: { title: '改过' },
  inversePatch: { title: '原值' },
  fingerprint: '00000001',
  origin: 'local',
  unitId: 'unit-1',
  transactionId: 'tx-1',
  sourceChangeId: 1,
  ...overrides
});

const keyOf = (row: WorkingTreeEntryRow): WorkingTreeEntryKey => ({
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId
});

describe('工作树捕获端口：单元主键', () => {
  const entityManager = createEntityManager();
  const host: WorkingTreeCaptureHost = { entityManager };

  it('新建单元时落库那一行带着非空主键', async () => {
    const probe = createCommitGraphProbe();
    const row = rowOf();
    const port = createWorkingTreeCapturePort(probe.executor, host, TOKEN, keyOf(row));

    await port.persistEntry(row, 1);

    const persisted = probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
    expect(persisted).toHaveLength(1);
    // 六个后端的 `rxdb_working_tree_entry.id` 都是 NOT NULL 主键：少这一个值，
    // 捕获在第一次真的落库时就整事务回滚，业务写跟着一起没了。
    expect(typeof persisted[0]?.id).toBe('string');
    expect(persisted[0]?.id).not.toBe('');
  });

  it('两个实体身份各自拿到不同的主键', async () => {
    const probe = createCommitGraphProbe();
    const first = rowOf();
    const second = rowOf({ entityId: 'note-2', operation: 'insert', inversePatch: null });

    await createWorkingTreeCapturePort(probe.executor, host, TOKEN, keyOf(first)).persistEntry(first, 1);
    await createWorkingTreeCapturePort(probe.executor, host, TOKEN, keyOf(second)).persistEntry(second, 1);

    const ids = (probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[]).map(entry => entry.id);
    // 同一事务的两条写共用一个 unitId（adapter-contract.md §5），拿它当主键会在这里撞号。
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('折进已有单元时主键原样不动', async () => {
    const probe = createCommitGraphProbe();
    const existing = entityManager.instantiate(WorkingTreeEntry);
    Object.assign(existing, rowOf(), { id: 'entry-keep', branchId: TOKEN.branchId });
    probe.seed(WorkingTreeEntry, [existing]);

    const folded = rowOf({ patch: { title: '又改了一次' }, fingerprint: '00000002', unitId: 'unit-2' });
    await createWorkingTreeCapturePort(probe.executor, host, TOKEN, keyOf(folded)).persistEntry(folded, 0);

    const rows = probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('entry-keep');
    expect(rows[0]?.fingerprint).toBe('00000002');
  });
});
