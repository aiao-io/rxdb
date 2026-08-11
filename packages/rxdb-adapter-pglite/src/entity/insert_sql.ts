import type { EntityMetadata, IEntity, IMutationContext, RxDBEntityId } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';
import {
  type EncryptionContext,
  getTableNameByMetadata,
  normalizeCreateEntity,
  quoteIdentifier,
  transformEntityValueToSql
} from '../pglite.utils.js';

export interface InsertSqlOptions extends IMutationContext {
  encryption?: EncryptionContext;
}

/**
 * 该列是否为由数据库序列赋值的主键（`integer primary` → 建表时写成 `serial`）。
 *
 * @remarks
 * 这类主键的值必须**整列缺席**于 INSERT，序列才会赋值。显式绑定 `null` 会覆盖
 * `DEFAULT nextval(...)`，直接违反 NOT NULL。SQLite 侧不会暴露这个问题——那边
 * `INTEGER PRIMARY KEY` 是 rowid 别名，插 NULL 会自动取号。
 *
 * 触发路径：`RxDBMigration`（`id` 为 `integer primary`、无默认值）既可能由仓库单条写入，
 * 也可能作为首装初始数据批量写入；两条路径必须保持相同的序列语义。
 */
export const isSequenceAssignedPrimaryColumn = (metadata: EntityMetadata, column: string): boolean => {
  const propertyName = metadata.columnNameToPropertyName?.get(column) ?? column;
  const property = metadata.propertyMap.get(propertyName);
  if (!property) return false;
  return Reflect.get(property, 'primary') === true && property.type === PropertyType.integer;
};

export default async (
  metadata: EntityMetadata,
  entity: object,
  context?: InsertSqlOptions
): Promise<{ sql: string; params: unknown[]; columns: string[] }> => {
  const entityData: Record<string, unknown> = normalizeCreateEntity(metadata, entity);

  if (context?.userId) {
    if (metadata.propertyMap.has('createdBy')) entityData.createdBy = context.userId;
    if (metadata.propertyMap.has('updatedBy')) entityData.updatedBy = context.userId;
  }

  const primaryKey = (entityData.id as RxDBEntityId | null | undefined) ?? '';
  const transformed = await transformEntityValueToSql(
    metadata,
    entityData as Partial<IEntity>,
    context?.encryption ? { ...context.encryption, primaryKey } : undefined
  );
  const entries = Object.entries(transformed).filter(([column, value]) => {
    if (value === undefined) return false;
    // 序列主键留空由数据库取号；绑 null 会覆盖 DEFAULT nextval(...) 并违反 NOT NULL
    if (value === null && isSequenceAssignedPrimaryColumn(metadata, column)) return false;
    return true;
  });
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(',');
  const params = entries.map(([, value]) => value);
  const placeholders = params.map((_, index) => `$${index + 1}`).join(',');
  const returning = context?.returning === false ? '' : ' RETURNING *';

  return {
    sql: `INSERT INTO ${getTableNameByMetadata(metadata)} (${columns}) VALUES (${placeholders})${returning};`,
    params,
    // 实际写入的物理列名（未加引号）。upsert 的 ON CONFLICT 列集合必须由它决定，
    // 而不是另行从 metadata 推算 —— 两边各算各的就会对不上（PGL-010）。
    columns: entries.map(([column]) => column)
  };
};
