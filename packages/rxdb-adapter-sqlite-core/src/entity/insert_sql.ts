import type { EntityMetadata, EntityType, IEntity, IMutationContext } from '@aiao/rxdb';
import { GenerateSqlResult } from '../query/query_sql.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  EncryptionContext,
  get_table_name_by_metadata,
  normalizeCreateEntity,
  quote_sql_identifier,
  ROWID,
  transformEntityValueToSql
} from '../sqlite-core.utils.js';

/**
 * 生成插入 SQL 时的选项。
 */
export interface InsertSqlOptions extends IMutationContext {
  useReplace?: boolean;
  encryption?: EncryptionContext;
}

export const generate_upsert_clause = (primaryKeyColumn: string, columns: readonly string[]): string => {
  const conflictTarget = quote_sql_identifier(primaryKeyColumn);
  const updateColumns = columns.filter(column => column !== primaryKeyColumn);
  if (updateColumns.length === 0) return ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  const assignments = updateColumns
    .map(column => `${quote_sql_identifier(column)} = excluded.${quote_sql_identifier(column)}`)
    .join(',');
  return ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`;
};

/**
 * 生成创建实体的 sql 语句
 */
export const generate_entity_insert_sql = async <T extends EntityType>(
  metadata: EntityMetadata,
  entity: InstanceType<T>,
  context?: InsertSqlOptions
): Promise<GenerateSqlResult> => {
  const tableName = get_table_name_by_metadata(metadata);
  const entityData: Partial<IEntity> = normalizeCreateEntity(metadata, entity);
  // normalizeCreateEntity 的产物**以物理列名为键**，所以补审计字段也必须按物理列名读写。
  // 按 JS 属性名写会在 `@Property({ columnName: 'created_at' })` 下多出第二个键，
  // 两个键在 transformEntityValueToSql 里落到同一个物理列上、后写的赢 —— 表现是
  // 「只在缺省时才填」的探测永远落空，调用方传进来的 createdAt 被本机时钟静默盖掉
  // （备份恢复 / 历史导入 / sync-pull 保源时间戳全中招），而默认列名下又一切正常。
  const columns = entityData as Record<string, unknown>;
  const columnOf = (propertyName: string): string | undefined => metadata.propertyMap.get(propertyName)?.columnName;

  if (context?.userId) {
    const createdByColumn = columnOf('createdBy');
    const updatedByColumn = columnOf('updatedBy');
    if (createdByColumn !== undefined) columns[createdByColumn] = context.userId;
    if (updatedByColumn !== undefined) columns[updatedByColumn] = context.userId;
  }

  const now = new Date();
  const createdAtColumn = columnOf('createdAt');
  if (createdAtColumn !== undefined && columns[createdAtColumn] === undefined) {
    columns[createdAtColumn] = context?.createdAt ?? now;
  }
  const updatedAtColumn = columnOf('updatedAt');
  if (updatedAtColumn !== undefined && columns[updatedAtColumn] === undefined) {
    columns[updatedAtColumn] = context?.updatedAt ?? now;
  }

  const needSaveData = await transformEntityValueToSql(metadata, entityData, context?.encryption);
  const setColumns = Object.keys(needSaveData);
  const setPlaceholders = Array(setColumns.length).fill('?').join(',');
  const params = Object.values(needSaveData) as SQLiteCompatibleType[];

  let sql = `INSERT INTO ${quote_sql_identifier(tableName)} (${setColumns.map(quote_sql_identifier).join(',')}) VALUES (${setPlaceholders})`;
  if (context?.useReplace) {
    const primaryKeyColumn = metadata.propertyMap.get('id')?.columnName ?? 'id';
    sql += generate_upsert_clause(primaryKeyColumn, setColumns);
  }
  if (context?.returning !== false) {
    sql += ` RETURNING rowid as ${ROWID}, *;`;
  } else {
    sql += ';';
  }

  return {
    sql,
    params
  };
};
