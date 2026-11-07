import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import type { InheritedPropertyDef } from '../../constants';
import type { TableRecord } from './table.types';

/**
 * Build property tab records from inherited + custom properties.
 * keyValue 类型的属性会携带 children 子记录以树形渲染。
 */
export function buildPropertyRecords(
  inherited: readonly InheritedPropertyDef[],
  custom: DesignProperty[],
  childPropertiesMap?: Map<string, DesignProperty[]>
): TableRecord[] {
  const records: TableRecord[] = [];

  for (const prop of inherited) {
    records.push({
      index: records.length + 1,
      name: prop.name,
      propertyType: prop.type,
      columnName: '',
      displayName: '',
      isNullable: false,
      isRequired: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false,
      defaultValue: '',
      _readonly: true,
      _source: prop.source,
      _category: prop.category,
      _propId: null
    });
  }

  for (const prop of custom) {
    const record: TableRecord = {
      index: records.length + 1,
      name: prop.name,
      propertyType: prop.propertyType,
      columnName: prop.columnName ?? '',
      displayName: prop.displayName ?? '',
      isNullable: prop.isNullable,
      isRequired: prop.isRequired,
      isUnique: prop.isUnique,
      isReadonly: prop.isReadonly,
      isSortable: prop.isSortable,
      defaultValue: prop.defaultValue ?? '',
      enumValues: prop.propertyType === 'enum' ? (prop.enumValues ?? []).join(', ') : '',
      _readonly: false,
      _propId: prop.id
    };

    // keyValue 类型附加子属性树
    if (prop.propertyType === 'keyValue' && childPropertiesMap) {
      const children = childPropertiesMap.get(prop.id) ?? [];
      if (children.length > 0) {
        record.hierarchyState = 'expand';
        record.children = children.map((child, idx) => ({
          index: `${record.index}.${idx + 1}`,
          name: child.name,
          propertyType: child.propertyType,
          columnName: child.columnName ?? '',
          displayName: child.displayName ?? '',
          isNullable: child.isNullable,
          isRequired: child.isRequired,
          isUnique: child.isUnique,
          isReadonly: child.isReadonly,
          isSortable: child.isSortable,
          defaultValue: child.defaultValue ?? '',
          enumValues: child.propertyType === 'enum' ? (child.enumValues ?? []).join(', ') : '',
          _readonly: false,
          _propId: child.id,
          _parentPropId: prop.id
        }));
      } else {
        record.hierarchyState = 'expand';
        record.children = [];
      }
    }

    records.push(record);
  }

  return records;
}

/** 构建关系标签页记录（包含继承关系和自定义关系） */
export function buildRelationRecords(
  inherited: readonly InheritedPropertyDef[],
  relations: DesignRelation[],
  entities: DesignEntity[],
  targetRelsByEntity: Map<string, DesignRelation[]>,
  invalidIds: ReadonlySet<string>
): TableRecord[] {
  const records: TableRecord[] = [];

  const getEntityName = (id: string | null | undefined) => {
    if (!id) return '';
    return entities.find(e => e.id === id)?.name ?? '';
  };

  const getTargetRelationName = (entityId: string | null | undefined, propId: string | null | undefined) => {
    if (!entityId || !propId) return '';
    return (targetRelsByEntity.get(entityId) ?? []).find(r => r.id === propId)?.name ?? '';
  };

  for (const rel of inherited) {
    records.push({
      index: records.length + 1,
      name: rel.name,
      displayName: '',
      relationKind: '',
      mappedEntityId: '',
      columnName: '',
      mappedPropertyId: '',
      onDeleteAction: '',
      onUpdateAction: '',
      _readonly: true,
      _source: rel.source,
      _relId: null
    });
  }

  for (const rel of relations) {
    records.push({
      index: records.length + 1,
      name: rel.name,
      displayName: rel.displayName ?? '',
      relationKind: rel.relationKind ?? 'ONE_TO_MANY',
      mappedEntityId: getEntityName(rel.mappedEntityId),
      columnName: rel.columnName ?? '',
      mappedPropertyId: getTargetRelationName(rel.mappedEntityId, rel.mappedPropertyId),
      onDeleteAction: rel.onDeleteAction ?? 'NO_ACTION',
      onUpdateAction: rel.onUpdateAction ?? 'NO_ACTION',
      _readonly: false,
      _relId: rel.id,
      _mappedEntityId: rel.mappedEntityId ?? '',
      _mappedPropertyId: rel.mappedPropertyId ?? '',
      _isInvalid: invalidIds.has(rel.id)
    });
  }

  return records;
}

/** 构建索引标签页记录 */
export function buildIndexRecords(
  indexes: DesignIndex[],
  customProperties: { id: string; name: string }[]
): TableRecord[] {
  const records: TableRecord[] = [];
  const propNameMap = new Map(customProperties.map(p => [p.id, p.name]));

  for (const idx of indexes) {
    const names = (idx.propertyIds ?? []).map(id => propNameMap.get(id) ?? id);
    records.push({
      index: records.length + 1,
      propertyNames: names.join(', '),
      displayName: idx.displayName ?? '',
      isUnique: idx.isUnique,
      _idxId: idx.id,
      _propertyIds: idx.propertyIds ?? []
    });
  }

  return records;
}
