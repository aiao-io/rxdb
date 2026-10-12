/**
 * @fileoverview PGlite 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的约束名集合（阶段 A 只纳入 `ck_` 起头的对象）与
 * `pg_constraint` 里该表的 CHECK 约束（`contype = 'c'`）实际集合。不一致抛
 * `RxDBConstraintDriftError`，列出缺失与多余的名字，不自动补建——补建由用户写进
 * `migrations`（它恰好排在漂移检查之前执行）。
 *
 * 比对范围刻意收窄：外键约束（`contype = 'f'`，作者原名）、`idx_` 普通索引
 * （在 `pg_indexes`，不在 `pg_constraint`）、系统 CRUD 触发器与 FTS 触发器都不在
 * 范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。
 */

import { compileCheckConstraint, getEntityMetadata, RxDBConstraintDriftError, type EntityType } from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/** 漂移检查只读查询的最小接口：事务执行器门面的 `queryRaw`（行是对象，不是数组）。 */
type ConstraintCatalogQuerier = Pick<RxDBAdapterPGlite, never> & {
  queryRaw<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>>;
};

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
 * @throws {@link RxDBConstraintDriftError} 任一实体表出现缺失或多余的 `ck_` 约束时
 */
export const check_entity_constraints_pglite = async (
  adapter: ConstraintCatalogQuerier,
  EntityTypes: readonly EntityType[]
): Promise<void> => {
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const expected = new Set<string>();
    for (const check of metadata.checkMap.values()) {
      expected.add(compileCheckConstraint(metadata, check).name);
    }

    const result = await adapter.queryRaw<{ conname: string }>(CHECK_CONSTRAINT_NAMES_SQL, [
      metadata.namespace,
      metadata.tableName
    ]);
    // 表不存在时查不到任何约束行：缺表补建排在漂移检查之前，走到这里表必在；
    // 真有缺失就跳过该表（下一轮 connect 的 ensureEntityTables 会补建并带着约束建出来）。
    if (result.rows.length === 0 && expected.size === 0) continue;

    const actual = new Set(result.rows.map(row => row.conname).filter(name => name.startsWith('ck_')));
    const missing = Array.from(expected)
      .filter(name => !actual.has(name))
      .sort();
    const extra = Array.from(actual)
      .filter(name => !expected.has(name))
      .sort();
    if (missing.length > 0 || extra.length > 0) {
      throw new RxDBConstraintDriftError(metadata.name, metadata.tableName, missing, extra);
    }
  }
};
