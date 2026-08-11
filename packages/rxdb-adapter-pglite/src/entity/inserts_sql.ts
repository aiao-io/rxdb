import type { EntityMetadata, EntityType, IEntity, IQueryContext, RxDBEntityId } from '@aiao/rxdb';
import {
  type EncryptionContext,
  getSqlValue,
  getTableNameByMetadata,
  normalizeCreateEntity,
  quoteIdentifier,
  transformEntityValueToSql
} from '../pglite.utils.js';
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

const generateEntityInsertsSql = async <T extends EntityType>(
  metadata: EntityMetadata,
  entities: InstanceType<T>[],
  context?: IQueryContext,
  encryption?: EncryptionContext,
  upsert = false
): Promise<string> => {
  const createdBy = Boolean(context?.userId && metadata.propertyMap.has('createdBy'));
  const updatedBy = Boolean(context?.userId && metadata.propertyMap.has('updatedBy'));
  const rows: Record<string, unknown>[] = [];
  const columns = new Set<string>();

  for (const entity of entities) {
    const entityData: Record<string, unknown> = normalizeCreateEntity(metadata, entity);
    if (createdBy) entityData.createdBy = context?.userId;
    if (updatedBy) entityData.updatedBy = context?.userId;
    const primaryKey = (entityData.id as RxDBEntityId | null | undefined) ?? '';
    const transformed = await transformEntityValueToSql(
      metadata,
      entityData as Partial<IEntity>,
      encryption ? { ...encryption, primaryKey } : undefined
    );
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
  const conflictClause =
    updateColumns.length === 0 ?
      ` ON CONFLICT (${quoteIdentifier(primaryColumn)}) DO NOTHING`
    : ` ON CONFLICT (${quoteIdentifier(primaryColumn)}) DO UPDATE SET ${assignments}`;

  return `INSERT INTO ${getTableNameByMetadata(metadata)} (${quotedColumns}) VALUES ${valueGroups.join(',')}${upsert ? conflictClause : ''};`;
};

export const generate_entity_upserts_sql = <T extends EntityType>(
  metadata: EntityMetadata,
  entities: InstanceType<T>[],
  context?: IQueryContext,
  encryption?: EncryptionContext
): Promise<string> => generateEntityInsertsSql(metadata, dedupeEntitiesForUpsert(entities), context, encryption, true);

export default generateEntityInsertsSql;
