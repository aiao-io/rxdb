/**
 * @fileoverview US-310 的引导迁移：既有库补一行主 worktree
 *
 * @remarks
 * 表不在这里建：`rxdb_worktree` 经 `RxDBSystemContribution.entities` 登记，既有库由 `RxDB.connect()`
 * 的系统表补建先建出来，本迁移只写行。与 `0004-working-tree-commits` 同一条链、同一张
 * `rxdb_migration`、同一把锁，按名字排在它之后。
 */

import {
  AmbiguousActiveBranchError,
  RxDBBranch,
  type EntityManager,
  type MigrationType,
  type TransactionExecutor
} from '@aiao/rxdb';
import { createWorktreeRow, type Worktree } from '../worktree/worktree.entity.js';

/**
 * 本条迁移的名字，与文件名一致
 *
 * @remarks
 * 它是 `rxdb_migration."name"` 唯一索引上的仲裁键：**合入即钉死**，改名等于在既有库上再跑一遍。
 */
export const WORKTREES_MIGRATION_NAME = '0005-worktrees';

/**
 * 造出主 worktree 行（未落库）
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param checkedOutBranchIds - 当前 checkout 的分支；新库上是建库时那条 `main`，既有库上是 active 分支（零或一条）
 * @returns 每条分支一行，`label` 为 `null`
 *
 * @remarks
 * 新库（`createInitialRows()`，随建表写入）与既有库（{@link createWorktreesMigration}）共用这一处，
 * 两条路径写出来的主行逐字段相同。主行**显式落库**，不做「合成一行 active」的视图：
 * 合成出来的那一行删不掉、改不了，也不在唯一索引的管辖里，是第二份真相。
 */
export function createWorktreesInitialRows(
  entityManager: EntityManager,
  checkedOutBranchIds: readonly string[]
): Worktree[] {
  return checkedOutBranchIds.map(branchId => createWorktreeRow(entityManager, branchId, null));
}

/**
 * 在既有库上补主 worktree 行
 *
 * @param entityManager - 用于 `instantiate()` 出主行的实体管理器
 * @returns 可交给 `runMigrations()` 的迁移
 *
 * @remarks
 * **不用 `assertSingleActiveBranch()`。** 本迁移对**所有**既有库都跑，而零 active 是从没启用过
 * 提交能力的老库的合法态：`commit-error-codes.ts` 的 `no_active_branch` 写明迁移期不抛，
 * `bootstrapExisting()` 也只在能力已启用时才断言基数。照那个守卫写，这类库升级当场拒连。
 *
 * 三种基数各有各的答案：
 *
 * - **一条**：主行钉在它上面——升级之后用户看到的第一个 worktree 就是自己正在用的那条分支；
 * - **零条**：不落行。没有当前 checkout，也就没有「主 worktree」；零行是 `listWorktrees()` 的合法态，
 *   用户随时可以自己 `createWorktree()`。不顺手激活 `main`——修复 active 是首次启用迁移的事
 *   （`resolveSingleActiveBranch` 的限定），在这里修等于多一条「顺手修一下」的路；
 * - **多条**：抛 {@link AmbiguousActiveBranchError}，整条迁移回滚。「当前 checkout 是谁」没有答案，
 *   与 `ensureBranchActiveKey` 撞上多 active 时的处置同口径。
 *
 * 读基数**不带 `limit`**：带了就是先把答案截断再问答案是多少（`active-branch-guard.ts` 的原话）。
 * 读也必须走 `executor` 的仓库：事务体内经普通 `adapter.query()` 的读会排在自己这个事务后面，直接挂死。
 */
export function createWorktreesMigration(entityManager: EntityManager): MigrationType {
  return {
    name: WORKTREES_MIGRATION_NAME,
    async up(executor: TransactionExecutor): Promise<void> {
      const active = await executor.getRepository(RxDBBranch).find({
        where: { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] }
      });
      if (active.length > 1) throw new AmbiguousActiveBranchError(active.map(branch => branch.id).sort());
      if (active.length === 0) return;
      await executor.saveMany(
        createWorktreesInitialRows(
          entityManager,
          active.map(branch => branch.id)
        )
      );
    },
    down(): Promise<void> {
      // 反向迁移唯一有意义的实现是删掉全部 worktree 行，而 RxDB 从不主动调 down()。
      // 空实现比抛错更糟：它会让调用方以为库已回到上一版，而表和行都还在。
      return Promise.reject(
        new Error(`Migration "${WORKTREES_MIGRATION_NAME}" is irreversible: worktree rows are never rolled back.`)
      );
    }
  };
}
