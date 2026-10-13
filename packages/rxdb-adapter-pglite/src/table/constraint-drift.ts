/**
 * @fileoverview PGlite 侧的声明式存储约束漂移检查（只读）
 *
 * 与 sqlite-core 的 {@link ../../rxdb-adapter-sqlite-core/src/table/constraint-drift.ts} 同口径：
 * 只比对 `ck_` / `uq_` / `ex_` 起头的对象，不一致抛 {@link RxDBConstraintDriftError}、不自动补建。
 * PG 侧查 `pg_constraint`（CHECK `contype='c'` / EXCLUDE `contype='x'`）与
 * `pg_indexes`（条件唯一索引），按实体 schema 圈定范围。
 */

import { EntityType, expectedStorageConstraintObjects, getEntityMetadata, RxDBConstraintDriftError } from '@aiao/rxdb';

/** 漂移检查要的最小执行面：bootstrapTransaction 的 executor 与单测替身都满足。 */
export interface PgDriftQueryExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** executor.query 的实际返回形状（`{ rowsAffected, rows, columns }`，与 sqlite-core 同构）。 */
type DriftQueryShape = { columns: string[]; rows: unknown[][] };

/** 该 schema 内的 CHECK（`c`）与 EXCLUDE（`x`）约束名。 */
const PG_CONSTRAINT_SQL = `SELECT conname FROM pg_constraint WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1) AND (substr(conname, 1, 3) = 'ck_' OR substr(conname, 1, 3) = 'ex_')`;

/** 该 schema 内的条件唯一索引名（`CREATE UNIQUE INDEX … WHERE …`）。 */
const PG_UQ_INDEX_SQL = `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND substr(indexname, 1, 3) = 'uq_'`;

/**
 * 比对实体声明的约束与库里已有对象，不一致抛 {@link RxDBConstraintDriftError}
 *
 * @param executor - bootstrapTransaction 内的事务执行面
 * @param EntityTypes - 声明了存储约束的实体类型（调用方已过滤）
 */
export const checkPgliteConstraintDrift = async (
  executor: PgDriftQueryExecutor,
  EntityTypes: EntityType[]
): Promise<void> => {
  const expectedByEntity = new Map<string, string[]>();
  const expectedAll = new Set<string>();
  const schemas = new Set<string>();
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const { constraints } = expectedStorageConstraintObjects(metadata);
    expectedByEntity.set(metadata.name, constraints);
    constraints.forEach(name => expectedAll.add(name));
    schemas.add(metadata.namespace);
  }

  const actual = new Set<string>();
  for (const schema of schemas) {
    for (const result of await Promise.all([
      executor.query(PG_CONSTRAINT_SQL, [schema]) as Promise<DriftQueryShape>,
      executor.query(PG_UQ_INDEX_SQL, [schema]) as Promise<DriftQueryShape>
    ])) {
      const nameIndex = result.columns.indexOf('conname') !== -1 ? result.columns.indexOf('conname') : result.columns.indexOf('indexname');
      if (nameIndex === -1) continue;
      for (const row of result.rows) {
        actual.add(String(row[nameIndex]));
      }
    }
  }

  const driftedEntities: string[] = [];
  const missing = new Set<string>();
  for (const [entity, names] of expectedByEntity) {
    const missingHere = names.filter(name => !actual.has(name));
    if (missingHere.length === 0) continue;
    driftedEntities.push(entity);
    missingHere.forEach(name => missing.add(name));
  }
  const extra = [...actual].filter(name => !expectedAll.has(name)).sort();

  if (missing.size > 0 || extra.length > 0) {
    throw new RxDBConstraintDriftError(
      driftedEntities.length > 0 ? driftedEntities.join(', ') : '(none)',
      [...missing].sort(),
      extra
    );
  }
};
