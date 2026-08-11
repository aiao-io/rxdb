import type { EntityMetadata, EntityType, IEntity, IQueryContext } from '@aiao/rxdb';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  EncryptionContext,
  get_table_name_by_metadata,
  normalizeCreateEntity,
  quote_sql_identifier,
  transformEntityValueToSql
} from '../sqlite-core.utils.js';

/**
 * 计算批量 INSERT SQL 每行的列数（占位符数）。
 *
 * 与 {@link generate_entity_inserts_sql} 共享列计算逻辑，供调用方按 SQLite 绑定上限（999）分批。
 * 若 insert SQL 未来新增隐式列，仅需此处同步，单一事实源。
 */
export const get_insert_column_count = (metadata: EntityMetadata): number =>
  metadata.propertyMap.size + Array.from(metadata.foreignKeyColumnNames || metadata.foreignKeyNames || []).length;

/**
 * 生成批量创建实体的参数化 SQL
 */
export const generate_entity_inserts_sql = async <T extends EntityType>(
  metadata: EntityMetadata,
  entities: InstanceType<T>[],
  context?: IQueryContext,
  encryption?: EncryptionContext
): Promise<{ sql: string; params: SQLiteCompatibleType[] }> => {
  const tableName = get_table_name_by_metadata(metadata);
  if (entities.length === 0) return { sql: '', params: [] };
  const createdBy = context?.userId && metadata.propertyMap.has('createdBy');
  const updatedBy = context?.userId && metadata.propertyMap.has('updatedBy');
  const hasCreatedAt = metadata.propertyMap.has('createdAt');
  const hasUpdatedAt = metadata.propertyMap.has('updatedAt');
  const now = new Date();
  const setColumns = [
    ...Array.from(metadata.propertyMap.values()).map(p => p.columnName),
    ...(metadata.foreignKeyColumnNames || metadata.foreignKeyNames)
  ];
  const columnCount = setColumns.length;
  const rowPlaceholder = `(${new Array(columnCount).fill('?').join(',')})`;
  // 批量 INSERT 固定写全列，缺省字段不会走 SQLite DEFAULT，需在此显式补 metadata default
  const defaultProperties = Array.from(metadata.propertyMap.values()).filter(p => p.default !== undefined);

  const params: SQLiteCompatibleType[] = [];
  const placeholders: string[] = new Array(entities.length);
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const entityData: Partial<IEntity> = normalizeCreateEntity(metadata, entity);
    for (const property of defaultProperties) {
      if ((entityData as Record<string, unknown>)[property.columnName] === undefined) {
        const resolvedDefault = typeof property.default === 'function' ? property.default() : property.default;
        // 'CURRENT_TIMESTAMP' 是数据库端默认值的哨兵值，批量 insert 绕过了 DB DEFAULT，需在此转成真实时间戳
        (entityData as Record<string, unknown>)[property.columnName] =
          resolvedDefault === 'CURRENT_TIMESTAMP' ? now : resolvedDefault;
      }
    }
    if (createdBy) entityData.createdBy = context.userId;
    if (updatedBy) entityData.updatedBy = context.userId;
    if (hasCreatedAt && entityData.createdAt === undefined) entityData.createdAt = now;
    if (hasUpdatedAt && entityData.updatedAt === undefined) entityData.updatedAt = now;
    const needSaveData = await transformEntityValueToSql(metadata, entityData, encryption);
    for (let j = 0; j < columnCount; j++) {
      params.push(needSaveData[setColumns[j]] ?? null);
    }
    placeholders[i] = rowPlaceholder;
  }

  const sql = `INSERT INTO ${quote_sql_identifier(tableName)} (${setColumns.map(quote_sql_identifier).join(',')}) VALUES ${placeholders.join(',')};`;
  return { sql, params };
};
