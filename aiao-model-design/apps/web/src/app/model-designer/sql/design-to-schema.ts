/**
 * Design 快照 → SqlSchema
 */
import { mapPropertyTypeToPg } from './property-type-map';
import { quoteIdent } from './quote';
import type {
  DesignSqlInput,
  DesignSqlInputEntity,
  DesignSqlInputProperty,
  SqlColumn,
  SqlForeignKey,
  SqlIndex,
  SqlSchema,
  SqlTable
} from './types';

const ENTITY_BASE_COLUMNS: SqlColumn[] = [
  { name: 'id', type: 'uuid', nullable: false, primaryKey: true, unique: true },
  { name: 'created_at', type: 'timestamptz', nullable: false },
  { name: 'updated_at', type: 'timestamptz', nullable: false },
  { name: 'created_by', type: 'text', nullable: true },
  { name: 'updated_by', type: 'text', nullable: true }
];

/**
 * 解析物理表名：优先 tableName，否则 snake_case(name)
 */
export function resolveTableName(entity: DesignSqlInputEntity): string {
  const raw = entity.tableName?.trim();
  if (raw) return raw;
  return toSnakeCase(entity.name);
}

/**
 * 解析物理列名
 */
export function resolveColumnName(property: DesignSqlInputProperty): string {
  const raw = property.columnName?.trim();
  if (raw) return raw;
  return toSnakeCase(property.name);
}

function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function compareSort(a: { sortOrder?: string }, b: { sortOrder?: string }): number {
  return (a.sortOrder ?? '').localeCompare(b.sortOrder ?? '');
}

function isFkSide(kind: string): boolean {
  return kind === 'MANY_TO_ONE' || kind === 'ONE_TO_ONE';
}

/**
 * 将 ModelDesign 相关实体转换为 SqlSchema
 */
export function designToSqlSchema(input: DesignSqlInput): SqlSchema {
  const propsByEntity = new Map<string, DesignSqlInputProperty[]>();
  for (const prop of input.properties) {
    const entityId = input.propertyEntityIds[prop.id];
    if (!entityId) continue;
    const list = propsByEntity.get(entityId) ?? [];
    list.push(prop);
    propsByEntity.set(entityId, list);
  }

  const tables: SqlTable[] = input.entities.map(entity => {
    const includeBase = !entity.extendsBase || entity.extendsBase === 'EntityBase';
    const columns: SqlColumn[] = includeBase ? [...ENTITY_BASE_COLUMNS] : [];
    const props = [...(propsByEntity.get(entity.id) ?? [])].sort(compareSort);

    for (const prop of props) {
      const colName = resolveColumnName(prop);
      const mapping = mapPropertyTypeToPg(prop.propertyType, prop.enumValues, quoteIdent(colName));
      const nullable =
        prop.isNullable === true ? true
        : prop.isRequired === true ? false
        : prop.isRequired === false ? true
        : false;
      columns.push({
        name: colName,
        type: mapping.type,
        nullable,
        unique: prop.isUnique === true,
        defaultValue: prop.defaultValue ?? null,
        check: mapping.check ?? null
      });
    }

    const foreignKeys: SqlForeignKey[] = [];
    for (const rel of input.relations) {
      if (rel.designEntityId !== entity.id) continue;
      if (!isFkSide(rel.relationKind)) continue;
      const target = input.entities.find(e => e.id === rel.mappedEntityId);
      if (!target) continue;
      const fkCol = rel.columnName?.trim() || toSnakeCase(`${target.name}Id`);
      // ensure FK column exists
      if (!columns.some(c => c.name === fkCol)) {
        columns.push({ name: fkCol, type: 'uuid', nullable: true });
      }
      foreignKeys.push({
        name: `fk_${resolveTableName(entity)}_${fkCol}`,
        column: fkCol,
        refTable: resolveTableName(target),
        refColumn: 'id',
        onDelete: rel.onDeleteAction ?? null,
        onUpdate: rel.onUpdateAction ?? null
      });
    }

    const indexes: SqlIndex[] = [];
    for (const idx of input.indexes) {
      if (idx.designEntityId !== entity.id) continue;
      const colNames = idx.propertyIds
        .map(pid => {
          const prop = input.properties.find(p => p.id === pid);
          return prop ? resolveColumnName(prop) : null;
        })
        .filter((n): n is string => !!n);
      if (colNames.length === 0) continue;
      indexes.push({
        name: idx.displayName?.trim() || `idx_${resolveTableName(entity)}_${colNames.join('_')}`,
        columns: colNames,
        unique: idx.isUnique === true
      });
    }

    return {
      name: resolveTableName(entity),
      columns,
      foreignKeys,
      indexes
    };
  });

  return { tables };
}
