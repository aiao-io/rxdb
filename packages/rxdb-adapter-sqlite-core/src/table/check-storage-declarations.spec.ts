/**
 * @fileoverview SQLite 生成列漂移的前缀契约：库里任何 `gc_` 列都归漂移检查管，不论是不是生成列。
 *
 * 用 mock 执行器喂建表 SQL 文本与 `PRAGMA table_xinfo` 行，走 `check_entity_constraints_sqlite` 的完整路径，
 * 断言最终的 {@link RxDBConstraintDriftError}：未声明的同前缀列算多余，声明了却是普通列的算定义不符。
 */

import {
  compileGeneratedColumn,
  Entity,
  EntityBase,
  generatedColumnsOf,
  getEntityMetadata,
  PropertyType,
  RxDBConstraintDriftError,
  type EntityType
} from '@aiao/rxdb';
import type { SQLInputValue } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { assertOo1Static, type Oo1Static } from '../oo1-types.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata } from '../sqlite-core.utils.js';
import { check_entity_constraints_sqlite } from './check-entity-constraints.js';

@Entity({
  name: 'DriftPlainRow',
  namespace: 'drift_fx',
  tableName: 'plain_row',
  log: false,
  properties: [{ name: 'ext', type: PropertyType.string, nullable: true }]
})
class DriftPlainRow extends EntityBase {
  ext!: string | null;
}

@Entity({
  name: 'DriftHotRow',
  namespace: 'drift_fx',
  tableName: 'hot_row',
  log: false,
  properties: [{ name: 'ext', type: PropertyType.string, nullable: true }],
  generatedColumns: [
    {
      name: 'rohs_hot',
      expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
    }
  ]
})
class DriftHotRow extends EntityBase {
  ext!: string | null;
}

/** 普通属性恰好以 gc_ 起头：它是实体自己声明的列，不归生成列漂移管。 */
@Entity({
  name: 'DriftOwnColumnRow',
  namespace: 'drift_fx',
  tableName: 'own_column_row',
  log: false,
  properties: [
    { name: 'ext', type: PropertyType.string, nullable: true },
    { name: 'gc_flag', type: PropertyType.string, nullable: true }
  ]
})
class DriftOwnColumnRow extends EntityBase {}

type CatalogRow = readonly SQLiteCompatibleType[];

const result = (columns: string[], rows: readonly CatalogRow[]): SqliteSuccessResult => ({
  sql: '',
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns, rows: rows.map(row => [...row]) }]
});

const hotColumn = () => {
  const metadata = getEntityMetadata(DriftHotRow);
  return compileGeneratedColumn(metadata, generatedColumnsOf(metadata)[0], 'sqlite');
};

/** `PRAGMA table_xinfo` 的一行：cid / name / type / notnull / dflt_value / pk / hidden（2 = 虚拟生成列）。 */
const xinfo = (cid: number, name: string, type: string, hidden: number): CatalogRow => [
  cid,
  name,
  type,
  0,
  null,
  name === 'id' ? 1 : 0,
  hidden
];

/** 单表目录：建表 SQL 文本 + `PRAGMA table_xinfo` 的列；没有索引与触发器。 */
const catalog = (entity: EntityType, definitions: readonly string[], columns: readonly CatalogRow[]) => {
  const tableName = get_table_name_by_metadata(getEntityMetadata(entity));
  const tableSql = `CREATE TABLE "${tableName}" (${['"id" TEXT PRIMARY KEY', '"ext" TEXT', ...definitions].join(', ')})`;
  const rows: readonly CatalogRow[] = [xinfo(0, 'id', 'TEXT', 0), xinfo(1, 'ext', 'TEXT', 0), ...columns];
  return {
    execute: vi.fn(async (sql: string, bindings?: unknown[]) => {
      if (sql.startsWith('PRAGMA table_xinfo')) {
        return result(['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk', 'hidden'], rows);
      }
      if (sql.includes("type = 'table'")) return result(['sql'], bindings?.[0] === tableName ? [[tableSql]] : []);
      return result(['name', 'sql'], []);
    })
  };
};

const generatedDefinition = (): string => {
  const column = hotColumn();
  return `"${column.columnName}" ${column.sqlType} GENERATED ALWAYS AS (${column.expression}) VIRTUAL`;
};

type CatalogExecutor = { execute(sql: string, bindings?: unknown[]): Promise<SqliteSuccessResult> };

const driftOf = async (executor: CatalogExecutor, entity: EntityType): Promise<RxDBConstraintDriftError> => {
  const error = await check_entity_constraints_sqlite(executor as never, [entity]).then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(RxDBConstraintDriftError);
  return error as RxDBConstraintDriftError;
};

describe('SQLite 生成列漂移：gc_ 前缀列全部纳入比对', () => {
  it('声明的生成列与库一致时不抛错', async () => {
    const column = hotColumn();
    const executor = catalog(DriftHotRow, [generatedDefinition()], [xinfo(2, column.columnName, column.sqlType, 2)]);
    await expect(check_entity_constraints_sqlite(executor as never, [DriftHotRow])).resolves.toBeUndefined();
  });

  it('与声明的生成列并存的用户普通 gc_ 列判多余', async () => {
    const column = hotColumn();
    const executor = catalog(
      DriftHotRow,
      [generatedDefinition(), '"gc_note" TEXT'],
      [xinfo(2, column.columnName, column.sqlType, 2), xinfo(3, 'gc_note', 'TEXT', 0)]
    );
    const drift = await driftOf(executor, DriftHotRow);
    expect(drift.missing).toEqual([]);
    expect(drift.extra).toEqual(['gc_note']);
    expect(drift.changed).toEqual([]);
    expect(drift.message).toContain('gc_');
  });

  it('未声明任何生成列的表上，用户普通 gc_ 列同样判多余', async () => {
    const executor = catalog(DriftPlainRow, ['"gc_note" TEXT'], [xinfo(2, 'gc_note', 'TEXT', 0)]);
    const drift = await driftOf(executor, DriftPlainRow);
    expect(drift.missing).toEqual([]);
    expect(drift.extra).toEqual(['gc_note']);
  });

  it('声明了生成列、库里同名的却是普通列：判定义不符而不是缺失（与 PGlite 同口径）', async () => {
    const column = hotColumn();
    const executor = catalog(
      DriftHotRow,
      [`"${column.columnName}" ${column.sqlType}`],
      [xinfo(2, column.columnName, column.sqlType, 0)]
    );
    const drift = await driftOf(executor, DriftHotRow);
    expect(drift.missing).toEqual([]);
    expect(drift.extra).toEqual([]);
    expect(drift.changed).toEqual([column.columnName]);
  });

  it('实体自己声明的同前缀普通属性列不算多余', async () => {
    const executor = catalog(DriftOwnColumnRow, ['"gc_flag" TEXT'], [xinfo(2, 'gc_flag', 'TEXT', 0)]);
    await expect(check_entity_constraints_sqlite(executor as never, [DriftOwnColumnRow])).resolves.toBeUndefined();
  });

  it('建表文本里没有 gc_ 且未声明生成列时不查 PRAGMA table_xinfo', async () => {
    const executor = catalog(DriftPlainRow, [], []);
    await expect(check_entity_constraints_sqlite(executor as never, [DriftPlainRow])).resolves.toBeUndefined();
    expect(executor.execute.mock.calls.some(([sql]) => String(sql).startsWith('PRAGMA'))).toBe(false);
  });
});

interface CatalogEngine {
  exec(sql: string): void;
  rows(sql: string, bindings?: unknown[]): CatalogRow[];
  close(): void;
}

let wasmModule: Promise<Oo1Static> | undefined;

/** 内存库：浏览器跑 sqlite-wasm，Node 模式跑内置 `node:sqlite`。 */
const openEngine = async (): Promise<CatalogEngine> => {
  if (typeof window === 'undefined') {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    return {
      exec: sql => db.exec(sql),
      rows: (sql, bindings = []) => {
        const statement = db.prepare(sql);
        statement.setReturnArrays(true);
        return statement.all(...(bindings as SQLInputValue[])) as unknown as CatalogRow[];
      },
      close: () => db.close()
    };
  }
  wasmModule ??= import('@sqlite.org/sqlite-wasm').then(async ({ default: init }) => {
    // 上游类型把初始化参数声明成无参，静默输出的选项只能经断言传入（同 memdb-backup-edge.spec.ts）
    const initModule = init as (options: Record<string, unknown>) => Promise<unknown>;
    const module = await initModule({ print: () => undefined, printErr: () => undefined });
    assertOo1Static(module);
    return module;
  });
  const db = new (await wasmModule).oo1.DB(':memory:');
  return {
    exec: sql => {
      db.exec({ sql });
    },
    rows: (sql, bindings) => {
      const resultRows: unknown[][] = [];
      db.exec({ sql, bind: bindings, rowMode: 'array', resultRows });
      return resultRows as CatalogRow[];
    },
    close: () => db.close()
  };
};

describe('SQLite 生成列漂移：真实引擎目录', () => {
  it('ALTER TABLE 补出的普通 gc_ 列在真实目录上判多余，声明的生成列照常一致', async () => {
    const engine = await openEngine();
    try {
      const tableName = get_table_name_by_metadata(getEntityMetadata(DriftHotRow));
      engine.exec(`CREATE TABLE "${tableName}" ("id" TEXT PRIMARY KEY, "ext" TEXT, ${generatedDefinition()})`);
      const executor: CatalogExecutor = {
        execute: async (sql, bindings) => result([], engine.rows(sql, bindings))
      };
      await expect(check_entity_constraints_sqlite(executor as never, [DriftHotRow])).resolves.toBeUndefined();

      engine.exec(`ALTER TABLE "${tableName}" ADD COLUMN "gc_note" TEXT`);
      const drift = await driftOf(executor, DriftHotRow);
      expect(drift.extra).toEqual(['gc_note']);
      expect(drift.changed).toEqual([]);
    } finally {
      engine.close();
    }
  });
});
