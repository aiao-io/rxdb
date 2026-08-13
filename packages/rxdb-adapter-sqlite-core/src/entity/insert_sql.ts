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
  if (context?.userId) {
    if (metadata.propertyMap.has('createdBy')) entityData.createdBy = context.userId;
    if (metadata.propertyMap.has('updatedBy')) entityData.updatedBy = context.userId;
  }

  const now = new Date();
  if (metadata.propertyMap.has('createdAt') && entityData.createdAt === undefined) {
    entityData.createdAt = context?.createdAt ?? now;
  }
  if (metadata.propertyMap.has('updatedAt') && entityData.updatedAt === undefined) {
    entityData.updatedAt = context?.updatedAt ?? now;
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
