import type { EntityMetadata, EntityType, IEntity, IQueryContext, RxDBEntityId, WorktreeTableSet } from '@aiao/rxdb';
import {
  type EncryptionContext,
  getSqlValue,
  normalizeCreateEntity,
  quoteIdentifier,
  transformEntityValueToSql
} from '../pglite.utils.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';
import { fillEncryptedDefaults } from './encrypted-defaults.js';
import { isSequenceAssignedPrimaryColumn } from './insert_sql.js';

const IMMUTABLE_ON_CONFLICT_PROPERTIES = ['id', 'createdAt', 'createdBy'] as const;

const dedupeEntitiesForUpsert = <T extends EntityType>(entities: InstanceType<T>[]): InstanceType<T>[] => {
  const seen = new Set<RxDBEntityId>();
  const result: InstanceType<T>[] = [];
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index];
    const id = Reflect.get(entity, 'id') as RxDBEntityId | null | undefined;
    if (id !== null && id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    result.push(entity);
  }
  return result.reverse();
};

/**
 * 主键已经存在时怎么办
 *
 * - `error`：照常报主键冲突（普通实体的新建）
 * - `update`：按新值更新可变列（upsert）
 * - `ignore`：保留库里那一行，什么都不改。多对多中间表的行 id 由两端确定性派生（US-228），
 *   同 id 就是同一对，库里已有这一对时新建退化成空操作，不报错、也不多记一条变更
 */
export type InsertConflictMode = 'error' | 'update' | 'ignore';

const generateEntityInsertsSql = async <T extends EntityType>(
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  entities: InstanceType<T>[],
  context?: IQueryContext,
  encryption?: EncryptionContext,
  conflict: InsertConflictMode = 'error'
): Promise<string> => {
  const createdBy = Boolean(context?.userId && metadata.propertyMap.has('createdBy'));
  const updatedBy = Boolean(context?.userId && metadata.propertyMap.has('updatedBy'));
  const rows: Record<string, unknown>[] = [];
  const columns = new Set<string>();
  const now = new Date();

  for (const entity of entities) {
    const entityData: Record<string, unknown> = normalizeCreateEntity(metadata, entity);
    if (createdBy) entityData['createdBy'] = context?.userId;
    if (updatedBy) entityData['updatedBy'] = context?.userId;
    // 加密列的 DDL 不带 DEFAULT：缺省的逐行补上再封信封，不能留给 `DEFAULT` 关键字（那会写成 NULL）
    fillEncryptedDefaults(metadata, entityData, now);
    // 主键交给 transformEntityValueToSql 取：entityData 按物理列名为键，自定义主键列下没有 `id`
    const transformed = await transformEntityValueToSql(metadata, entityData as Partial<IEntity>, encryption);
    rows.push(transformed);
    Object.entries(transformed).forEach(([column, value]) => {
      if (value !== undefined && !(value === null && isSequenceAssignedPrimaryColumn(metadata, column))) {
        columns.add(column);
      }
    });
  }

  const setColumns = [...columns];
  const valueGroups = rows.map(row => {
    const values = setColumns.map(column => {
      const value = row[column];
      if (value === undefined || (value === null && isSequenceAssignedPrimaryColumn(metadata, column))) {
        return 'DEFAULT';
      }
      return getSqlValue(value);
    });
    return `(${values.join(',')})`;
  });
  const quotedColumns = setColumns.map(quoteIdentifier).join(',');
  const primaryColumn = metadata.propertyMap.get('id')?.columnName ?? 'id';
  const immutableColumns = new Set(
    IMMUTABLE_ON_CONFLICT_PROPERTIES.map(property => metadata.propertyMap.get(property)?.columnName ?? property)
  );
  const updateColumns = setColumns.filter(column => !immutableColumns.has(column));
  const assignments = updateColumns
    .map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(',');
  const ignoreClause = ` ON CONFLICT (${quoteIdentifier(primaryColumn)}) DO NOTHING`;
  const conflictClauses: Record<InsertConflictMode, string> = {
    error: '',
    update:
      updateColumns.length === 0 ? ignoreClause : (
        ` ON CONFLICT (${quoteIdentifier(primaryColumn)}) DO UPDATE SET ${assignments}`
      ),
    ignore: ignoreClause
  };

  return `INSERT INTO ${getTableNameByMetadata(metadata, tableSet)} (${quotedColumns}) VALUES ${valueGroups.join(',')}${conflictClauses[conflict]};`;
};

export const generate_entity_upserts_sql = <T extends EntityType>(
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  entities: InstanceType<T>[],
  context?: IQueryContext,
  encryption?: EncryptionContext
): Promise<string> =>
  generateEntityInsertsSql(metadata, tableSet, dedupeEntitiesForUpsert(entities), context, encryption, 'update');

export default generateEntityInsertsSql;
