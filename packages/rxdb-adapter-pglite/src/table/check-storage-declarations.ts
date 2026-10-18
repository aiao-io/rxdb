import {
  advancedIndexesOf,
  compileAdvancedIndex,
  compileGeneratedColumn,
  generatedColumnsOf,
  storageExpressionIdentity,
  type EntityMetadata
} from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';

interface CatalogExecutor {
  queryRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>>;
}

interface ColumnEntry {
  name: string;
  type: string;
  generated: string;
  notNull: boolean;
  expression: string | null;
}

interface IndexEntry {
  name: string;
  method: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  partial: boolean;
  nullsNotDistinct: boolean;
  keys: number;
  expression: string | null;
  columns: string[];
  opclasses: string[];
  defaults: boolean[];
}

const COLUMN_SQL = `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
  a.attgenerated AS generated, a.attnotnull AS "notNull", pg_get_expr(d.adbin, d.adrelid, true) AS expression
  FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = $1 AND t.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND left(a.attname, 3) = 'gc_'`;

const INDEX_SQL = `SELECT c.relname AS name, am.amname AS method, i.indisunique AS "unique",
  i.indisvalid AS valid, i.indisready AS ready, i.indpred IS NOT NULL AS partial,
  i.indnullsnotdistinct AS "nullsNotDistinct", i.indnkeyatts AS keys,
  pg_get_expr(i.indexprs, i.indrelid, true) AS expression,
  ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum WHERE k.ord <= i.indnkeyatts ORDER BY k.ord) AS columns,
  ARRAY(SELECT o.opcname FROM unnest(i.indclass) WITH ORDINALITY k(oid, ord)
    JOIN pg_opclass o ON o.oid = k.oid ORDER BY k.ord) AS opclasses,
  ARRAY(SELECT o.opcdefault FROM unnest(i.indclass) WITH ORDINALITY k(oid, ord)
    JOIN pg_opclass o ON o.oid = k.oid ORDER BY k.ord) AS defaults
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_am am ON am.oid = c.relam
  WHERE n.nspname = $1 AND t.relname = $2 AND left(c.relname, 3) = 'sx_'`;

const sameExpression = (actual: string | null, expected: string | undefined): boolean => {
  if (actual === null || expected === undefined) return actual === null && expected === undefined;
  try {
    return storageExpressionIdentity(actual) === storageExpressionIdentity(expected);
  } catch {
    return false;
  }
};

/** 只读核对 PG 生成列与高级索引的表达式、类型、方法、运算符类和有效性。 */
export const checkStorageDeclarationsPGlite = async (
  executor: CatalogExecutor,
  metadata: EntityMetadata,
  tableMissing: boolean,
  hasGenerated: boolean,
  hasIndexes: boolean
): Promise<{ expected: string[]; actual: string[]; changed: string[] }> => {
  const columns = generatedColumnsOf(metadata).map(column => compileGeneratedColumn(metadata, column, 'postgres'));
  const indexes = advancedIndexesOf(metadata).flatMap(index => {
    const compiled = compileAdvancedIndex(metadata, index, 'postgres');
    return compiled === null ? [] : [compiled];
  });
  const expected = [...columns.map(column => column.columnName), ...indexes.map(index => index.name)];
  if (tableMissing) return { expected, actual: [], changed: [] };
  const params = [metadata.namespace, metadata.tableName];
  const catalogColumns =
    hasGenerated || columns.length > 0 ? (await executor.queryRaw<ColumnEntry>(COLUMN_SQL, params)).rows : [];
  const actualColumns = catalogColumns.filter(
    row => row.generated !== '' || columns.some(column => column.columnName === row.name)
  );
  const catalogIndexes = hasIndexes ? (await executor.queryRaw<IndexEntry>(INDEX_SQL, params)).rows : [];
  const actual = [...actualColumns.map(column => column.name), ...catalogIndexes.map(index => index.name)];
  const changed: string[] = [];
  for (const column of columns) {
    const row = actualColumns.find(row => row.name === column.columnName);
    if (row === undefined) continue;
    if (
      row.type.toUpperCase() !== column.sqlType ||
      row.notNull ||
      row.generated !== 's' ||
      !sameExpression(row.expression, column.expression)
    ) {
      changed.push(column.columnName);
    }
  }
  for (const index of indexes) {
    const row = catalogIndexes.find(row => row.name === index.name);
    if (row === undefined) continue;
    const classes =
      row.opclasses.length === row.keys &&
      (index.operatorClass === undefined ?
        row.defaults.every(value => value === true)
      : row.opclasses.length === 1 && row.opclasses[0] === index.operatorClass);
    if (
      row.method !== index.method ||
      row.unique !== index.unique ||
      !row.valid ||
      !row.ready ||
      row.partial ||
      row.nullsNotDistinct ||
      row.keys !== (index.expression === undefined ? index.columns.length : 1) ||
      JSON.stringify(row.columns) !== JSON.stringify(index.columns) ||
      !sameExpression(row.expression, index.expression) ||
      !classes
    ) {
      changed.push(index.name);
    }
  }
  return { expected, actual, changed };
};
