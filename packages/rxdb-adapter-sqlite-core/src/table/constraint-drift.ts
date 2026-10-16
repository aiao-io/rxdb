/**
 * @fileoverview SQLite 侧的声明式存储约束漂移检查（只读）
 *
 * 在 `RxDB.connect()` 的用户迁移与缺表补建之后、与 `reconcileEntityIndexes` 同一时机调用。
 * 只比对 `ck_` / `uq_` / `ex_` 起头的对象（US-030 AC#16）：外键约束（作者原名）、
 * 普通索引（`idx_`）、系统 CRUD 触发器、FTS 触发器与插件自有触发器都不在范围。
 * 不一致抛 {@link RxDBConstraintDriftError}，列出缺失与多余的名字，不自动补建。
 */

import { EntityType, expectedStorageConstraintObjects, getEntityMetadata, RxDBConstraintDriftError } from '@aiao/rxdb';

/** 漂移检查要的最小执行面：bootstrapTransaction 的 executor 与单测替身都满足。 */
export interface SqliteDriftQueryExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

type DriftQueryShape = { columns: string[]; rows: unknown[][] };

/** sqlite_master 里 `type='index'` 且名字以 `uq_` 起头的对象（条件唯一索引）。 */
const UQ_INDEX_SQL = `SELECT name FROM sqlite_master WHERE type = 'index' AND substr(name, 1, 3) = 'uq_'`;

/** sqlite_master 里 `type='trigger'` 且名字以 `ex_` 起头的对象（排他触发器）。 */
const EX_TRIGGER_SQL = `SELECT name FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, 3) = 'ex_'`;

/** 建表 SQL 文本里的命名 CHECK 约束：`CONSTRAINT "ck_…" CHECK (…)`。 */
const CK_CONSTRAINT_RE = /CONSTRAINT\s+"(ck_[^"]+)"/g;

/** 把查询结果的 name 列全部收进集合。 */
const collectNames = (result: DriftQueryShape, into: Set<string>): void => {
  const nameIndex = result.columns.indexOf('name');
  if (nameIndex === -1) return;
  for (const row of result.rows) {
    into.add(String(row[nameIndex]));
  }
};

/**
 * 比对实体声明的约束与库里已有对象，不一致抛 {@link RxDBConstraintDriftError}
 *
 * @param executor - bootstrapTransaction 内的事务执行面
 * @param EntityTypes - 声明了存储约束的实体类型（调用方已过滤）
 */
export const checkSqliteConstraintDrift = async (
  executor: SqliteDriftQueryExecutor,
  EntityTypes: EntityType[]
): Promise<void> => {
  const expectedByEntity = new Map<string, string[]>();
  const expectedAll = new Set<string>();
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const { constraints, triggers } = expectedStorageConstraintObjects(metadata);
    // SQLite 没有排他约束对象：ex_ 声明只有两个触发器落库，期望集合扣掉约束名本身
    const names = [...constraints.filter(name => !name.startsWith('ex_')), ...triggers];
    expectedByEntity.set(metadata.name, names);
    names.forEach(name => expectedAll.add(name));
  }

  const actual = new Set<string>();
  collectNames((await executor.query(UQ_INDEX_SQL)) as DriftQueryShape, actual);
  collectNames((await executor.query(EX_TRIGGER_SQL)) as DriftQueryShape, actual);
  // ck_ 约束内联在建表 SQL 里，sqlite_master 没有独立对象行，从表定义文本提取
  const tableResult = (await executor.query(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL`
  )) as DriftQueryShape;
  const sqlIndex = tableResult.columns.indexOf('sql');
  if (sqlIndex !== -1) {
    for (const row of tableResult.rows) {
      const text = String(row[sqlIndex]);
      for (const match of text.matchAll(CK_CONSTRAINT_RE)) {
        actual.add(match[1]);
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
