/**
 * @fileoverview PGlite 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的名字集合与目录里的实际集合。差集与抛错由核心
 * `assertNoEntityConstraintDrift` 承担（两后端同一份），本文件只做 PGlite 方言的读取：
 * - `ck_` CHECK：`pg_constraint` 里 `contype = 'c'` 的行；
 * - `ex_` 区间排他：`pg_constraint` 里 `contype = 'x'` 的行（`EXCLUDE` 约束）；
 * - `uq_` 条件唯一索引：`pg_indexes` 的行（`EXCLUDE` 的支撑索引同名也在这里，按前缀分开）。
 *
 * 每类对象只认自己的前缀。比对范围刻意收窄：外键约束（`contype = 'f'`，作者原名）、
 * `idx_` 普通索引、系统 CRUD 触发器与 FTS 触发器都不在范围——否则每张既有表首次
 * `init()` 就被报「多余」（AC#16）。
 */

import type { EntityType } from '@aiao/rxdb';
import {
  assertNoEntityConstraintDrift,
  CHECK_NAME_PREFIX,
  EXCLUSION_NAME_PREFIX,
  expectedCheckConstraintNames,
  expectedConditionalUniqueIndexNames,
  expectedExclusionConstraintNames,
  getEntityMetadata,
  UNIQUE_INDEX_NAME_PREFIX
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

/** 该表的全部 CHECK（`c`）与 EXCLUDE（`x`）约束名（含匿名自动命名），范围过滤在比对时做。 */
const CONSTRAINT_NAMES_SQL = `
  SELECT con.conname, con.contype
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE ns.nspname = $1 AND cls.relname = $2 AND con.contype IN ('c', 'x')
`;

/** 该表的全部索引名（主键、`idx_`、`uq_`、`EXCLUDE` 支撑索引都在），范围过滤在比对时做。 */
const INDEX_NAMES_SQL = `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`;

/**
 * PGlite 的漂移检查：元数据声明的 CHECK / 条件唯一索引 / 区间排他与目录里的实际对象逐表比对。
 *
 * @param adapter - PGlite 适配器实例的事务门面（`queryRaw` 落在当前事务里）
 * @param EntityTypes - 全部注册实体（含未声明 checks 的：删掉声明而未迁移的残留
 *   `ck_` 约束同样判为「多余」）
 * @throws {@link RxDBConstraintDriftError} 表缺失、或任一实体表出现缺失 / 多余的
 *   `ck_` / `uq_` / `ex_` 对象时（表缺失与约束漂移同口径 fail-fast，与 SQLite family 一致）
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
      const constraints = await adapter.queryRaw<{ conname: string; contype: string }>(CONSTRAINT_NAMES_SQL, params);
      const indexes = await adapter.queryRaw<{ indexname: string }>(INDEX_NAMES_SQL, params);
      actual = [
        // CHECK 只认 ck_、EXCLUDE 只认 ex_（查询只取了这两种）
        ...constraints.rows
          .filter(row => row.conname.startsWith(row.contype === 'x' ? EXCLUSION_NAME_PREFIX : CHECK_NAME_PREFIX))
          .map(row => row.conname),
        ...indexes.rows.map(row => row.indexname).filter(name => name.startsWith(UNIQUE_INDEX_NAME_PREFIX))
      ];
    }

    assertNoEntityConstraintDrift({
      entity: metadata.name,
      tableName: metadata.tableName,
      tableMissing,
      expected: [
        ...expectedCheckConstraintNames(metadata),
        ...expectedConditionalUniqueIndexNames(metadata),
        ...expectedExclusionConstraintNames(metadata)
      ],
      actual
    });
  }
};
