import {
  type ModelSnapshot,
  ON_DELETE_ACTIONS,
  type OnDeleteActionName,
  PROPERTY_TYPES,
  type PropertyTypeName,
  RELATION_KINDS,
  type RelationKindName,
  type SnapshotEntity
} from '@aiao-model-design/model-ops';
import { firstValueFrom } from 'rxjs';
import { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../models/index.js';
import { compareSortOrder } from './entity-utils';

function one<T extends string>(allowed: readonly T[], value: string, label: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${label} 的取值 ${value} 不受支持`);
}

function byEntities(ids: string[]) {
  return {
    combinator: 'and' as const,
    rules: [{ field: 'designEntityId' as const, operator: 'in' as const, value: ids }]
  };
}

function sorted<T extends { sortOrder: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareSortOrder);
}

interface Rows {
  properties: DesignProperty[];
  relations: DesignRelation[];
  indexes: DesignIndex[];
}

function toEntity(entity: DesignEntity, rows: Rows): SnapshotEntity {
  const own = <T extends { designEntityId?: string | null }>(items: readonly T[]) =>
    items.filter(item => item.designEntityId === entity.id);
  return {
    id: entity.id,
    name: entity.name,
    displayName: entity.displayName ?? null,
    entityNamespace: entity.entityNamespace ?? null,
    properties: sorted(own(rows.properties).filter(item => !item.parentId)).map(item => ({
      id: item.id,
      name: item.name,
      propertyType: one<PropertyTypeName>(PROPERTY_TYPES, item.propertyType, `属性 ${entity.name}.${item.name} 的类型`),
      displayName: item.displayName ?? null,
      isRequired: item.isRequired,
      isNullable: item.isNullable,
      isUnique: item.isUnique,
      defaultValue: item.defaultValue ?? null,
      enumValues: item.enumValues ?? null
    })),
    relations: sorted(own(rows.relations)).map(item => ({
      id: item.id,
      name: item.name,
      relationKind: one<RelationKindName>(RELATION_KINDS, item.relationKind, `关系 ${entity.name}.${item.name}`),
      mappedEntityId: item.mappedEntityId ?? '',
      mappedPropertyId: item.mappedPropertyId ?? null,
      onDeleteAction:
        item.onDeleteAction ?
          one<OnDeleteActionName>(ON_DELETE_ACTIONS, item.onDeleteAction, `关系 ${entity.name}.${item.name} 的删除策略`)
        : null
    })),
    indexes: sorted(own(rows.indexes)).map(item => ({
      id: item.id,
      propertyIds: [...(item.propertyIds ?? [])],
      isUnique: item.isUnique
    }))
  };
}

/**
 * 从数据库读出当前分支上一个设计的模型快照。
 *
 * 直接查询而不读界面信号：刚写入的操作可能还没反映到信号里，快照必须包含它们。
 * 只取顶层属性（AI 不处理嵌套属性）；取值不在共享类型范围内时直接报错，指出是哪个字段。
 */
export async function loadModelSnapshot(modelDesignId: string): Promise<ModelSnapshot> {
  const where = {
    combinator: 'and' as const,
    rules: [{ field: 'modelDesignId' as const, operator: '=' as const, value: modelDesignId }]
  };
  const entities = sorted(await firstValueFrom(DesignEntity.find({ where })));
  if (!entities.length) return { entities: [] };
  const ids = entities.map(entity => entity.id);
  const [properties, relations, indexes] = await Promise.all([
    firstValueFrom(DesignProperty.find({ where: byEntities(ids) })),
    firstValueFrom(DesignRelation.find({ where: byEntities(ids) })),
    firstValueFrom(DesignIndex.find({ where: byEntities(ids) }))
  ]);
  return { entities: entities.map(entity => toEntity(entity, { properties, relations, indexes })) };
}
