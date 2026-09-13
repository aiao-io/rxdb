/**
 * @fileoverview 系统 schema 3 → 4 的单条迁移（data-model.md §8）
 *
 * @remarks
 * epic-006「本地工作树与提交历史」的持久层一次性到位。**只有这一条**：
 * 10 张表的初始行分散成多条迁移，就没有任何一处能保证「要么全有要么全无」。
 */

import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../commit/commit-capability-state.entity.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityType } from '../../entity/entity.interface.js';
import type { MigrationType } from '../../rxdb.interface.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { createWorkingTreeActivationRow } from '../../working-tree/activation-state.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { RxDBBranch } from '../branch.js';
import { RXDB_CHANGE_CODEC_VERSION } from '../change-codec.js';

/**
 * 本条迁移的名字，与文件名一致
 *
 * @remarks
 * 它同时是 `rxdb_migration."name"` 唯一索引上的仲裁键——多实例同时启动时，
 * 认领这条 INSERT 的唯一赢家才执行 `up()`（见 `migration-runner.ts`）。
 * 因此这个字符串一旦发布就**永不能改**：改名等于在既有库上再跑一遍。
 */
export const WORKING_TREE_COMMITS_MIGRATION_NAME = '0004-working-tree-commits';

/**
 * 造出 epic-006 持久层的全部初始行（§8 第 2–3 步）
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchIds - 需要初始化的分支 id，顺序即代际发放顺序
 * @returns 未落库的初始行实例，调用方负责在**一个**事务里写下去
 *
 * @remarks
 * 新库与既有库走的是两条完全不同的路径——新库在 `createTables()` 里随建表一次性写入，
 * 既有库在 {@link createWorkingTreeCommitsMigration} 的事务里补写。两条路径的初始值
 * 必须逐字段相同，否则「新建的库」与「升上来的库」会从第一天起就是两种库。
 * 所以初始行只此一处生成，两边都调它。
 */
export function createWorkingTreeCommitsInitialRows(
  entityManager: EntityManager,
  branchIds: readonly string[]
): InstanceType<EntityType>[] {
  const rows: InstanceType<EntityType>[] = [];
  // 代际从 1 起：§2.2 的口径是「create branch 时 +1 并取用」，所以 seq 的初值 0 永远不被发放。
  // 这里把既有分支视同「依次建出来的」，逐个取 1..N。
  let branchGenerationSeq = 0;
  // 「每个已存在分支」不是「当前激活分支」。单分支库上两种写法行为完全一致，
  // 要到用户切到第二个分支才炸，那时已经没有迁移窗口可以补。
  for (const branchId of branchIds) {
    branchGenerationSeq += 1;

    const ref = entityManager.instantiate(CommitBranchRef);
    ref.id = branchId;
    ref.branchId = branchId;
    ref.generation = branchGenerationSeq;
    ref.headCommitId = null;
    ref.headRevision = 0;
    ref.status = 'ok';
    ref.corruptedAt = null;
    rows.push(ref);

    const state = entityManager.instantiate(WorkingTreeState);
    state.id = branchId;
    state.branchId = branchId;
    state.baseHeadCommitId = null;
    state.workingTreeRevision = 0;
    state.entryCount = 0;
    rows.push(state);
  }

  // 建行只此一处（`working-tree/activation-state.ts`）：新库与既有库共用同一份初始值。
  // 已发放到 N，下一次 create branch 从 N+1 起。写 0 会让新分支复用既有分支的代际（ABA）。
  rows.push(createWorkingTreeActivationRow(entityManager, branchGenerationSeq));

  const capability = entityManager.instantiate(CommitCapabilityState);
  capability.id = COMMIT_CAPABILITY_STATE_ID;
  // FR-046：建表本身不改变任何业务行为，启用是用户后续的一次显式 CAS。
  capability.enabled = false;
  capability.protocolVersion = COMMIT_PROTOCOL_VERSION;
  capability.schemaVersion = COMMIT_GRAPH_SCHEMA_VERSION;
  capability.codecVersion = RXDB_CHANGE_CODEC_VERSION;
  capability.enabledAt = null;
  rows.push(capability);

  return rows;
}

/**
 * 在既有库上补写 epic-006 持久层的初始行
 *
 * @param entityManager - 用于 `instantiate()` 出初始行的实体管理器
 * @returns 可交给 `runMigrations()` 的迁移
 *
 * @remarks
 * **为什么是工厂而不是常量**：`MigrationType.up()` 只拿得到一个 {@link TransactionExecutor}，
 * 而写入需要的是**实体实例**——`instantiate()` 挂在 {@link EntityManager} 上。改用裸 SQL 可以
 * 省掉这个形参，代价是六个后端的占位符方言（`$1` 与 `?`）要在这里分叉，那才是真正会腐烂的地方。
 *
 * **表不在这里建**。10 张表已登记进 `SYSTEM_ENTITIES`，由 `createTables()`（新库）与
 * `RxDB.connect()` 的系统表补建（既有库）以 `IF NOT EXISTS` 建出，六个后端各自的建表器负责方言。
 * 本迁移只写 §8 第 2–3 步的初始行，并且**必须**排在水位线写下 `__rxdb_system_schema__:4`
 * **之前**——顺序反了，这里一失败就会留下「标成 v4、初始行却没写」的库：旧客户端被
 * `UnsupportedRxDBSystemVersionError` 拒之门外，新能力也没拿到。
 *
 * **全有或全无**：整段只发一次 `saveMany`，任何一行失败都让错误穿出 `up()`。
 * 吞掉它的代价不是少几行数据——`runMigrations` 靠抛出来回滚整个引导事务，连同认领记录一起撤掉；
 * 吞掉则认领行留在 `rxdb_migration` 里，下次启动直接跳过本条，初始行**永远**补不上，且无任何报错。
 */
export function createWorkingTreeCommitsMigration(entityManager: EntityManager): MigrationType {
  return {
    name: WORKING_TREE_COMMITS_MIGRATION_NAME,
    async up(executor: TransactionExecutor): Promise<void> {
      // 读也必须走 executor 的仓库：事务体内经普通 adapter.query() 的读会排在自己这个
      // 事务后面（队列并发度 1），直接挂死。
      const branches = await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });
      await executor.saveMany(
        createWorkingTreeCommitsInitialRows(
          entityManager,
          branches.map(branch => branch.id)
        )
      );
    },
    down(): Promise<void> {
      // 反向迁移唯一有意义的实现是删掉那 10 张表，也就是删掉用户的**全部提交历史**——
      // 不可恢复，且没有任何入口需要它（RxDB 从不主动调 down()）。
      // 空实现比抛错更糟：它会让调用方以为库已回到 v3，而表和数据都还在。
      return Promise.reject(
        new Error(
          `Migration "${WORKING_TREE_COMMITS_MIGRATION_NAME}" is irreversible: rolling it back would drop the entire commit history.`
        )
      );
    }
  };
}
