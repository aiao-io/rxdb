/**
 * @fileoverview RxDB 自带的系统迁移清单
 *
 * @remarks
 * 与 `RxDBConfig.migrations`（接入方自己的迁移）是**两条独立的链**，共用同一张
 * `rxdb_migration` 表与同一把仲裁锁（`name` 上的唯一索引），但执行时机不同：
 * 系统迁移必须先于 `migrateSystemSchema()` 落下的水位线跑完，接入方迁移跑在它之后。
 * 合成一条链就没法表达这个先后，而先后正是「全有或全无」的全部依据（data-model.md §8）。
 *
 * 命名空间也因此不能混：系统迁移一律 `NNNN-` 数字前缀，接入方若撞名会在认领那一步
 * 被唯一索引挡下并报错，不会静默覆盖。
 */

import type { EntityManager } from '../../entity/entity-manager.js';
import type { MigrationType } from '../../rxdb.interface.js';
import { createWorkingTreeCommitsMigration } from './0004-working-tree-commits.js';

export {
  createWorkingTreeCommitsInitialRows,
  createWorkingTreeCommitsMigration,
  WORKING_TREE_COMMITS_MIGRATION_NAME
} from './0004-working-tree-commits.js';

/**
 * 造出全部 RxDB 系统迁移
 *
 * @param entityManager - 迁移用来 `instantiate()` 初始行的实体管理器
 * @returns 按声明顺序排列的系统迁移；`runMigrations()` 会再按名字排一次
 *
 * @remarks
 * 新库**不跑**这条链——初始行随 `createTables()` 一次写入，链里的名字由
 * `createMigrationWatermarks()` 直接写成已执行水位。只有既有库才真的执行 `up()`。
 */
export function createSystemMigrations(entityManager: EntityManager): MigrationType[] {
  return [createWorkingTreeCommitsMigration(entityManager)];
}
