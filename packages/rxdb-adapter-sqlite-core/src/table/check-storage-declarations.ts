import {
  advancedIndexesOf,
  compileAdvancedIndex,
  compileGeneratedColumn,
  generatedColumnsOf,
  quoteSqlIdentifier,
  sqlStringLiteral,
  storageExpressionIdentity,
  storageGeneratedExpressions,
  storageIndexExpressions,
  type EntityMetadata
} from '@aiao/rxdb';
import type { SqliteResult } from '../sqlite-core.interface.js';

/** SQLite 目录中索引的原始声明。 */
export interface StorageIndexCatalogEntry {
  name: string;
  sql: string;
}

interface CatalogExecutor {
  execute(sql: string, params?: unknown[]): Promise<SqliteResult>;
}

const rowsOf = async (executor: CatalogExecutor, sql: string): Promise<unknown[][]> =>
  (await executor.execute(sql)).results[0]?.rows ?? [];

const sameExpressions = (actual: readonly string[], expected: readonly string[]): boolean => {
  try {
    return (
      actual.length === expected.length &&
      actual.every((value, index) => storageExpressionIdentity(value) === storageExpressionIdentity(expected[index]))
    );
  } catch {
    return false;
  }
};

const sameIndexExpressions = (sql: string, expected: readonly string[]): boolean => {
  try {
    return sameExpressions(storageIndexExpressions(sql), expected);
  } catch {
    return false;
  }
};

/** 只读核对 SQLite 托管生成列和高级索引的实际定义。 */
export const checkStorageDeclarationsSqlite = async (
  executor: CatalogExecutor,
  metadata: EntityMetadata,
  tableName: string,
  tableSql: string,
  indexes: readonly StorageIndexCatalogEntry[],
  tableMissing: boolean
): Promise<{ expected: string[]; actual: string[]; changed: string[] }> => {
  const columns = generatedColumnsOf(metadata).map(column => compileGeneratedColumn(metadata, column, 'sqlite'));
  const declarations = advancedIndexesOf(metadata).flatMap(index => {
    const compiled = compileAdvancedIndex(metadata, index, 'sqlite');
    return compiled === null ? [] : [compiled];
  });
  const expected = [...columns.map(column => column.columnName), ...declarations.map(index => index.name)];
  if (tableMissing) return { expected, actual: [], changed: [] };
  const expressions = storageGeneratedExpressions(tableSql);
  const managed = indexes.filter(index => index.name.startsWith('sx_'));
  // gc_ 是托管列的保留前缀：实际集合按目录里的全部同前缀列取，而不是只取带表达式的生成列——
  // 否则用户自建的同前缀普通列不报多余。建表文本含全部列名，里面没有 gc_ 就不必再查目录。
  const catalog =
    columns.length > 0 || tableSql.includes('gc_') ?
      await rowsOf(executor, `PRAGMA table_xinfo(${sqlStringLiteral(tableName)})`)
    : [];
  // 实体自己声明的属性 / 外键列即便同前缀也是已声明对象，不算多余
  const ownColumns = new Set([...metadata.columnNameToPropertyName.keys(), ...metadata.foreignKeyColumnNames]);
  const actual = [
    ...catalog.map(row => String(row[1])).filter(name => name.startsWith('gc_') && !ownColumns.has(name)),
    ...managed.map(index => index.name)
  ];
  const changed: string[] = [];
  for (const column of columns) {
    const row = catalog.find(row => row[1] === column.columnName);
    if (row === undefined) continue;
    const sql = expressions.get(column.columnName);
    if (
      String(row[2]).toUpperCase() !== column.sqlType ||
      row[3] !== 0 ||
      row[6] !== 2 ||
      sql === undefined ||
      !sameExpressions([sql], [column.expression])
    )
      changed.push(column.columnName);
  }
  const indexList =
    managed.length > 0 ? await rowsOf(executor, `PRAGMA index_list(${sqlStringLiteral(tableName)})`) : [];
  for (const index of declarations) {
    const entry = managed.find(value => value.name === index.name);
    if (entry === undefined) continue;
    const flags = indexList.find(row => row[1] === index.name);
    const keys = (await rowsOf(executor, `PRAGMA index_xinfo(${sqlStringLiteral(index.name)})`)).filter(
      row => row[5] === 1
    );
    const targets = index.expression === undefined ? index.columns.map(quoteSqlIdentifier) : [index.expression];
    const matches = sameIndexExpressions(entry.sql, targets);
    if (
      !matches ||
      Number(flags?.[2]) !== Number(index.unique) ||
      flags?.[4] !== 0 ||
      keys.some(row => row[3] !== 0 || String(row[4]).toUpperCase() !== 'BINARY')
    )
      changed.push(index.name);
  }
  return { expected, actual, changed };
};
