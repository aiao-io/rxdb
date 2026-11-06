import type { EntityMetadata, EntityPropertyMetadata, EntityRelationMetadata } from '@aiao/rxdb';
import type { FormFieldConfig } from './entity-form/interfaces.js';
import type { ModelI18n } from './i18n.js';

const systemLabels: Readonly<Record<string, string>> = {
  createdAt: 'common.createdAt',
  updatedAt: 'common.updatedAt',
  createdBy: 'text.f46c86c028',
  updatedBy: 'text.e9045a7d8f'
};

const translatedLabel = (key: string, i18n: ModelI18n): string | undefined =>
  i18n.resolve?.(key, 'rxdb-model').value === undefined ? undefined : i18n.t(key, undefined, 'rxdb-model');

const propertyLabel = (metadata: EntityMetadata, name: string, i18n: ModelI18n): string | undefined =>
  translatedLabel(`entity.${metadata.namespace}.${metadata.name}.property.${name}`, i18n) ??
  (systemLabels[name] ? translatedLabel(systemLabels[name], i18n) : undefined);

const relationLabel = (metadata: EntityMetadata, name: string, i18n: ModelI18n): string | undefined =>
  translatedLabel(`entity.${metadata.namespace}.${metadata.name}.relation.${name}`, i18n);

/**
 * 克隆显示元数据并解析实体、属性与关系文案，原实体声明及存储合同保持不变。
 * @param metadata - 数据库声明的实体元数据。
 * @param i18n - 可检视目录的组件运行时。
 * @returns 显示名已本地化的元数据；没有命中文案时保留原引用。
 * @remarks 目录位于 rxdb-model，键为 entity.namespace.name.displayName、property.field 或 relation.field。
 */
export function localizeEntityMetadata(metadata: EntityMetadata, i18n?: ModelI18n): EntityMetadata {
  if (!i18n?.resolve) return metadata;
  const properties = new Map<EntityPropertyMetadata, EntityPropertyMetadata>();
  const relations = new Map<EntityRelationMetadata, EntityRelationMetadata>();
  const mapProperty = (property: EntityPropertyMetadata): EntityPropertyMetadata => {
    const known = properties.get(property);
    if (known) return known;
    const label = propertyLabel(metadata, property.name, i18n);
    const localized =
      label === undefined || label === property.displayName ? property : { ...property, displayName: label };
    properties.set(property, localized);
    return localized;
  };
  const mapRelation = (relation: EntityRelationMetadata): EntityRelationMetadata => {
    const known = relations.get(relation);
    if (known) return known;
    const label = relationLabel(metadata, relation.name, i18n);
    const localized =
      label === undefined || label === relation.displayName ? relation : { ...relation, displayName: label };
    relations.set(relation, localized);
    return localized;
  };
  const localizedProperties = metadata.properties.map(mapProperty);
  const computedProperties = metadata.computedProperties.map(mapProperty);
  const localizedRelations = metadata.relations.map(mapRelation);
  const displayName =
    translatedLabel(`entity.${metadata.namespace}.${metadata.name}.displayName`, i18n) ?? metadata.displayName;
  if (
    displayName === metadata.displayName &&
    [...properties].every(([a, b]) => a === b) &&
    [...relations].every(([a, b]) => a === b)
  )
    return metadata;
  return {
    ...metadata,
    displayName,
    properties: localizedProperties,
    computedProperties,
    relations: localizedRelations,
    propertyMap: new Map([...metadata.propertyMap].map(([name, property]) => [name, mapProperty(property)])),
    computedPropertyMap: new Map(
      [...metadata.computedPropertyMap].map(([name, property]) => [name, mapProperty(property)])
    ),
    defaultValueProperties: metadata.defaultValueProperties.map(mapProperty),
    encryptedPropertyMap: new Map(
      [...metadata.encryptedPropertyMap].map(([name, property]) => [name, mapProperty(property)])
    ),
    relationMap: new Map([...metadata.relationMap].map(([name, relation]) => [name, mapRelation(relation)])),
    foreignKeyRelationMap: new Map(
      [...metadata.foreignKeyRelationMap].map(([name, relation]) => [name, mapRelation(relation)])
    ),
    foreignKeyRelations: metadata.foreignKeyRelations.map(mapRelation)
  };
}

/**
 * 更新已打开表单中的显示标签，保留字段配置与调用方的数据状态。
 * @param metadata - 表单所属的原实体元数据。
 * @param fields - 已构造的表单字段。
 * @param i18n - 可检视目录的组件运行时。
 * @returns 仅命中目录的字段会被克隆并替换显示名。
 */
export function localizeEntityFormFields(
  metadata: EntityMetadata,
  fields: FormFieldConfig[],
  i18n?: ModelI18n
): FormFieldConfig[] {
  if (!i18n?.resolve) return fields;
  return fields.map(field => {
    const relation = metadata.foreignKeyRelationMap.get(field.field);
    const label = relation ? relationLabel(metadata, relation.name, i18n) : propertyLabel(metadata, field.field, i18n);
    return label === undefined || label === field.displayName ? field : { ...field, displayName: label };
  });
}
