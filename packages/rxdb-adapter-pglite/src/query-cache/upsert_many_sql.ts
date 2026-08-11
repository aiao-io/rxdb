import type { EntityMetadata } from '@aiao/rxdb';
import {
  chunkByPgParamLimit,
  quoteIdentifier,
  RxdbAdapterPGliteError,
  transformEntityValueToSql,
  type EncryptionContext
} from '../pglite.utils.js';
import type { QueryCacheTarget } from './query_cache_target.js';

/** 一条参数化语句。 */
export interface QueryCacheStatement {
  sql: string;
  params: unknown[];
}

/**
 * 为 `upsertMany` 生成参数化的 INSERT … ON CONFLICT 语句。
 *
 * @remarks
 * 旧实现从 `data[0]` 取 `Object.keys` 当列名，导致四件事同时错：
 * 列名不经 `propertyMap` 映射、异构行按第一行的列集合截断、值不做类型转换与加密、
 * 未知键直接成为 SQL 标识符（且拼接时没有转义双引号）。
 *
 * 这里改为 metadata 驱动：
 * 1. 先校验键名白名单，未知键 **fail-fast**，不进入 SQL 结构；
 * 2. 每行各自过 `transformEntityValueToSql`（属性名/列名双向识别 + 类型转换 + 加密）；
 * 3. 按**规范化后的列集合**分组，每组一条语句 —— 异构行不再互相截断；
 * 4. 值一律参数化，并按 PG 参数上限分片。
 *
 * @param target - 已解析的物理定位信息
 * @param rows - 远端行（键名可以是 JS 属性名，也可以是物理列名）
 * @param encryption - 加密上下文；实体声明了加密列时必须提供已解锁的 keyring
 * @returns 待执行的参数化语句列表；无可写列时返回空数组
 * @throws {RxdbAdapterPGliteError} 存在不属于该实体的键
 */
export const buildQueryCacheUpsertStatements = async (
  target: QueryCacheTarget,
  rows: readonly object[],
  encryption?: EncryptionContext
): Promise<QueryCacheStatement[]> => {
  const normalizedRows: Record<string, unknown>[] = [];
  for (const row of rows) {
    assertKnownKeys(target.metadata, row);
    // primaryKey 刻意不显式传入：`transformEntityValueToSql` 默认取 `row.id`，
    // 与常规写入路径（entity/inserts_sql.ts）取的是同一个值。
    // 传一个不同的值会让加密 AAD 与常规路径分叉，密文将无法被读路径解开。
    normalizedRows.push(await transformEntityValueToSql(target.metadata, row, encryption));
  }

  const groups = groupByColumnSet(normalizedRows);
  const statements: QueryCacheStatement[] = [];

  for (const group of groups) {
    const { columns } = group;
    if (columns.length === 0) continue;
    const quotedColumns = columns.map(quoteIdentifier).join(', ');
    const conflictClause = buildOnConflictClause(target.idColumn, columns);

    for (const chunk of chunkByPgParamLimit(group.rows, columns.length)) {
      const params: unknown[] = [];
      const valueGroups = chunk.map((row, rowIndex) => {
        const offset = rowIndex * columns.length;
        const placeholders = columns.map((column, columnIndex) => {
          params.push(row[column] ?? null);
          return `$${offset + columnIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      statements.push({
        sql: `INSERT INTO ${target.tableName} (${quotedColumns}) VALUES ${valueGroups.join(', ')}${conflictClause}`,
        params
      });
    }
  }

  return statements;
};

/**
 * 生成 ON CONFLICT 子句。
 *
 * @remarks
 * 无可更新列时发 `DO NOTHING` —— 旧实现在这里会拼出空的 `DO UPDATE SET `，
 * 只带 id 的行必然语法错误。排除集合只有主键列，与 sqlite-core 的
 * `generate_upsert_clause` 同口径。
 */
const buildOnConflictClause = (idColumn: string, columns: readonly string[]): string => {
  const conflictTarget = quoteIdentifier(idColumn);
  const updateColumns = columns.filter(column => column !== idColumn);
  if (updateColumns.length === 0) return ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  const assignments = updateColumns
    .map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ');
  return ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`;
};

/** 按列集合把规范化后的行分组，组内列顺序稳定（字典序）。 */
const groupByColumnSet = (
  rows: readonly Record<string, unknown>[]
): { columns: string[]; rows: Record<string, unknown>[] }[] => {
  const groups = new Map<string, { columns: string[]; rows: Record<string, unknown>[] }>();
  for (const row of rows) {
    const columns = Object.keys(row)
      .filter(column => row[column] !== undefined)
      .sort();
    // 用 NUL 作分隔符：列名不可能含 NUL，拼出来的签名与列集合一一对应。
    // 必须写成转义 `\u0000`，直接写裸字节会让整个文件被 git 判为二进制。
    const signature = columns.join('\u0000');
    const group = groups.get(signature);
    if (group) group.rows.push(row);
    else groups.set(signature, { columns, rows: [row] });
  }
  return [...groups.values()];
};

/**
 * 校验行内所有键都属于该实体。
 *
 * @remarks
 * 接受 JS 属性名与物理列名两种写法 —— 远端行的形态由远端适配器决定
 * （`RxDBAdapterSupabase.findByIds` 走 `select('*')`），两种都可能出现，
 * `transformEntityValueToSql` 本身也是双向识别的。
 *
 * 未知键**不静默丢弃**：丢弃会把「本地 schema 与远端漂移」伪装成写入成功，
 * 缓存里留下一行缺字段的数据，且没有任何信号。
 */
const assertKnownKeys = (metadata: EntityMetadata, row: object): void => {
  const unknownKeys = Object.keys(row).filter(key => !isKnownKey(metadata, key));
  if (unknownKeys.length === 0) return;
  throw new RxdbAdapterPGliteError(
    `QueryCache: entity "${metadata.name}" has no property or column named ${unknownKeys.map(key => `"${key}"`).join(', ')}`
  );
};

const isKnownKey = (metadata: EntityMetadata, key: string): boolean =>
  metadata.propertyMap.has(key) ||
  metadata.columnNameToPropertyName?.has(key) === true ||
  (metadata.foreignKeyNames?.includes(key) ?? false) ||
  (metadata.foreignKeyColumnNames?.includes(key) ?? false);
