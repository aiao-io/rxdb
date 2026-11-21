/** DesignEntity 的可克隆字段快照（不含 id，克隆时重新生成） */
export interface DesignEntitySnapshot {
  id: string;
  name: string;
  tableName: string | null;
  displayName: string | null;
  entityNamespace: string | null;
  extendsBase: string;
  repositoryType: string;
  nodeX: number;
  nodeY: number;
  nodeWidth: number;
  sortOrder: string;
}

/** DesignProperty 的可克隆字段快照 */
export interface DesignPropertySnapshot {
  id: string;
  designEntityId: string;
  parentId: string | null;
  name: string;
  propertyType: string;
  columnName: string | null;
  displayName: string | null;
  isUnique: boolean;
  isNullable: boolean;
  isRequired: boolean;
  isReadonly: boolean;
  isSortable: boolean;
  defaultValue: string | null;
  enumValues: string[] | null;
  sortOrder: string;
}

/** DesignRelation 的可克隆字段快照 */
export interface DesignRelationSnapshot {
  id: string;
  designEntityId: string;
  name: string;
  relationKind: string;
  /** 目标实体 id，跨设计引用时保留原值（见 {@link cloneDesignSnapshot}） */
  mappedEntityId: string | null;
  /** 逆关系配对的 DesignRelation id，跨设计引用时保留原值 */
  mappedPropertyId: string | null;
  mappedNamespace: string | null;
  columnName: string | null;
  displayName: string | null;
  onDeleteAction: string | null;
  onUpdateAction: string | null;
  sortOrder: string;
}

/** DesignIndex 的可克隆字段快照 */
export interface DesignIndexSnapshot {
  id: string;
  designEntityId: string;
  propertyIds: string[];
  isUnique: boolean;
  displayName: string | null;
  sortOrder: string;
}

/** {@link cloneDesignSnapshot} 的克隆结果 */
export interface ClonedSnapshot {
  entities: DesignEntitySnapshot[];
  properties: DesignPropertySnapshot[];
  relations: DesignRelationSnapshot[];
  indexes: DesignIndexSnapshot[];
}

function remapId(map: Map<string, string>, id: string): string;
function remapId(map: Map<string, string>, id: string | null): string | null;
function remapId(map: Map<string, string>, id: string | null): string | null {
  if (id === null) return null;
  return map.get(id) ?? id;
}

/**
 * 克隆一份模型设计快照：为所有实体/属性/关系/索引重新生成 id，并重建内部引用。
 *
 * 已知限制：{@link DesignRelationSnapshot.mappedEntityId} / `mappedPropertyId`
 * 若指向被克隆集合之外的实体/关系（跨设计引用），将静默保留原值而非报错或置空。
 *
 * @param generateId - id 生成器，默认 `crypto.randomUUID`；测试时可注入确定性实现
 */
export function cloneDesignSnapshot(
  entities: readonly DesignEntitySnapshot[],
  properties: readonly DesignPropertySnapshot[],
  relations: readonly DesignRelationSnapshot[],
  indexes: readonly DesignIndexSnapshot[],
  generateId: () => string = () => crypto.randomUUID()
): ClonedSnapshot {
  const entityIdMap = new Map(entities.map(e => [e.id, generateId()]));
  const propertyIdMap = new Map(properties.map(p => [p.id, generateId()]));
  const relationIdMap = new Map(relations.map(r => [r.id, generateId()]));

  const clonedEntities = entities.map(e => ({ ...e, id: remapId(entityIdMap, e.id) }));

  const clonedProperties = properties.map(p => ({
    ...p,
    id: remapId(propertyIdMap, p.id),
    designEntityId: remapId(entityIdMap, p.designEntityId),
    parentId: remapId(propertyIdMap, p.parentId)
  }));

  const clonedRelations = relations.map(r => ({
    ...r,
    id: remapId(relationIdMap, r.id),
    designEntityId: remapId(entityIdMap, r.designEntityId),
    mappedEntityId: remapId(entityIdMap, r.mappedEntityId),
    mappedPropertyId: remapId(relationIdMap, r.mappedPropertyId)
  }));

  const clonedIndexes = indexes.map(idx => ({
    ...idx,
    id: generateId(),
    designEntityId: remapId(entityIdMap, idx.designEntityId),
    propertyIds: idx.propertyIds.map(pid => remapId(propertyIdMap, pid))
  }));

  return { entities: clonedEntities, properties: clonedProperties, relations: clonedRelations, indexes: clonedIndexes };
}
