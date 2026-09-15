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
import type { RxDBSystemContribution } from '../../rxdb-plugin-system.js';
import type { MigrationType } from '../../rxdb.interface.js';
import { capabilityWatermarkName } from '../capability-watermark.js';

/**
 * 把一次能力认领造成一条**空转迁移**
 *
 * @param contribution - 贡献方自报的能力、版本与包说明符
 * @returns `up()` 什么都不做、只为了让名字落进 `rxdb_migration` 的迁移
 *
 * @remarks
 * 认领行要在**两条**路径上都写出来：既有库走 `runMigrations()`，新库走
 * `createMigrationWatermarks()`。把它伪装成一条迁移，这两条路径就原样复用了，
 * 一行新的写代码都不用加——而各写一份正是漏掉其中一条的经典形态。
 *
 * 还白拿到两条保证：`runMigrationsOnce()` 先 INSERT 认领名再调 `up()`，于是排序与
 * 正确性无关；同批任一迁移失败时这条认领行跟着同一个事务回滚，不会留下「认领了、表没建成」
 * 的库。
 */
function createCapabilityClaimMigration(contribution: RxDBSystemContribution): MigrationType {
  return {
    name: capabilityWatermarkName(contribution),
    up: async () => undefined,
    down: async () => undefined
  };
}

/**
 * 造出全部 RxDB 系统迁移
 *
 * @param entityManager - 迁移用来 `instantiate()` 初始行的实体管理器
 * @param contributions - 已注册的插件系统贡献；每个贡献额外产出一条能力认领行
 * @returns 按声明顺序排列的系统迁移；`runMigrations()` 会再按名字排一次
 *
 * @remarks
 * 新库**不跑**这条链——初始行随 `createTables()` 一次写入，链里的名字由
 * `createMigrationWatermarks()` 直接写成已执行水位。只有既有库才真的执行 `up()`。
 *
 * **核心今天一条自带迁移都没有**，返回值全部来自插件贡献——`0004-working-tree-commits`
 * 随 `@aiao/rxdb-plugin-working-tree` 走了。空数组是合法且常见的结果：没装任何贡献系统
 * 能力的插件时，这条链本来就该是空的。函数不因此可以删——它是「贡献 → 迁移 + 认领行」
 * 这条展开规则的唯一实现处，两个调用点（既有库的 `runMigrations` 与新库的
 * `createMigrationWatermarks`）必须拿到逐字相同的清单。
 *
 * 插件贡献的迁移与核心（若将来又有）走**同一条**链、同一张表、同一把锁。不给插件单开一条
 * 的理由与系统链不并进接入方链是同一个：先后顺序是「全有或全无」的唯一依据，而并列的
 * 两条链表达不了先后。
 */
export function createSystemMigrations(
  entityManager: EntityManager,
  contributions: readonly RxDBSystemContribution[] = []
): MigrationType[] {
  return contributions.flatMap(contribution => [
    ...contribution.createMigrations(entityManager),
    createCapabilityClaimMigration(contribution)
  ]);
}
