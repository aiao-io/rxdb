import type { EntityMetadata, EntityType, IEntity, IMutationContext } from '@aiao/rxdb';
import { GenerateSqlResult } from '../query/query_sql.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  EncryptionContext,
  get_primary_key_column,
  get_table_name_by_metadata,
  normalizeUpdateEntity,
  quote_sql_identifier,
  ROWID,
  transformEntityValueToSql
} from '../sqlite-core.utils.js';

export const update_sql = async <T extends EntityType>(
  metadata: EntityMetadata,
  entityOrEntities: InstanceType<T> | InstanceType<T>[],
  patch: Partial<InstanceType<T>>,
  context?: IMutationContext & { encryption?: EncryptionContext }
): Promise<GenerateSqlResult> => {
  const entityData: Partial<IEntity> = normalizeUpdateEntity(metadata, patch);
  if (Object.keys(entityData).length === 0) {
    throw new Error(`Empty patch for "${metadata.name}" — nothing to update, caller should no-op instead`);
  }
  if (metadata.propertyMap.has('updatedAt')) {
    entityData.updatedAt = context?.updatedAt ?? new Date();
  }
  if (context?.userId) {
    if (metadata.propertyMap.has('updatedBy')) entityData.updatedBy = context.userId;
  }

  const isArray = Array.isArray(entityOrEntities);
  const single = isArray ? entityOrEntities[0] : entityOrEntities;
  // entityData 的 key 是数据库列名，encryptedPropertyMap 的 key 是 JS 属性名，需反查后比对
  const encryptedPropertyMap = metadata.encryptedPropertyMap as ReadonlyMap<string, unknown> | undefined;
  const hasEncryptedPatch =
    context?.encryption?.keyring &&
    encryptedPropertyMap &&
    encryptedPropertyMap.size > 0 &&
    Object.keys(entityData).some(column => {
      const propertyName = metadata.columnNameToPropertyName?.get(column) ?? column;
      return encryptedPropertyMap.has(propertyName);
    });
  if (isArray && hasEncryptedPatch) {
    throw new Error('Batch UPDATE with encrypted columns is not supported — each row requires unique AAD');
  }
  const primaryKey = single?.id ?? '';
  const needSaveData = await transformEntityValueToSql(metadata, entityData, {
    ...context?.encryption,
    keyring: context?.encryption?.keyring ?? null,
    namespace: context?.encryption?.namespace ?? '',
    primaryKey
  });
  const setPlaceholders = Object.keys(needSaveData)
    .map(column => `${quote_sql_identifier(column)} = ?`)
    .join(',');
  const params = [...Object.values(needSaveData)] as SQLiteCompatibleType[];
  const tableName = get_table_name_by_metadata(metadata);

  // 主键物理列名可被 columnName 改写（SQLC-014）
  const primaryKeyColumn = quote_sql_identifier(get_primary_key_column(metadata));
  let whereClause: string;
  if (isArray) {
    if (entityOrEntities.length === 0) {
      whereClause = '1 = 0';
    } else {
      whereClause = `${primaryKeyColumn} in (${entityOrEntities.map(() => '?').join(',')})`;
      for (const e of entityOrEntities) params.push(e.id);
    }
  } else {
    whereClause = `${primaryKeyColumn} = ?`;
    params.push(entityOrEntities.id);
  }
  let sql = `UPDATE ${quote_sql_identifier(tableName)} SET ${setPlaceholders} WHERE ${whereClause}`;

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
