import { EntityMetadata, EntityType, IEntity, IMutationContext } from '@aiao/rxdb';
import {
  EncryptionContext,
  getTableNameByMetadata,
  normalizeEntity,
  transformEntityValueToSql
} from '../pglite.utils.js';

export interface UpdateSqlOptions extends IMutationContext {
  encryption?: EncryptionContext;
}

/**
 * 生成更新一个或多个实体的 SQL
 */
const generate_entity_update_sql = async <T extends EntityType>(
  metadata: EntityMetadata,
  entityOrEntities: InstanceType<T> | InstanceType<T>[],
  patch: Partial<InstanceType<T>>,
  context?: UpdateSqlOptions
) => {
  // 规范化更新数据（过滤只读字段）
  const entityData: Partial<IEntity> = normalizeEntity(metadata, patch);

  // 设置更新时间戳
  if (metadata.propertyMap.has('updatedAt')) {
    entityData.updatedAt = context?.updatedAt ?? new Date();
  }

  // 从 context 取 updatedBy
  if (context?.userId) {
    if (metadata.propertyMap.has('updatedBy')) entityData.updatedBy = context.userId;
  }

  const isArray = Array.isArray(entityOrEntities);
  const single = isArray ? undefined : entityOrEntities;
  const hasEncryptedPatch =
    context?.encryption?.keyring &&
    metadata.encryptedPropertyMap &&
    (metadata.encryptedPropertyMap as ReadonlyMap<string, unknown>).size > 0 &&
    Object.keys(entityData).some(k => (metadata.encryptedPropertyMap as ReadonlyMap<string, unknown>).has(k));
  if (isArray && hasEncryptedPatch) {
    throw new Error('Batch UPDATE with encrypted columns is not supported — each row requires unique AAD');
  }
  const primaryKey = single?.id ?? '';
  const needSaveData = await transformEntityValueToSql(
    metadata,
    entityData,
    context?.encryption ? { ...context.encryption, primaryKey } : undefined
  );
  // 使用变换后的列名作为占位符，保证列与值始终一一对应。
  // 否则当属性的 columnName 与 JS 属性名不一致时，会出现列数与参数数错位。
  const columns = Object.keys(needSaveData);

  // PostgreSQL：SET 子句使用 $1、$2、$3 等占位符
  // 用双引号包列名以保留大小写
  const setPlaceholders = columns.map((column, i) => `"${column}" = $${i + 1}`).join(',');
  const params = Object.values(needSaveData);

  const tableName = getTableNameByMetadata(metadata);
  const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];

  let sql = `UPDATE ${tableName} SET ${setPlaceholders} WHERE id `;

  if (Array.isArray(entityOrEntities)) {
    // 多实体：用 = ANY($N) 配合数组参数
    const paramIndex = params.length + 1;
    sql += `= ANY($${paramIndex})`;
    params.push(entities.map(e => e.id));
  } else {
    // 单实体：用 = $N
    const paramIndex = params.length + 1;
    sql += `= $${paramIndex}`;
    params.push(entityOrEntities.id);
  }

  if (context?.returning !== false) {
    sql += ` RETURNING *;`;
  } else {
    sql += ';';
  }

  return {
    sql,
    params
  };
};

export default generate_entity_update_sql;
