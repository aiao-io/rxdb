/**
 * @fileoverview PGlite 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的约束名集合（阶段 A 只纳入 `ck_` 起头的对象）与
 * `pg_constraint` 里该表的 CHECK 约束（`contype = 'c'`）实际集合。差集与抛错由
 * 核心 `assertNoEntityConstraintDrift` 承担（两后端同一份），本文件只做 PGlite
 * 方言的两件事：查表存在性、读 `ck_` 起头的实际约束名。
 *
 * 比对范围刻意收窄：外键约束（`contype = 'f'`，作者原名）、`idx_` 普通索引
 * （在 `pg_indexes`，不在 `pg_constraint`）、系统 CRUD 触发器与 FTS 触发器都不在
 * 范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。
 */

import type { EntityType } from '@aiao/rxdb';
import {
  assertNoEntityConstraintDrift,
  expectedCheckConstraintNames,
  getEntityMetadata,
  inDriftScope
} from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/** 漂移检查只读查询的最小接口：事务执行器门面的 `queryRaw`（行是对象，不是数组）。 */
type ConstraintCatalogQuerier = Pick<RxDBAdapterPGlite, never> & {
  queryRaw<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>>;
};

/** 表是否存在于 pg_class（表缺失与「有表但无 CHECK 行」在 pg_constraint 上同形，须分开问）。 */
const TABLE_EXISTS_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = $1 AND cls.relname = $2
  ) AS exists
`;

/** 该表的全部 CHECK 约束名（含匿名自动命名与 ck_ 声明约束），范围过滤在比对时做。 */
const CHECK_CONSTRAINT_NAMES_SQL = `
  SELECT con.conname
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE ns.nspname = $1 AND cls.relname = $2 AND con.contype = 'c'
`;

/**
 * PGlite 的漂移检查：元数据声明的 CHECK 与 `pg_constraint` 里的实际 CHECK 逐表比对。
 *
 * @param adapter - PGlite 适配器实例的事务门面（`queryRaw` 落在当前事务里）
 * @param EntityTypes - 全部注册实体（含未声明 checks 的：删掉声明而未迁移的残留
 *   `ck_` 约束同样判为「多余」）
 * @throws {@link RxDBConstraintDriftError} 表缺失、或任一实体表出现缺失 / 多余的
 *   `ck_` 约束时（表缺失与约束漂移同口径 fail-fast，与 SQLite family 一致）
 */
export const check_entity_constraints_pglite = async (
  adapter: ConstraintCatalogQuerier,
  EntityTypes: readonly EntityType[]
): Promise<void> => {
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const params = [metadata.namespace, metadata.tableName];

    const existence = await adapter.queryRaw<{ exists: boolean }>(TABLE_EXISTS_SQL, params);
    const tableMissing = existence.rows.length === 0 || existence.rows[0].exists !== true;

    let actual: string[] = [];
    if (!tableMissing) {
      const result = await adapter.queryRaw<{ conname: string }>(CHECK_CONSTRAINT_NAMES_SQL, params);
      actual = result.rows.map(row => row.conname).filter(name => inDriftScope(name));
    }

    assertNoEntityConstraintDrift({
      entity: metadata.name,
      tableName: metadata.tableName,
      tableMissing,
      expected: expectedCheckConstraintNames(metadata),
      actual
    });
  }
};
