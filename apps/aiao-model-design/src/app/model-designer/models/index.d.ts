import type { BooleanRules, CountOptions, DateRules, ENTITY_STATIC_TYPES, EntityBase, EntityType, FindAllOptions, FindByCursorOptions, FindOneOptions, FindOneOrFailOptions, FindOptions, IEntity, NumberRules, RelationBooleanRules, RelationDateRules, RelationEntitiesObservable, RelationEntityObservable, RelationExistsRules, RelationNumberRules, RelationStringArrayRules, RelationStringRules, RelationUUIDRules, RuleGroupBase, StringArrayRules, StringRules, UUID, UUIDRules } from '@aiao/rxdb';
import type { FindTreeOptions, ITreeEntity, TreeAdjacencyListEntityBase } from '@aiao/rxdb-plugin-tree';
import type { Observable } from 'rxjs';

/**
 * rule
 */
declare type ModelDesignRule = UUIDRules<ModelDesign, 'id'>
| DateRules<ModelDesign, 'createdAt'>
| DateRules<ModelDesign, 'updatedAt'>
| StringRules<ModelDesign, 'createdBy'>
| StringRules<ModelDesign, 'updatedBy'>
| StringRules<ModelDesign, 'name'>
| StringRules<ModelDesign, 'description'>
| StringRules<ModelDesign, 'namespace'>
| RelationExistsRules<'entities', DesignEntityRuleGroup>
| RelationUUIDRules<'entities.id', UUID>
| RelationDateRules<'entities.createdAt', Date>
| RelationDateRules<'entities.updatedAt', Date>
| RelationStringRules<'entities.createdBy', string | null>
| RelationStringRules<'entities.updatedBy', string | null>
| RelationStringRules<'entities.name', string>
| RelationStringRules<'entities.tableName', string | null>
| RelationStringRules<'entities.displayName', string | null>
| RelationStringRules<'entities.entityNamespace', string | null>
| RelationStringRules<'entities.extendsBase', string>
| RelationStringRules<'entities.repositoryType', string>
| RelationNumberRules<'entities.nodeX', number>
| RelationNumberRules<'entities.nodeY', number>
| RelationNumberRules<'entities.nodeWidth', number>
| RelationStringRules<'entities.sortOrder', string>
| RelationUUIDRules<'entities.modelDesignId', UUID>
| RelationUUIDRules<'entities.properties.id', UUID>
| RelationDateRules<'entities.properties.createdAt', Date>
| RelationDateRules<'entities.properties.updatedAt', Date>
| RelationStringRules<'entities.properties.createdBy', string | null>
| RelationStringRules<'entities.properties.updatedBy', string | null>
| RelationStringRules<'entities.properties.name', string>
| RelationStringRules<'entities.properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'entities.properties.columnName', string | null>
| RelationStringRules<'entities.properties.displayName', string | null>
| RelationBooleanRules<'entities.properties.isUnique', boolean>
| RelationBooleanRules<'entities.properties.isNullable', boolean>
| RelationBooleanRules<'entities.properties.isRequired', boolean>
| RelationBooleanRules<'entities.properties.isReadonly', boolean>
| RelationBooleanRules<'entities.properties.isSortable', boolean>
| RelationStringRules<'entities.properties.defaultValue', string | null>
| RelationStringArrayRules<'entities.properties.enumValues', string>
| RelationStringRules<'entities.properties.sortOrder', string>
| RelationUUIDRules<'entities.properties.parentId', UUID>
| RelationUUIDRules<'entities.properties.designEntityId', UUID>
| RelationUUIDRules<'entities.properties.children.id', UUID>
| RelationDateRules<'entities.properties.children.createdAt', Date>
| RelationDateRules<'entities.properties.children.updatedAt', Date>
| RelationStringRules<'entities.properties.children.createdBy', string | null>
| RelationStringRules<'entities.properties.children.updatedBy', string | null>
| RelationStringRules<'entities.properties.children.name', string>
| RelationStringRules<'entities.properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'entities.properties.children.columnName', string | null>
| RelationStringRules<'entities.properties.children.displayName', string | null>
| RelationBooleanRules<'entities.properties.children.isUnique', boolean>
| RelationBooleanRules<'entities.properties.children.isNullable', boolean>
| RelationBooleanRules<'entities.properties.children.isRequired', boolean>
| RelationBooleanRules<'entities.properties.children.isReadonly', boolean>
| RelationBooleanRules<'entities.properties.children.isSortable', boolean>
| RelationStringRules<'entities.properties.children.defaultValue', string | null>
| RelationStringArrayRules<'entities.properties.children.enumValues', string>
| RelationStringRules<'entities.properties.children.sortOrder', string>
| RelationUUIDRules<'entities.properties.children.parentId', UUID>
| RelationUUIDRules<'entities.properties.children.designEntityId', UUID>
| RelationUUIDRules<'entities.properties.parent.id', UUID>
| RelationDateRules<'entities.properties.parent.createdAt', Date>
| RelationDateRules<'entities.properties.parent.updatedAt', Date>
| RelationStringRules<'entities.properties.parent.createdBy', string | null>
| RelationStringRules<'entities.properties.parent.updatedBy', string | null>
| RelationStringRules<'entities.properties.parent.name', string>
| RelationStringRules<'entities.properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'entities.properties.parent.columnName', string | null>
| RelationStringRules<'entities.properties.parent.displayName', string | null>
| RelationBooleanRules<'entities.properties.parent.isUnique', boolean>
| RelationBooleanRules<'entities.properties.parent.isNullable', boolean>
| RelationBooleanRules<'entities.properties.parent.isRequired', boolean>
| RelationBooleanRules<'entities.properties.parent.isReadonly', boolean>
| RelationBooleanRules<'entities.properties.parent.isSortable', boolean>
| RelationStringRules<'entities.properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'entities.properties.parent.enumValues', string>
| RelationStringRules<'entities.properties.parent.sortOrder', string>
| RelationUUIDRules<'entities.properties.parent.parentId', UUID>
| RelationUUIDRules<'entities.properties.parent.designEntityId', UUID>
| RelationUUIDRules<'entities.relations.id', UUID>
| RelationDateRules<'entities.relations.createdAt', Date>
| RelationDateRules<'entities.relations.updatedAt', Date>
| RelationStringRules<'entities.relations.createdBy', string | null>
| RelationStringRules<'entities.relations.updatedBy', string | null>
| RelationStringRules<'entities.relations.name', string>
| RelationStringRules<'entities.relations.relationKind', string>
| RelationStringRules<'entities.relations.mappedEntityId', string | null>
| RelationStringRules<'entities.relations.mappedPropertyId', string | null>
| RelationStringRules<'entities.relations.mappedNamespace', string | null>
| RelationStringRules<'entities.relations.columnName', string | null>
| RelationStringRules<'entities.relations.displayName', string | null>
| RelationStringRules<'entities.relations.onDeleteAction', string | null>
| RelationStringRules<'entities.relations.onUpdateAction', string | null>
| RelationStringRules<'entities.relations.sortOrder', string>
| RelationUUIDRules<'entities.relations.designEntityId', UUID>
| RelationUUIDRules<'entities.indexes.id', UUID>
| RelationDateRules<'entities.indexes.createdAt', Date>
| RelationDateRules<'entities.indexes.updatedAt', Date>
| RelationStringRules<'entities.indexes.createdBy', string | null>
| RelationStringRules<'entities.indexes.updatedBy', string | null>
| RelationStringArrayRules<'entities.indexes.propertyIds', string>
| RelationBooleanRules<'entities.indexes.isUnique', boolean>
| RelationStringRules<'entities.indexes.displayName', string | null>
| RelationStringRules<'entities.indexes.sortOrder', string>
| RelationUUIDRules<'entities.indexes.designEntityId', UUID>
| RelationExistsRules<'chatSessions', ChatSessionRuleGroup>
| RelationUUIDRules<'chatSessions.id', UUID>
| RelationDateRules<'chatSessions.createdAt', Date>
| RelationDateRules<'chatSessions.updatedAt', Date>
| RelationStringRules<'chatSessions.createdBy', string | null>
| RelationStringRules<'chatSessions.updatedBy', string | null>
| RelationStringRules<'chatSessions.name', string>
| RelationStringRules<'chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'chatSessions.modelDesignId', UUID>
| RelationUUIDRules<'chatSessions.messages.id', UUID>
| RelationDateRules<'chatSessions.messages.createdAt', Date>
| RelationDateRules<'chatSessions.messages.updatedAt', Date>
| RelationStringRules<'chatSessions.messages.createdBy', string | null>
| RelationStringRules<'chatSessions.messages.updatedBy', string | null>
| RelationStringRules<'chatSessions.messages.role', "user" | "assistant">
| RelationStringRules<'chatSessions.messages.content', string>
| RelationUUIDRules<'chatSessions.messages.chatSessionId', UUID>;

/**
 * RuleGroupBase
 */
export declare type ModelDesignRuleGroup = RuleGroupBase<typeof ModelDesign,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'name'
  |'description'
  |'namespace'
  |'entities'
  |'entities.id'
  |'entities.createdAt'
  |'entities.updatedAt'
  |'entities.createdBy'
  |'entities.updatedBy'
  |'entities.name'
  |'entities.tableName'
  |'entities.displayName'
  |'entities.entityNamespace'
  |'entities.extendsBase'
  |'entities.repositoryType'
  |'entities.nodeX'
  |'entities.nodeY'
  |'entities.nodeWidth'
  |'entities.sortOrder'
  |'entities.modelDesignId'
  |'entities.properties.id'
  |'entities.properties.createdAt'
  |'entities.properties.updatedAt'
  |'entities.properties.createdBy'
  |'entities.properties.updatedBy'
  |'entities.properties.name'
  |'entities.properties.propertyType'
  |'entities.properties.columnName'
  |'entities.properties.displayName'
  |'entities.properties.isUnique'
  |'entities.properties.isNullable'
  |'entities.properties.isRequired'
  |'entities.properties.isReadonly'
  |'entities.properties.isSortable'
  |'entities.properties.defaultValue'
  |'entities.properties.enumValues'
  |'entities.properties.sortOrder'
  |'entities.properties.parentId'
  |'entities.properties.designEntityId'
  |'entities.properties.children.id'
  |'entities.properties.children.createdAt'
  |'entities.properties.children.updatedAt'
  |'entities.properties.children.createdBy'
  |'entities.properties.children.updatedBy'
  |'entities.properties.children.name'
  |'entities.properties.children.propertyType'
  |'entities.properties.children.columnName'
  |'entities.properties.children.displayName'
  |'entities.properties.children.isUnique'
  |'entities.properties.children.isNullable'
  |'entities.properties.children.isRequired'
  |'entities.properties.children.isReadonly'
  |'entities.properties.children.isSortable'
  |'entities.properties.children.defaultValue'
  |'entities.properties.children.enumValues'
  |'entities.properties.children.sortOrder'
  |'entities.properties.children.parentId'
  |'entities.properties.children.designEntityId'
  |'entities.properties.parent.id'
  |'entities.properties.parent.createdAt'
  |'entities.properties.parent.updatedAt'
  |'entities.properties.parent.createdBy'
  |'entities.properties.parent.updatedBy'
  |'entities.properties.parent.name'
  |'entities.properties.parent.propertyType'
  |'entities.properties.parent.columnName'
  |'entities.properties.parent.displayName'
  |'entities.properties.parent.isUnique'
  |'entities.properties.parent.isNullable'
  |'entities.properties.parent.isRequired'
  |'entities.properties.parent.isReadonly'
  |'entities.properties.parent.isSortable'
  |'entities.properties.parent.defaultValue'
  |'entities.properties.parent.enumValues'
  |'entities.properties.parent.sortOrder'
  |'entities.properties.parent.parentId'
  |'entities.properties.parent.designEntityId'
  |'entities.relations.id'
  |'entities.relations.createdAt'
  |'entities.relations.updatedAt'
  |'entities.relations.createdBy'
  |'entities.relations.updatedBy'
  |'entities.relations.name'
  |'entities.relations.relationKind'
  |'entities.relations.mappedEntityId'
  |'entities.relations.mappedPropertyId'
  |'entities.relations.mappedNamespace'
  |'entities.relations.columnName'
  |'entities.relations.displayName'
  |'entities.relations.onDeleteAction'
  |'entities.relations.onUpdateAction'
  |'entities.relations.sortOrder'
  |'entities.relations.designEntityId'
  |'entities.indexes.id'
  |'entities.indexes.createdAt'
  |'entities.indexes.updatedAt'
  |'entities.indexes.createdBy'
  |'entities.indexes.updatedBy'
  |'entities.indexes.propertyIds'
  |'entities.indexes.isUnique'
  |'entities.indexes.displayName'
  |'entities.indexes.sortOrder'
  |'entities.indexes.designEntityId'
  |'chatSessions'
  |'chatSessions.id'
  |'chatSessions.createdAt'
  |'chatSessions.updatedAt'
  |'chatSessions.createdBy'
  |'chatSessions.updatedBy'
  |'chatSessions.name'
  |'chatSessions.contextKind'
  |'chatSessions.lastUsedAt'
  |'chatSessions.modelDesignId'
  |'chatSessions.messages.id'
  |'chatSessions.messages.createdAt'
  |'chatSessions.messages.updatedAt'
  |'chatSessions.messages.createdBy'
  |'chatSessions.messages.updatedBy'
  |'chatSessions.messages.role'
  |'chatSessions.messages.content'
  |'chatSessions.messages.chatSessionId',
ModelDesignRule>;

/**
 * OrderByField
 */
declare type ModelDesignOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "description" | "namespace";

/**
 * rule
 */
declare type DesignRelationRule = UUIDRules<DesignRelation, 'id'>
| DateRules<DesignRelation, 'createdAt'>
| DateRules<DesignRelation, 'updatedAt'>
| StringRules<DesignRelation, 'createdBy'>
| StringRules<DesignRelation, 'updatedBy'>
| StringRules<DesignRelation, 'name'>
| StringRules<DesignRelation, 'relationKind'>
| StringRules<DesignRelation, 'mappedEntityId'>
| StringRules<DesignRelation, 'mappedPropertyId'>
| StringRules<DesignRelation, 'mappedNamespace'>
| StringRules<DesignRelation, 'columnName'>
| StringRules<DesignRelation, 'displayName'>
| StringRules<DesignRelation, 'onDeleteAction'>
| StringRules<DesignRelation, 'onUpdateAction'>
| StringRules<DesignRelation, 'sortOrder'>
| UUIDRules<DesignRelation, 'designEntityId'>
| RelationExistsRules<'designEntity', DesignEntityRuleGroup>
| RelationUUIDRules<'designEntity.id', UUID>
| RelationDateRules<'designEntity.createdAt', Date>
| RelationDateRules<'designEntity.updatedAt', Date>
| RelationStringRules<'designEntity.createdBy', string | null>
| RelationStringRules<'designEntity.updatedBy', string | null>
| RelationStringRules<'designEntity.name', string>
| RelationStringRules<'designEntity.tableName', string | null>
| RelationStringRules<'designEntity.displayName', string | null>
| RelationStringRules<'designEntity.entityNamespace', string | null>
| RelationStringRules<'designEntity.extendsBase', string>
| RelationStringRules<'designEntity.repositoryType', string>
| RelationNumberRules<'designEntity.nodeX', number>
| RelationNumberRules<'designEntity.nodeY', number>
| RelationNumberRules<'designEntity.nodeWidth', number>
| RelationStringRules<'designEntity.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.id', UUID>
| RelationDateRules<'designEntity.modelDesign.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.name', string>
| RelationStringRules<'designEntity.modelDesign.description', string | null>
| RelationStringRules<'designEntity.modelDesign.namespace', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.id', UUID>
| RelationDateRules<'designEntity.modelDesign.entities.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.entities.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.entities.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.name', string>
| RelationStringRules<'designEntity.modelDesign.entities.tableName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.displayName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.entityNamespace', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.extendsBase', string>
| RelationStringRules<'designEntity.modelDesign.entities.repositoryType', string>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeX', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeY', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeWidth', number>
| RelationStringRules<'designEntity.modelDesign.entities.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.name', string>
| RelationStringRules<'designEntity.modelDesign.chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'designEntity.modelDesign.chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.role', "user" | "assistant">
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.content', string>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.chatSessionId', UUID>
| RelationUUIDRules<'designEntity.properties.id', UUID>
| RelationDateRules<'designEntity.properties.createdAt', Date>
| RelationDateRules<'designEntity.properties.updatedAt', Date>
| RelationStringRules<'designEntity.properties.createdBy', string | null>
| RelationStringRules<'designEntity.properties.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.name', string>
| RelationStringRules<'designEntity.properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.columnName', string | null>
| RelationStringRules<'designEntity.properties.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.isSortable', boolean>
| RelationStringRules<'designEntity.properties.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.enumValues', string>
| RelationStringRules<'designEntity.properties.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.designEntityId', UUID>
| RelationUUIDRules<'designEntity.properties.children.id', UUID>
| RelationDateRules<'designEntity.properties.children.createdAt', Date>
| RelationDateRules<'designEntity.properties.children.updatedAt', Date>
| RelationStringRules<'designEntity.properties.children.createdBy', string | null>
| RelationStringRules<'designEntity.properties.children.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.children.name', string>
| RelationStringRules<'designEntity.properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.children.columnName', string | null>
| RelationStringRules<'designEntity.properties.children.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.children.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.children.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.children.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.children.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.children.isSortable', boolean>
| RelationStringRules<'designEntity.properties.children.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.children.enumValues', string>
| RelationStringRules<'designEntity.properties.children.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.children.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.children.designEntityId', UUID>
| RelationUUIDRules<'designEntity.properties.parent.id', UUID>
| RelationDateRules<'designEntity.properties.parent.createdAt', Date>
| RelationDateRules<'designEntity.properties.parent.updatedAt', Date>
| RelationStringRules<'designEntity.properties.parent.createdBy', string | null>
| RelationStringRules<'designEntity.properties.parent.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.parent.name', string>
| RelationStringRules<'designEntity.properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.parent.columnName', string | null>
| RelationStringRules<'designEntity.properties.parent.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.parent.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isSortable', boolean>
| RelationStringRules<'designEntity.properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.parent.enumValues', string>
| RelationStringRules<'designEntity.properties.parent.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.parent.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.parent.designEntityId', UUID>
| RelationUUIDRules<'designEntity.indexes.id', UUID>
| RelationDateRules<'designEntity.indexes.createdAt', Date>
| RelationDateRules<'designEntity.indexes.updatedAt', Date>
| RelationStringRules<'designEntity.indexes.createdBy', string | null>
| RelationStringRules<'designEntity.indexes.updatedBy', string | null>
| RelationStringArrayRules<'designEntity.indexes.propertyIds', string>
| RelationBooleanRules<'designEntity.indexes.isUnique', boolean>
| RelationStringRules<'designEntity.indexes.displayName', string | null>
| RelationStringRules<'designEntity.indexes.sortOrder', string>
| RelationUUIDRules<'designEntity.indexes.designEntityId', UUID>;

/**
 * RuleGroupBase
 */
export declare type DesignRelationRuleGroup = RuleGroupBase<typeof DesignRelation,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'name'
  |'relationKind'
  |'mappedEntityId'
  |'mappedPropertyId'
  |'mappedNamespace'
  |'columnName'
  |'displayName'
  |'onDeleteAction'
  |'onUpdateAction'
  |'sortOrder'
  |'designEntityId'
  |'designEntity'
  |'designEntity.id'
  |'designEntity.createdAt'
  |'designEntity.updatedAt'
  |'designEntity.createdBy'
  |'designEntity.updatedBy'
  |'designEntity.name'
  |'designEntity.tableName'
  |'designEntity.displayName'
  |'designEntity.entityNamespace'
  |'designEntity.extendsBase'
  |'designEntity.repositoryType'
  |'designEntity.nodeX'
  |'designEntity.nodeY'
  |'designEntity.nodeWidth'
  |'designEntity.sortOrder'
  |'designEntity.modelDesignId'
  |'designEntity.modelDesign.id'
  |'designEntity.modelDesign.createdAt'
  |'designEntity.modelDesign.updatedAt'
  |'designEntity.modelDesign.createdBy'
  |'designEntity.modelDesign.updatedBy'
  |'designEntity.modelDesign.name'
  |'designEntity.modelDesign.description'
  |'designEntity.modelDesign.namespace'
  |'designEntity.modelDesign.entities.id'
  |'designEntity.modelDesign.entities.createdAt'
  |'designEntity.modelDesign.entities.updatedAt'
  |'designEntity.modelDesign.entities.createdBy'
  |'designEntity.modelDesign.entities.updatedBy'
  |'designEntity.modelDesign.entities.name'
  |'designEntity.modelDesign.entities.tableName'
  |'designEntity.modelDesign.entities.displayName'
  |'designEntity.modelDesign.entities.entityNamespace'
  |'designEntity.modelDesign.entities.extendsBase'
  |'designEntity.modelDesign.entities.repositoryType'
  |'designEntity.modelDesign.entities.nodeX'
  |'designEntity.modelDesign.entities.nodeY'
  |'designEntity.modelDesign.entities.nodeWidth'
  |'designEntity.modelDesign.entities.sortOrder'
  |'designEntity.modelDesign.entities.modelDesignId'
  |'designEntity.modelDesign.chatSessions.id'
  |'designEntity.modelDesign.chatSessions.createdAt'
  |'designEntity.modelDesign.chatSessions.updatedAt'
  |'designEntity.modelDesign.chatSessions.createdBy'
  |'designEntity.modelDesign.chatSessions.updatedBy'
  |'designEntity.modelDesign.chatSessions.name'
  |'designEntity.modelDesign.chatSessions.contextKind'
  |'designEntity.modelDesign.chatSessions.lastUsedAt'
  |'designEntity.modelDesign.chatSessions.modelDesignId'
  |'designEntity.modelDesign.chatSessions.messages.id'
  |'designEntity.modelDesign.chatSessions.messages.createdAt'
  |'designEntity.modelDesign.chatSessions.messages.updatedAt'
  |'designEntity.modelDesign.chatSessions.messages.createdBy'
  |'designEntity.modelDesign.chatSessions.messages.updatedBy'
  |'designEntity.modelDesign.chatSessions.messages.role'
  |'designEntity.modelDesign.chatSessions.messages.content'
  |'designEntity.modelDesign.chatSessions.messages.chatSessionId'
  |'designEntity.properties.id'
  |'designEntity.properties.createdAt'
  |'designEntity.properties.updatedAt'
  |'designEntity.properties.createdBy'
  |'designEntity.properties.updatedBy'
  |'designEntity.properties.name'
  |'designEntity.properties.propertyType'
  |'designEntity.properties.columnName'
  |'designEntity.properties.displayName'
  |'designEntity.properties.isUnique'
  |'designEntity.properties.isNullable'
  |'designEntity.properties.isRequired'
  |'designEntity.properties.isReadonly'
  |'designEntity.properties.isSortable'
  |'designEntity.properties.defaultValue'
  |'designEntity.properties.enumValues'
  |'designEntity.properties.sortOrder'
  |'designEntity.properties.parentId'
  |'designEntity.properties.designEntityId'
  |'designEntity.properties.children.id'
  |'designEntity.properties.children.createdAt'
  |'designEntity.properties.children.updatedAt'
  |'designEntity.properties.children.createdBy'
  |'designEntity.properties.children.updatedBy'
  |'designEntity.properties.children.name'
  |'designEntity.properties.children.propertyType'
  |'designEntity.properties.children.columnName'
  |'designEntity.properties.children.displayName'
  |'designEntity.properties.children.isUnique'
  |'designEntity.properties.children.isNullable'
  |'designEntity.properties.children.isRequired'
  |'designEntity.properties.children.isReadonly'
  |'designEntity.properties.children.isSortable'
  |'designEntity.properties.children.defaultValue'
  |'designEntity.properties.children.enumValues'
  |'designEntity.properties.children.sortOrder'
  |'designEntity.properties.children.parentId'
  |'designEntity.properties.children.designEntityId'
  |'designEntity.properties.parent.id'
  |'designEntity.properties.parent.createdAt'
  |'designEntity.properties.parent.updatedAt'
  |'designEntity.properties.parent.createdBy'
  |'designEntity.properties.parent.updatedBy'
  |'designEntity.properties.parent.name'
  |'designEntity.properties.parent.propertyType'
  |'designEntity.properties.parent.columnName'
  |'designEntity.properties.parent.displayName'
  |'designEntity.properties.parent.isUnique'
  |'designEntity.properties.parent.isNullable'
  |'designEntity.properties.parent.isRequired'
  |'designEntity.properties.parent.isReadonly'
  |'designEntity.properties.parent.isSortable'
  |'designEntity.properties.parent.defaultValue'
  |'designEntity.properties.parent.enumValues'
  |'designEntity.properties.parent.sortOrder'
  |'designEntity.properties.parent.parentId'
  |'designEntity.properties.parent.designEntityId'
  |'designEntity.indexes.id'
  |'designEntity.indexes.createdAt'
  |'designEntity.indexes.updatedAt'
  |'designEntity.indexes.createdBy'
  |'designEntity.indexes.updatedBy'
  |'designEntity.indexes.propertyIds'
  |'designEntity.indexes.isUnique'
  |'designEntity.indexes.displayName'
  |'designEntity.indexes.sortOrder'
  |'designEntity.indexes.designEntityId',
DesignRelationRule>;

/**
 * OrderByField
 */
declare type DesignRelationOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "relationKind" | "mappedEntityId" | "mappedPropertyId" | "mappedNamespace" | "columnName" | "displayName" | "onDeleteAction" | "onUpdateAction" | "sortOrder";

/**
 * rule
 */
declare type DesignPropertyRule = UUIDRules<DesignProperty, 'id'>
| DateRules<DesignProperty, 'createdAt'>
| DateRules<DesignProperty, 'updatedAt'>
| StringRules<DesignProperty, 'createdBy'>
| StringRules<DesignProperty, 'updatedBy'>
| StringRules<DesignProperty, 'name'>
| StringRules<DesignProperty, 'propertyType'>
| StringRules<DesignProperty, 'columnName'>
| StringRules<DesignProperty, 'displayName'>
| BooleanRules<DesignProperty, 'isUnique'>
| BooleanRules<DesignProperty, 'isNullable'>
| BooleanRules<DesignProperty, 'isRequired'>
| BooleanRules<DesignProperty, 'isReadonly'>
| BooleanRules<DesignProperty, 'isSortable'>
| StringRules<DesignProperty, 'defaultValue'>
| StringArrayRules<DesignProperty, 'enumValues', string>
| StringRules<DesignProperty, 'sortOrder'>
| UUIDRules<DesignProperty, 'parentId'>
| UUIDRules<DesignProperty, 'designEntityId'>
| RelationExistsRules<'children', DesignPropertyRuleGroup>
| RelationUUIDRules<'children.id', UUID>
| RelationDateRules<'children.createdAt', Date>
| RelationDateRules<'children.updatedAt', Date>
| RelationStringRules<'children.createdBy', string | null>
| RelationStringRules<'children.updatedBy', string | null>
| RelationStringRules<'children.name', string>
| RelationStringRules<'children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'children.columnName', string | null>
| RelationStringRules<'children.displayName', string | null>
| RelationBooleanRules<'children.isUnique', boolean>
| RelationBooleanRules<'children.isNullable', boolean>
| RelationBooleanRules<'children.isRequired', boolean>
| RelationBooleanRules<'children.isReadonly', boolean>
| RelationBooleanRules<'children.isSortable', boolean>
| RelationStringRules<'children.defaultValue', string | null>
| RelationStringArrayRules<'children.enumValues', string>
| RelationStringRules<'children.sortOrder', string>
| RelationUUIDRules<'children.parentId', UUID>
| RelationUUIDRules<'children.designEntityId', UUID>
| RelationExistsRules<'parent', DesignPropertyRuleGroup>
| RelationUUIDRules<'parent.id', UUID>
| RelationDateRules<'parent.createdAt', Date>
| RelationDateRules<'parent.updatedAt', Date>
| RelationStringRules<'parent.createdBy', string | null>
| RelationStringRules<'parent.updatedBy', string | null>
| RelationStringRules<'parent.name', string>
| RelationStringRules<'parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'parent.columnName', string | null>
| RelationStringRules<'parent.displayName', string | null>
| RelationBooleanRules<'parent.isUnique', boolean>
| RelationBooleanRules<'parent.isNullable', boolean>
| RelationBooleanRules<'parent.isRequired', boolean>
| RelationBooleanRules<'parent.isReadonly', boolean>
| RelationBooleanRules<'parent.isSortable', boolean>
| RelationStringRules<'parent.defaultValue', string | null>
| RelationStringArrayRules<'parent.enumValues', string>
| RelationStringRules<'parent.sortOrder', string>
| RelationUUIDRules<'parent.parentId', UUID>
| RelationUUIDRules<'parent.designEntityId', UUID>
| RelationExistsRules<'designEntity', DesignEntityRuleGroup>
| RelationUUIDRules<'designEntity.id', UUID>
| RelationDateRules<'designEntity.createdAt', Date>
| RelationDateRules<'designEntity.updatedAt', Date>
| RelationStringRules<'designEntity.createdBy', string | null>
| RelationStringRules<'designEntity.updatedBy', string | null>
| RelationStringRules<'designEntity.name', string>
| RelationStringRules<'designEntity.tableName', string | null>
| RelationStringRules<'designEntity.displayName', string | null>
| RelationStringRules<'designEntity.entityNamespace', string | null>
| RelationStringRules<'designEntity.extendsBase', string>
| RelationStringRules<'designEntity.repositoryType', string>
| RelationNumberRules<'designEntity.nodeX', number>
| RelationNumberRules<'designEntity.nodeY', number>
| RelationNumberRules<'designEntity.nodeWidth', number>
| RelationStringRules<'designEntity.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.id', UUID>
| RelationDateRules<'designEntity.modelDesign.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.name', string>
| RelationStringRules<'designEntity.modelDesign.description', string | null>
| RelationStringRules<'designEntity.modelDesign.namespace', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.id', UUID>
| RelationDateRules<'designEntity.modelDesign.entities.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.entities.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.entities.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.name', string>
| RelationStringRules<'designEntity.modelDesign.entities.tableName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.displayName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.entityNamespace', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.extendsBase', string>
| RelationStringRules<'designEntity.modelDesign.entities.repositoryType', string>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeX', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeY', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeWidth', number>
| RelationStringRules<'designEntity.modelDesign.entities.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.name', string>
| RelationStringRules<'designEntity.modelDesign.chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'designEntity.modelDesign.chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.role', "user" | "assistant">
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.content', string>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.chatSessionId', UUID>
| RelationUUIDRules<'designEntity.relations.id', UUID>
| RelationDateRules<'designEntity.relations.createdAt', Date>
| RelationDateRules<'designEntity.relations.updatedAt', Date>
| RelationStringRules<'designEntity.relations.createdBy', string | null>
| RelationStringRules<'designEntity.relations.updatedBy', string | null>
| RelationStringRules<'designEntity.relations.name', string>
| RelationStringRules<'designEntity.relations.relationKind', string>
| RelationStringRules<'designEntity.relations.mappedEntityId', string | null>
| RelationStringRules<'designEntity.relations.mappedPropertyId', string | null>
| RelationStringRules<'designEntity.relations.mappedNamespace', string | null>
| RelationStringRules<'designEntity.relations.columnName', string | null>
| RelationStringRules<'designEntity.relations.displayName', string | null>
| RelationStringRules<'designEntity.relations.onDeleteAction', string | null>
| RelationStringRules<'designEntity.relations.onUpdateAction', string | null>
| RelationStringRules<'designEntity.relations.sortOrder', string>
| RelationUUIDRules<'designEntity.relations.designEntityId', UUID>
| RelationUUIDRules<'designEntity.indexes.id', UUID>
| RelationDateRules<'designEntity.indexes.createdAt', Date>
| RelationDateRules<'designEntity.indexes.updatedAt', Date>
| RelationStringRules<'designEntity.indexes.createdBy', string | null>
| RelationStringRules<'designEntity.indexes.updatedBy', string | null>
| RelationStringArrayRules<'designEntity.indexes.propertyIds', string>
| RelationBooleanRules<'designEntity.indexes.isUnique', boolean>
| RelationStringRules<'designEntity.indexes.displayName', string | null>
| RelationStringRules<'designEntity.indexes.sortOrder', string>
| RelationUUIDRules<'designEntity.indexes.designEntityId', UUID>;

/**
 * RuleGroupBase
 */
export declare type DesignPropertyRuleGroup = RuleGroupBase<typeof DesignProperty,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'name'
  |'propertyType'
  |'columnName'
  |'displayName'
  |'isUnique'
  |'isNullable'
  |'isRequired'
  |'isReadonly'
  |'isSortable'
  |'defaultValue'
  |'enumValues'
  |'sortOrder'
  |'parentId'
  |'designEntityId'
  |'children'
  |'children.id'
  |'children.createdAt'
  |'children.updatedAt'
  |'children.createdBy'
  |'children.updatedBy'
  |'children.name'
  |'children.propertyType'
  |'children.columnName'
  |'children.displayName'
  |'children.isUnique'
  |'children.isNullable'
  |'children.isRequired'
  |'children.isReadonly'
  |'children.isSortable'
  |'children.defaultValue'
  |'children.enumValues'
  |'children.sortOrder'
  |'children.parentId'
  |'children.designEntityId'
  |'parent'
  |'parent.id'
  |'parent.createdAt'
  |'parent.updatedAt'
  |'parent.createdBy'
  |'parent.updatedBy'
  |'parent.name'
  |'parent.propertyType'
  |'parent.columnName'
  |'parent.displayName'
  |'parent.isUnique'
  |'parent.isNullable'
  |'parent.isRequired'
  |'parent.isReadonly'
  |'parent.isSortable'
  |'parent.defaultValue'
  |'parent.enumValues'
  |'parent.sortOrder'
  |'parent.parentId'
  |'parent.designEntityId'
  |'designEntity'
  |'designEntity.id'
  |'designEntity.createdAt'
  |'designEntity.updatedAt'
  |'designEntity.createdBy'
  |'designEntity.updatedBy'
  |'designEntity.name'
  |'designEntity.tableName'
  |'designEntity.displayName'
  |'designEntity.entityNamespace'
  |'designEntity.extendsBase'
  |'designEntity.repositoryType'
  |'designEntity.nodeX'
  |'designEntity.nodeY'
  |'designEntity.nodeWidth'
  |'designEntity.sortOrder'
  |'designEntity.modelDesignId'
  |'designEntity.modelDesign.id'
  |'designEntity.modelDesign.createdAt'
  |'designEntity.modelDesign.updatedAt'
  |'designEntity.modelDesign.createdBy'
  |'designEntity.modelDesign.updatedBy'
  |'designEntity.modelDesign.name'
  |'designEntity.modelDesign.description'
  |'designEntity.modelDesign.namespace'
  |'designEntity.modelDesign.entities.id'
  |'designEntity.modelDesign.entities.createdAt'
  |'designEntity.modelDesign.entities.updatedAt'
  |'designEntity.modelDesign.entities.createdBy'
  |'designEntity.modelDesign.entities.updatedBy'
  |'designEntity.modelDesign.entities.name'
  |'designEntity.modelDesign.entities.tableName'
  |'designEntity.modelDesign.entities.displayName'
  |'designEntity.modelDesign.entities.entityNamespace'
  |'designEntity.modelDesign.entities.extendsBase'
  |'designEntity.modelDesign.entities.repositoryType'
  |'designEntity.modelDesign.entities.nodeX'
  |'designEntity.modelDesign.entities.nodeY'
  |'designEntity.modelDesign.entities.nodeWidth'
  |'designEntity.modelDesign.entities.sortOrder'
  |'designEntity.modelDesign.entities.modelDesignId'
  |'designEntity.modelDesign.chatSessions.id'
  |'designEntity.modelDesign.chatSessions.createdAt'
  |'designEntity.modelDesign.chatSessions.updatedAt'
  |'designEntity.modelDesign.chatSessions.createdBy'
  |'designEntity.modelDesign.chatSessions.updatedBy'
  |'designEntity.modelDesign.chatSessions.name'
  |'designEntity.modelDesign.chatSessions.contextKind'
  |'designEntity.modelDesign.chatSessions.lastUsedAt'
  |'designEntity.modelDesign.chatSessions.modelDesignId'
  |'designEntity.modelDesign.chatSessions.messages.id'
  |'designEntity.modelDesign.chatSessions.messages.createdAt'
  |'designEntity.modelDesign.chatSessions.messages.updatedAt'
  |'designEntity.modelDesign.chatSessions.messages.createdBy'
  |'designEntity.modelDesign.chatSessions.messages.updatedBy'
  |'designEntity.modelDesign.chatSessions.messages.role'
  |'designEntity.modelDesign.chatSessions.messages.content'
  |'designEntity.modelDesign.chatSessions.messages.chatSessionId'
  |'designEntity.relations.id'
  |'designEntity.relations.createdAt'
  |'designEntity.relations.updatedAt'
  |'designEntity.relations.createdBy'
  |'designEntity.relations.updatedBy'
  |'designEntity.relations.name'
  |'designEntity.relations.relationKind'
  |'designEntity.relations.mappedEntityId'
  |'designEntity.relations.mappedPropertyId'
  |'designEntity.relations.mappedNamespace'
  |'designEntity.relations.columnName'
  |'designEntity.relations.displayName'
  |'designEntity.relations.onDeleteAction'
  |'designEntity.relations.onUpdateAction'
  |'designEntity.relations.sortOrder'
  |'designEntity.relations.designEntityId'
  |'designEntity.indexes.id'
  |'designEntity.indexes.createdAt'
  |'designEntity.indexes.updatedAt'
  |'designEntity.indexes.createdBy'
  |'designEntity.indexes.updatedBy'
  |'designEntity.indexes.propertyIds'
  |'designEntity.indexes.isUnique'
  |'designEntity.indexes.displayName'
  |'designEntity.indexes.sortOrder'
  |'designEntity.indexes.designEntityId',
DesignPropertyRule>;

/**
 * OrderByField
 */
declare type DesignPropertyOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "propertyType" | "columnName" | "displayName" | "isUnique" | "isNullable" | "isRequired" | "isReadonly" | "isSortable" | "defaultValue" | "enumValues" | "sortOrder";

/**
 * TreeRule
 */
declare type DesignPropertyTreeRule = RelationDateRules<'children.createdAt', Date>
| RelationDateRules<'children.updatedAt', Date>
| RelationStringRules<'children.createdBy', string | null>
| RelationStringRules<'children.updatedBy', string | null>
| RelationStringRules<'children.name', string>
| RelationStringRules<'children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'children.columnName', string | null>
| RelationStringRules<'children.displayName', string | null>
| RelationBooleanRules<'children.isUnique', boolean>
| RelationBooleanRules<'children.isNullable', boolean>
| RelationBooleanRules<'children.isRequired', boolean>
| RelationBooleanRules<'children.isReadonly', boolean>
| RelationBooleanRules<'children.isSortable', boolean>
| RelationStringRules<'children.defaultValue', string | null>
| RelationStringArrayRules<'children.enumValues', string>
| RelationStringRules<'children.sortOrder', string>
| RelationUUIDRules<'children.parentId', UUID>
| RelationUUIDRules<'children.designEntityId', UUID>;

/**
 * TreeRuleGroup
 */
export declare type DesignPropertyTreeRuleGroup = RuleGroupBase<typeof DesignProperty, 'children.createdAt' | 'children.updatedAt' | 'children.createdBy' | 'children.updatedBy' | 'children.name' | 'children.propertyType' | 'children.columnName' | 'children.displayName' | 'children.isUnique' | 'children.isNullable' | 'children.isRequired' | 'children.isReadonly' | 'children.isSortable' | 'children.defaultValue' | 'children.enumValues' | 'children.sortOrder' | 'children.parentId' | 'children.designEntityId', DesignPropertyTreeRule>;

/**
 * rule
 */
declare type DesignIndexRule = UUIDRules<DesignIndex, 'id'>
| DateRules<DesignIndex, 'createdAt'>
| DateRules<DesignIndex, 'updatedAt'>
| StringRules<DesignIndex, 'createdBy'>
| StringRules<DesignIndex, 'updatedBy'>
| StringArrayRules<DesignIndex, 'propertyIds', string>
| BooleanRules<DesignIndex, 'isUnique'>
| StringRules<DesignIndex, 'displayName'>
| StringRules<DesignIndex, 'sortOrder'>
| UUIDRules<DesignIndex, 'designEntityId'>
| RelationExistsRules<'designEntity', DesignEntityRuleGroup>
| RelationUUIDRules<'designEntity.id', UUID>
| RelationDateRules<'designEntity.createdAt', Date>
| RelationDateRules<'designEntity.updatedAt', Date>
| RelationStringRules<'designEntity.createdBy', string | null>
| RelationStringRules<'designEntity.updatedBy', string | null>
| RelationStringRules<'designEntity.name', string>
| RelationStringRules<'designEntity.tableName', string | null>
| RelationStringRules<'designEntity.displayName', string | null>
| RelationStringRules<'designEntity.entityNamespace', string | null>
| RelationStringRules<'designEntity.extendsBase', string>
| RelationStringRules<'designEntity.repositoryType', string>
| RelationNumberRules<'designEntity.nodeX', number>
| RelationNumberRules<'designEntity.nodeY', number>
| RelationNumberRules<'designEntity.nodeWidth', number>
| RelationStringRules<'designEntity.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.id', UUID>
| RelationDateRules<'designEntity.modelDesign.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.name', string>
| RelationStringRules<'designEntity.modelDesign.description', string | null>
| RelationStringRules<'designEntity.modelDesign.namespace', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.id', UUID>
| RelationDateRules<'designEntity.modelDesign.entities.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.entities.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.entities.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.name', string>
| RelationStringRules<'designEntity.modelDesign.entities.tableName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.displayName', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.entityNamespace', string | null>
| RelationStringRules<'designEntity.modelDesign.entities.extendsBase', string>
| RelationStringRules<'designEntity.modelDesign.entities.repositoryType', string>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeX', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeY', number>
| RelationNumberRules<'designEntity.modelDesign.entities.nodeWidth', number>
| RelationStringRules<'designEntity.modelDesign.entities.sortOrder', string>
| RelationUUIDRules<'designEntity.modelDesign.entities.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.name', string>
| RelationStringRules<'designEntity.modelDesign.chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'designEntity.modelDesign.chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.modelDesignId', UUID>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.id', UUID>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.createdAt', Date>
| RelationDateRules<'designEntity.modelDesign.chatSessions.messages.updatedAt', Date>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.createdBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.updatedBy', string | null>
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.role', "user" | "assistant">
| RelationStringRules<'designEntity.modelDesign.chatSessions.messages.content', string>
| RelationUUIDRules<'designEntity.modelDesign.chatSessions.messages.chatSessionId', UUID>
| RelationUUIDRules<'designEntity.properties.id', UUID>
| RelationDateRules<'designEntity.properties.createdAt', Date>
| RelationDateRules<'designEntity.properties.updatedAt', Date>
| RelationStringRules<'designEntity.properties.createdBy', string | null>
| RelationStringRules<'designEntity.properties.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.name', string>
| RelationStringRules<'designEntity.properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.columnName', string | null>
| RelationStringRules<'designEntity.properties.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.isSortable', boolean>
| RelationStringRules<'designEntity.properties.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.enumValues', string>
| RelationStringRules<'designEntity.properties.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.designEntityId', UUID>
| RelationUUIDRules<'designEntity.properties.children.id', UUID>
| RelationDateRules<'designEntity.properties.children.createdAt', Date>
| RelationDateRules<'designEntity.properties.children.updatedAt', Date>
| RelationStringRules<'designEntity.properties.children.createdBy', string | null>
| RelationStringRules<'designEntity.properties.children.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.children.name', string>
| RelationStringRules<'designEntity.properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.children.columnName', string | null>
| RelationStringRules<'designEntity.properties.children.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.children.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.children.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.children.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.children.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.children.isSortable', boolean>
| RelationStringRules<'designEntity.properties.children.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.children.enumValues', string>
| RelationStringRules<'designEntity.properties.children.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.children.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.children.designEntityId', UUID>
| RelationUUIDRules<'designEntity.properties.parent.id', UUID>
| RelationDateRules<'designEntity.properties.parent.createdAt', Date>
| RelationDateRules<'designEntity.properties.parent.updatedAt', Date>
| RelationStringRules<'designEntity.properties.parent.createdBy', string | null>
| RelationStringRules<'designEntity.properties.parent.updatedBy', string | null>
| RelationStringRules<'designEntity.properties.parent.name', string>
| RelationStringRules<'designEntity.properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'designEntity.properties.parent.columnName', string | null>
| RelationStringRules<'designEntity.properties.parent.displayName', string | null>
| RelationBooleanRules<'designEntity.properties.parent.isUnique', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isNullable', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isRequired', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isReadonly', boolean>
| RelationBooleanRules<'designEntity.properties.parent.isSortable', boolean>
| RelationStringRules<'designEntity.properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'designEntity.properties.parent.enumValues', string>
| RelationStringRules<'designEntity.properties.parent.sortOrder', string>
| RelationUUIDRules<'designEntity.properties.parent.parentId', UUID>
| RelationUUIDRules<'designEntity.properties.parent.designEntityId', UUID>
| RelationUUIDRules<'designEntity.relations.id', UUID>
| RelationDateRules<'designEntity.relations.createdAt', Date>
| RelationDateRules<'designEntity.relations.updatedAt', Date>
| RelationStringRules<'designEntity.relations.createdBy', string | null>
| RelationStringRules<'designEntity.relations.updatedBy', string | null>
| RelationStringRules<'designEntity.relations.name', string>
| RelationStringRules<'designEntity.relations.relationKind', string>
| RelationStringRules<'designEntity.relations.mappedEntityId', string | null>
| RelationStringRules<'designEntity.relations.mappedPropertyId', string | null>
| RelationStringRules<'designEntity.relations.mappedNamespace', string | null>
| RelationStringRules<'designEntity.relations.columnName', string | null>
| RelationStringRules<'designEntity.relations.displayName', string | null>
| RelationStringRules<'designEntity.relations.onDeleteAction', string | null>
| RelationStringRules<'designEntity.relations.onUpdateAction', string | null>
| RelationStringRules<'designEntity.relations.sortOrder', string>
| RelationUUIDRules<'designEntity.relations.designEntityId', UUID>;

/**
 * RuleGroupBase
 */
export declare type DesignIndexRuleGroup = RuleGroupBase<typeof DesignIndex,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'propertyIds'
  |'isUnique'
  |'displayName'
  |'sortOrder'
  |'designEntityId'
  |'designEntity'
  |'designEntity.id'
  |'designEntity.createdAt'
  |'designEntity.updatedAt'
  |'designEntity.createdBy'
  |'designEntity.updatedBy'
  |'designEntity.name'
  |'designEntity.tableName'
  |'designEntity.displayName'
  |'designEntity.entityNamespace'
  |'designEntity.extendsBase'
  |'designEntity.repositoryType'
  |'designEntity.nodeX'
  |'designEntity.nodeY'
  |'designEntity.nodeWidth'
  |'designEntity.sortOrder'
  |'designEntity.modelDesignId'
  |'designEntity.modelDesign.id'
  |'designEntity.modelDesign.createdAt'
  |'designEntity.modelDesign.updatedAt'
  |'designEntity.modelDesign.createdBy'
  |'designEntity.modelDesign.updatedBy'
  |'designEntity.modelDesign.name'
  |'designEntity.modelDesign.description'
  |'designEntity.modelDesign.namespace'
  |'designEntity.modelDesign.entities.id'
  |'designEntity.modelDesign.entities.createdAt'
  |'designEntity.modelDesign.entities.updatedAt'
  |'designEntity.modelDesign.entities.createdBy'
  |'designEntity.modelDesign.entities.updatedBy'
  |'designEntity.modelDesign.entities.name'
  |'designEntity.modelDesign.entities.tableName'
  |'designEntity.modelDesign.entities.displayName'
  |'designEntity.modelDesign.entities.entityNamespace'
  |'designEntity.modelDesign.entities.extendsBase'
  |'designEntity.modelDesign.entities.repositoryType'
  |'designEntity.modelDesign.entities.nodeX'
  |'designEntity.modelDesign.entities.nodeY'
  |'designEntity.modelDesign.entities.nodeWidth'
  |'designEntity.modelDesign.entities.sortOrder'
  |'designEntity.modelDesign.entities.modelDesignId'
  |'designEntity.modelDesign.chatSessions.id'
  |'designEntity.modelDesign.chatSessions.createdAt'
  |'designEntity.modelDesign.chatSessions.updatedAt'
  |'designEntity.modelDesign.chatSessions.createdBy'
  |'designEntity.modelDesign.chatSessions.updatedBy'
  |'designEntity.modelDesign.chatSessions.name'
  |'designEntity.modelDesign.chatSessions.contextKind'
  |'designEntity.modelDesign.chatSessions.lastUsedAt'
  |'designEntity.modelDesign.chatSessions.modelDesignId'
  |'designEntity.modelDesign.chatSessions.messages.id'
  |'designEntity.modelDesign.chatSessions.messages.createdAt'
  |'designEntity.modelDesign.chatSessions.messages.updatedAt'
  |'designEntity.modelDesign.chatSessions.messages.createdBy'
  |'designEntity.modelDesign.chatSessions.messages.updatedBy'
  |'designEntity.modelDesign.chatSessions.messages.role'
  |'designEntity.modelDesign.chatSessions.messages.content'
  |'designEntity.modelDesign.chatSessions.messages.chatSessionId'
  |'designEntity.properties.id'
  |'designEntity.properties.createdAt'
  |'designEntity.properties.updatedAt'
  |'designEntity.properties.createdBy'
  |'designEntity.properties.updatedBy'
  |'designEntity.properties.name'
  |'designEntity.properties.propertyType'
  |'designEntity.properties.columnName'
  |'designEntity.properties.displayName'
  |'designEntity.properties.isUnique'
  |'designEntity.properties.isNullable'
  |'designEntity.properties.isRequired'
  |'designEntity.properties.isReadonly'
  |'designEntity.properties.isSortable'
  |'designEntity.properties.defaultValue'
  |'designEntity.properties.enumValues'
  |'designEntity.properties.sortOrder'
  |'designEntity.properties.parentId'
  |'designEntity.properties.designEntityId'
  |'designEntity.properties.children.id'
  |'designEntity.properties.children.createdAt'
  |'designEntity.properties.children.updatedAt'
  |'designEntity.properties.children.createdBy'
  |'designEntity.properties.children.updatedBy'
  |'designEntity.properties.children.name'
  |'designEntity.properties.children.propertyType'
  |'designEntity.properties.children.columnName'
  |'designEntity.properties.children.displayName'
  |'designEntity.properties.children.isUnique'
  |'designEntity.properties.children.isNullable'
  |'designEntity.properties.children.isRequired'
  |'designEntity.properties.children.isReadonly'
  |'designEntity.properties.children.isSortable'
  |'designEntity.properties.children.defaultValue'
  |'designEntity.properties.children.enumValues'
  |'designEntity.properties.children.sortOrder'
  |'designEntity.properties.children.parentId'
  |'designEntity.properties.children.designEntityId'
  |'designEntity.properties.parent.id'
  |'designEntity.properties.parent.createdAt'
  |'designEntity.properties.parent.updatedAt'
  |'designEntity.properties.parent.createdBy'
  |'designEntity.properties.parent.updatedBy'
  |'designEntity.properties.parent.name'
  |'designEntity.properties.parent.propertyType'
  |'designEntity.properties.parent.columnName'
  |'designEntity.properties.parent.displayName'
  |'designEntity.properties.parent.isUnique'
  |'designEntity.properties.parent.isNullable'
  |'designEntity.properties.parent.isRequired'
  |'designEntity.properties.parent.isReadonly'
  |'designEntity.properties.parent.isSortable'
  |'designEntity.properties.parent.defaultValue'
  |'designEntity.properties.parent.enumValues'
  |'designEntity.properties.parent.sortOrder'
  |'designEntity.properties.parent.parentId'
  |'designEntity.properties.parent.designEntityId'
  |'designEntity.relations.id'
  |'designEntity.relations.createdAt'
  |'designEntity.relations.updatedAt'
  |'designEntity.relations.createdBy'
  |'designEntity.relations.updatedBy'
  |'designEntity.relations.name'
  |'designEntity.relations.relationKind'
  |'designEntity.relations.mappedEntityId'
  |'designEntity.relations.mappedPropertyId'
  |'designEntity.relations.mappedNamespace'
  |'designEntity.relations.columnName'
  |'designEntity.relations.displayName'
  |'designEntity.relations.onDeleteAction'
  |'designEntity.relations.onUpdateAction'
  |'designEntity.relations.sortOrder'
  |'designEntity.relations.designEntityId',
DesignIndexRule>;

/**
 * OrderByField
 */
declare type DesignIndexOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "propertyIds" | "isUnique" | "displayName" | "sortOrder";

/**
 * rule
 */
declare type DesignEntityRule = UUIDRules<DesignEntity, 'id'>
| DateRules<DesignEntity, 'createdAt'>
| DateRules<DesignEntity, 'updatedAt'>
| StringRules<DesignEntity, 'createdBy'>
| StringRules<DesignEntity, 'updatedBy'>
| StringRules<DesignEntity, 'name'>
| StringRules<DesignEntity, 'tableName'>
| StringRules<DesignEntity, 'displayName'>
| StringRules<DesignEntity, 'entityNamespace'>
| StringRules<DesignEntity, 'extendsBase'>
| StringRules<DesignEntity, 'repositoryType'>
| NumberRules<DesignEntity, 'nodeX'>
| NumberRules<DesignEntity, 'nodeY'>
| NumberRules<DesignEntity, 'nodeWidth'>
| StringRules<DesignEntity, 'sortOrder'>
| UUIDRules<DesignEntity, 'modelDesignId'>
| RelationExistsRules<'modelDesign', ModelDesignRuleGroup>
| RelationUUIDRules<'modelDesign.id', UUID>
| RelationDateRules<'modelDesign.createdAt', Date>
| RelationDateRules<'modelDesign.updatedAt', Date>
| RelationStringRules<'modelDesign.createdBy', string | null>
| RelationStringRules<'modelDesign.updatedBy', string | null>
| RelationStringRules<'modelDesign.name', string>
| RelationStringRules<'modelDesign.description', string | null>
| RelationStringRules<'modelDesign.namespace', string>
| RelationUUIDRules<'modelDesign.chatSessions.id', UUID>
| RelationDateRules<'modelDesign.chatSessions.createdAt', Date>
| RelationDateRules<'modelDesign.chatSessions.updatedAt', Date>
| RelationStringRules<'modelDesign.chatSessions.createdBy', string | null>
| RelationStringRules<'modelDesign.chatSessions.updatedBy', string | null>
| RelationStringRules<'modelDesign.chatSessions.name', string>
| RelationStringRules<'modelDesign.chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'modelDesign.chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'modelDesign.chatSessions.modelDesignId', UUID>
| RelationUUIDRules<'modelDesign.chatSessions.messages.id', UUID>
| RelationDateRules<'modelDesign.chatSessions.messages.createdAt', Date>
| RelationDateRules<'modelDesign.chatSessions.messages.updatedAt', Date>
| RelationStringRules<'modelDesign.chatSessions.messages.createdBy', string | null>
| RelationStringRules<'modelDesign.chatSessions.messages.updatedBy', string | null>
| RelationStringRules<'modelDesign.chatSessions.messages.role', "user" | "assistant">
| RelationStringRules<'modelDesign.chatSessions.messages.content', string>
| RelationUUIDRules<'modelDesign.chatSessions.messages.chatSessionId', UUID>
| RelationExistsRules<'properties', DesignPropertyRuleGroup>
| RelationUUIDRules<'properties.id', UUID>
| RelationDateRules<'properties.createdAt', Date>
| RelationDateRules<'properties.updatedAt', Date>
| RelationStringRules<'properties.createdBy', string | null>
| RelationStringRules<'properties.updatedBy', string | null>
| RelationStringRules<'properties.name', string>
| RelationStringRules<'properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'properties.columnName', string | null>
| RelationStringRules<'properties.displayName', string | null>
| RelationBooleanRules<'properties.isUnique', boolean>
| RelationBooleanRules<'properties.isNullable', boolean>
| RelationBooleanRules<'properties.isRequired', boolean>
| RelationBooleanRules<'properties.isReadonly', boolean>
| RelationBooleanRules<'properties.isSortable', boolean>
| RelationStringRules<'properties.defaultValue', string | null>
| RelationStringArrayRules<'properties.enumValues', string>
| RelationStringRules<'properties.sortOrder', string>
| RelationUUIDRules<'properties.parentId', UUID>
| RelationUUIDRules<'properties.designEntityId', UUID>
| RelationUUIDRules<'properties.children.id', UUID>
| RelationDateRules<'properties.children.createdAt', Date>
| RelationDateRules<'properties.children.updatedAt', Date>
| RelationStringRules<'properties.children.createdBy', string | null>
| RelationStringRules<'properties.children.updatedBy', string | null>
| RelationStringRules<'properties.children.name', string>
| RelationStringRules<'properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'properties.children.columnName', string | null>
| RelationStringRules<'properties.children.displayName', string | null>
| RelationBooleanRules<'properties.children.isUnique', boolean>
| RelationBooleanRules<'properties.children.isNullable', boolean>
| RelationBooleanRules<'properties.children.isRequired', boolean>
| RelationBooleanRules<'properties.children.isReadonly', boolean>
| RelationBooleanRules<'properties.children.isSortable', boolean>
| RelationStringRules<'properties.children.defaultValue', string | null>
| RelationStringArrayRules<'properties.children.enumValues', string>
| RelationStringRules<'properties.children.sortOrder', string>
| RelationUUIDRules<'properties.children.parentId', UUID>
| RelationUUIDRules<'properties.children.designEntityId', UUID>
| RelationUUIDRules<'properties.parent.id', UUID>
| RelationDateRules<'properties.parent.createdAt', Date>
| RelationDateRules<'properties.parent.updatedAt', Date>
| RelationStringRules<'properties.parent.createdBy', string | null>
| RelationStringRules<'properties.parent.updatedBy', string | null>
| RelationStringRules<'properties.parent.name', string>
| RelationStringRules<'properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'properties.parent.columnName', string | null>
| RelationStringRules<'properties.parent.displayName', string | null>
| RelationBooleanRules<'properties.parent.isUnique', boolean>
| RelationBooleanRules<'properties.parent.isNullable', boolean>
| RelationBooleanRules<'properties.parent.isRequired', boolean>
| RelationBooleanRules<'properties.parent.isReadonly', boolean>
| RelationBooleanRules<'properties.parent.isSortable', boolean>
| RelationStringRules<'properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'properties.parent.enumValues', string>
| RelationStringRules<'properties.parent.sortOrder', string>
| RelationUUIDRules<'properties.parent.parentId', UUID>
| RelationUUIDRules<'properties.parent.designEntityId', UUID>
| RelationExistsRules<'relations', DesignRelationRuleGroup>
| RelationUUIDRules<'relations.id', UUID>
| RelationDateRules<'relations.createdAt', Date>
| RelationDateRules<'relations.updatedAt', Date>
| RelationStringRules<'relations.createdBy', string | null>
| RelationStringRules<'relations.updatedBy', string | null>
| RelationStringRules<'relations.name', string>
| RelationStringRules<'relations.relationKind', string>
| RelationStringRules<'relations.mappedEntityId', string | null>
| RelationStringRules<'relations.mappedPropertyId', string | null>
| RelationStringRules<'relations.mappedNamespace', string | null>
| RelationStringRules<'relations.columnName', string | null>
| RelationStringRules<'relations.displayName', string | null>
| RelationStringRules<'relations.onDeleteAction', string | null>
| RelationStringRules<'relations.onUpdateAction', string | null>
| RelationStringRules<'relations.sortOrder', string>
| RelationUUIDRules<'relations.designEntityId', UUID>
| RelationExistsRules<'indexes', DesignIndexRuleGroup>
| RelationUUIDRules<'indexes.id', UUID>
| RelationDateRules<'indexes.createdAt', Date>
| RelationDateRules<'indexes.updatedAt', Date>
| RelationStringRules<'indexes.createdBy', string | null>
| RelationStringRules<'indexes.updatedBy', string | null>
| RelationStringArrayRules<'indexes.propertyIds', string>
| RelationBooleanRules<'indexes.isUnique', boolean>
| RelationStringRules<'indexes.displayName', string | null>
| RelationStringRules<'indexes.sortOrder', string>
| RelationUUIDRules<'indexes.designEntityId', UUID>;

/**
 * RuleGroupBase
 */
export declare type DesignEntityRuleGroup = RuleGroupBase<typeof DesignEntity,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'name'
  |'tableName'
  |'displayName'
  |'entityNamespace'
  |'extendsBase'
  |'repositoryType'
  |'nodeX'
  |'nodeY'
  |'nodeWidth'
  |'sortOrder'
  |'modelDesignId'
  |'modelDesign'
  |'modelDesign.id'
  |'modelDesign.createdAt'
  |'modelDesign.updatedAt'
  |'modelDesign.createdBy'
  |'modelDesign.updatedBy'
  |'modelDesign.name'
  |'modelDesign.description'
  |'modelDesign.namespace'
  |'modelDesign.chatSessions.id'
  |'modelDesign.chatSessions.createdAt'
  |'modelDesign.chatSessions.updatedAt'
  |'modelDesign.chatSessions.createdBy'
  |'modelDesign.chatSessions.updatedBy'
  |'modelDesign.chatSessions.name'
  |'modelDesign.chatSessions.contextKind'
  |'modelDesign.chatSessions.lastUsedAt'
  |'modelDesign.chatSessions.modelDesignId'
  |'modelDesign.chatSessions.messages.id'
  |'modelDesign.chatSessions.messages.createdAt'
  |'modelDesign.chatSessions.messages.updatedAt'
  |'modelDesign.chatSessions.messages.createdBy'
  |'modelDesign.chatSessions.messages.updatedBy'
  |'modelDesign.chatSessions.messages.role'
  |'modelDesign.chatSessions.messages.content'
  |'modelDesign.chatSessions.messages.chatSessionId'
  |'properties'
  |'properties.id'
  |'properties.createdAt'
  |'properties.updatedAt'
  |'properties.createdBy'
  |'properties.updatedBy'
  |'properties.name'
  |'properties.propertyType'
  |'properties.columnName'
  |'properties.displayName'
  |'properties.isUnique'
  |'properties.isNullable'
  |'properties.isRequired'
  |'properties.isReadonly'
  |'properties.isSortable'
  |'properties.defaultValue'
  |'properties.enumValues'
  |'properties.sortOrder'
  |'properties.parentId'
  |'properties.designEntityId'
  |'properties.children.id'
  |'properties.children.createdAt'
  |'properties.children.updatedAt'
  |'properties.children.createdBy'
  |'properties.children.updatedBy'
  |'properties.children.name'
  |'properties.children.propertyType'
  |'properties.children.columnName'
  |'properties.children.displayName'
  |'properties.children.isUnique'
  |'properties.children.isNullable'
  |'properties.children.isRequired'
  |'properties.children.isReadonly'
  |'properties.children.isSortable'
  |'properties.children.defaultValue'
  |'properties.children.enumValues'
  |'properties.children.sortOrder'
  |'properties.children.parentId'
  |'properties.children.designEntityId'
  |'properties.parent.id'
  |'properties.parent.createdAt'
  |'properties.parent.updatedAt'
  |'properties.parent.createdBy'
  |'properties.parent.updatedBy'
  |'properties.parent.name'
  |'properties.parent.propertyType'
  |'properties.parent.columnName'
  |'properties.parent.displayName'
  |'properties.parent.isUnique'
  |'properties.parent.isNullable'
  |'properties.parent.isRequired'
  |'properties.parent.isReadonly'
  |'properties.parent.isSortable'
  |'properties.parent.defaultValue'
  |'properties.parent.enumValues'
  |'properties.parent.sortOrder'
  |'properties.parent.parentId'
  |'properties.parent.designEntityId'
  |'relations'
  |'relations.id'
  |'relations.createdAt'
  |'relations.updatedAt'
  |'relations.createdBy'
  |'relations.updatedBy'
  |'relations.name'
  |'relations.relationKind'
  |'relations.mappedEntityId'
  |'relations.mappedPropertyId'
  |'relations.mappedNamespace'
  |'relations.columnName'
  |'relations.displayName'
  |'relations.onDeleteAction'
  |'relations.onUpdateAction'
  |'relations.sortOrder'
  |'relations.designEntityId'
  |'indexes'
  |'indexes.id'
  |'indexes.createdAt'
  |'indexes.updatedAt'
  |'indexes.createdBy'
  |'indexes.updatedBy'
  |'indexes.propertyIds'
  |'indexes.isUnique'
  |'indexes.displayName'
  |'indexes.sortOrder'
  |'indexes.designEntityId',
DesignEntityRule>;

/**
 * OrderByField
 */
declare type DesignEntityOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "tableName" | "displayName" | "entityNamespace" | "extendsBase" | "repositoryType" | "nodeX" | "nodeY" | "nodeWidth" | "sortOrder";

/**
 * rule
 */
declare type ChatSessionRule = UUIDRules<ChatSession, 'id'>
| DateRules<ChatSession, 'createdAt'>
| DateRules<ChatSession, 'updatedAt'>
| StringRules<ChatSession, 'createdBy'>
| StringRules<ChatSession, 'updatedBy'>
| StringRules<ChatSession, 'name'>
| StringRules<ChatSession, 'contextKind'>
| DateRules<ChatSession, 'lastUsedAt'>
| UUIDRules<ChatSession, 'modelDesignId'>
| RelationExistsRules<'modelDesign', ModelDesignRuleGroup>
| RelationUUIDRules<'modelDesign.id', UUID>
| RelationDateRules<'modelDesign.createdAt', Date>
| RelationDateRules<'modelDesign.updatedAt', Date>
| RelationStringRules<'modelDesign.createdBy', string | null>
| RelationStringRules<'modelDesign.updatedBy', string | null>
| RelationStringRules<'modelDesign.name', string>
| RelationStringRules<'modelDesign.description', string | null>
| RelationStringRules<'modelDesign.namespace', string>
| RelationUUIDRules<'modelDesign.entities.id', UUID>
| RelationDateRules<'modelDesign.entities.createdAt', Date>
| RelationDateRules<'modelDesign.entities.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.updatedBy', string | null>
| RelationStringRules<'modelDesign.entities.name', string>
| RelationStringRules<'modelDesign.entities.tableName', string | null>
| RelationStringRules<'modelDesign.entities.displayName', string | null>
| RelationStringRules<'modelDesign.entities.entityNamespace', string | null>
| RelationStringRules<'modelDesign.entities.extendsBase', string>
| RelationStringRules<'modelDesign.entities.repositoryType', string>
| RelationNumberRules<'modelDesign.entities.nodeX', number>
| RelationNumberRules<'modelDesign.entities.nodeY', number>
| RelationNumberRules<'modelDesign.entities.nodeWidth', number>
| RelationStringRules<'modelDesign.entities.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.modelDesignId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.id', UUID>
| RelationDateRules<'modelDesign.entities.properties.createdAt', Date>
| RelationDateRules<'modelDesign.entities.properties.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.properties.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.updatedBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.name', string>
| RelationStringRules<'modelDesign.entities.properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'modelDesign.entities.properties.columnName', string | null>
| RelationStringRules<'modelDesign.entities.properties.displayName', string | null>
| RelationBooleanRules<'modelDesign.entities.properties.isUnique', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.isNullable', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.isRequired', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.isReadonly', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.isSortable', boolean>
| RelationStringRules<'modelDesign.entities.properties.defaultValue', string | null>
| RelationStringArrayRules<'modelDesign.entities.properties.enumValues', string>
| RelationStringRules<'modelDesign.entities.properties.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.properties.parentId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.designEntityId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.children.id', UUID>
| RelationDateRules<'modelDesign.entities.properties.children.createdAt', Date>
| RelationDateRules<'modelDesign.entities.properties.children.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.properties.children.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.children.updatedBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.children.name', string>
| RelationStringRules<'modelDesign.entities.properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'modelDesign.entities.properties.children.columnName', string | null>
| RelationStringRules<'modelDesign.entities.properties.children.displayName', string | null>
| RelationBooleanRules<'modelDesign.entities.properties.children.isUnique', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.children.isNullable', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.children.isRequired', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.children.isReadonly', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.children.isSortable', boolean>
| RelationStringRules<'modelDesign.entities.properties.children.defaultValue', string | null>
| RelationStringArrayRules<'modelDesign.entities.properties.children.enumValues', string>
| RelationStringRules<'modelDesign.entities.properties.children.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.properties.children.parentId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.children.designEntityId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.parent.id', UUID>
| RelationDateRules<'modelDesign.entities.properties.parent.createdAt', Date>
| RelationDateRules<'modelDesign.entities.properties.parent.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.properties.parent.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.parent.updatedBy', string | null>
| RelationStringRules<'modelDesign.entities.properties.parent.name', string>
| RelationStringRules<'modelDesign.entities.properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'modelDesign.entities.properties.parent.columnName', string | null>
| RelationStringRules<'modelDesign.entities.properties.parent.displayName', string | null>
| RelationBooleanRules<'modelDesign.entities.properties.parent.isUnique', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.parent.isNullable', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.parent.isRequired', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.parent.isReadonly', boolean>
| RelationBooleanRules<'modelDesign.entities.properties.parent.isSortable', boolean>
| RelationStringRules<'modelDesign.entities.properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'modelDesign.entities.properties.parent.enumValues', string>
| RelationStringRules<'modelDesign.entities.properties.parent.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.properties.parent.parentId', UUID>
| RelationUUIDRules<'modelDesign.entities.properties.parent.designEntityId', UUID>
| RelationUUIDRules<'modelDesign.entities.relations.id', UUID>
| RelationDateRules<'modelDesign.entities.relations.createdAt', Date>
| RelationDateRules<'modelDesign.entities.relations.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.relations.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.relations.updatedBy', string | null>
| RelationStringRules<'modelDesign.entities.relations.name', string>
| RelationStringRules<'modelDesign.entities.relations.relationKind', string>
| RelationStringRules<'modelDesign.entities.relations.mappedEntityId', string | null>
| RelationStringRules<'modelDesign.entities.relations.mappedPropertyId', string | null>
| RelationStringRules<'modelDesign.entities.relations.mappedNamespace', string | null>
| RelationStringRules<'modelDesign.entities.relations.columnName', string | null>
| RelationStringRules<'modelDesign.entities.relations.displayName', string | null>
| RelationStringRules<'modelDesign.entities.relations.onDeleteAction', string | null>
| RelationStringRules<'modelDesign.entities.relations.onUpdateAction', string | null>
| RelationStringRules<'modelDesign.entities.relations.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.relations.designEntityId', UUID>
| RelationUUIDRules<'modelDesign.entities.indexes.id', UUID>
| RelationDateRules<'modelDesign.entities.indexes.createdAt', Date>
| RelationDateRules<'modelDesign.entities.indexes.updatedAt', Date>
| RelationStringRules<'modelDesign.entities.indexes.createdBy', string | null>
| RelationStringRules<'modelDesign.entities.indexes.updatedBy', string | null>
| RelationStringArrayRules<'modelDesign.entities.indexes.propertyIds', string>
| RelationBooleanRules<'modelDesign.entities.indexes.isUnique', boolean>
| RelationStringRules<'modelDesign.entities.indexes.displayName', string | null>
| RelationStringRules<'modelDesign.entities.indexes.sortOrder', string>
| RelationUUIDRules<'modelDesign.entities.indexes.designEntityId', UUID>
| RelationExistsRules<'messages', ChatMessageRuleGroup>
| RelationUUIDRules<'messages.id', UUID>
| RelationDateRules<'messages.createdAt', Date>
| RelationDateRules<'messages.updatedAt', Date>
| RelationStringRules<'messages.createdBy', string | null>
| RelationStringRules<'messages.updatedBy', string | null>
| RelationStringRules<'messages.role', "user" | "assistant">
| RelationStringRules<'messages.content', string>
| RelationUUIDRules<'messages.chatSessionId', UUID>;

/**
 * RuleGroupBase
 */
export declare type ChatSessionRuleGroup = RuleGroupBase<typeof ChatSession,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'name'
  |'contextKind'
  |'lastUsedAt'
  |'modelDesignId'
  |'modelDesign'
  |'modelDesign.id'
  |'modelDesign.createdAt'
  |'modelDesign.updatedAt'
  |'modelDesign.createdBy'
  |'modelDesign.updatedBy'
  |'modelDesign.name'
  |'modelDesign.description'
  |'modelDesign.namespace'
  |'modelDesign.entities.id'
  |'modelDesign.entities.createdAt'
  |'modelDesign.entities.updatedAt'
  |'modelDesign.entities.createdBy'
  |'modelDesign.entities.updatedBy'
  |'modelDesign.entities.name'
  |'modelDesign.entities.tableName'
  |'modelDesign.entities.displayName'
  |'modelDesign.entities.entityNamespace'
  |'modelDesign.entities.extendsBase'
  |'modelDesign.entities.repositoryType'
  |'modelDesign.entities.nodeX'
  |'modelDesign.entities.nodeY'
  |'modelDesign.entities.nodeWidth'
  |'modelDesign.entities.sortOrder'
  |'modelDesign.entities.modelDesignId'
  |'modelDesign.entities.properties.id'
  |'modelDesign.entities.properties.createdAt'
  |'modelDesign.entities.properties.updatedAt'
  |'modelDesign.entities.properties.createdBy'
  |'modelDesign.entities.properties.updatedBy'
  |'modelDesign.entities.properties.name'
  |'modelDesign.entities.properties.propertyType'
  |'modelDesign.entities.properties.columnName'
  |'modelDesign.entities.properties.displayName'
  |'modelDesign.entities.properties.isUnique'
  |'modelDesign.entities.properties.isNullable'
  |'modelDesign.entities.properties.isRequired'
  |'modelDesign.entities.properties.isReadonly'
  |'modelDesign.entities.properties.isSortable'
  |'modelDesign.entities.properties.defaultValue'
  |'modelDesign.entities.properties.enumValues'
  |'modelDesign.entities.properties.sortOrder'
  |'modelDesign.entities.properties.parentId'
  |'modelDesign.entities.properties.designEntityId'
  |'modelDesign.entities.properties.children.id'
  |'modelDesign.entities.properties.children.createdAt'
  |'modelDesign.entities.properties.children.updatedAt'
  |'modelDesign.entities.properties.children.createdBy'
  |'modelDesign.entities.properties.children.updatedBy'
  |'modelDesign.entities.properties.children.name'
  |'modelDesign.entities.properties.children.propertyType'
  |'modelDesign.entities.properties.children.columnName'
  |'modelDesign.entities.properties.children.displayName'
  |'modelDesign.entities.properties.children.isUnique'
  |'modelDesign.entities.properties.children.isNullable'
  |'modelDesign.entities.properties.children.isRequired'
  |'modelDesign.entities.properties.children.isReadonly'
  |'modelDesign.entities.properties.children.isSortable'
  |'modelDesign.entities.properties.children.defaultValue'
  |'modelDesign.entities.properties.children.enumValues'
  |'modelDesign.entities.properties.children.sortOrder'
  |'modelDesign.entities.properties.children.parentId'
  |'modelDesign.entities.properties.children.designEntityId'
  |'modelDesign.entities.properties.parent.id'
  |'modelDesign.entities.properties.parent.createdAt'
  |'modelDesign.entities.properties.parent.updatedAt'
  |'modelDesign.entities.properties.parent.createdBy'
  |'modelDesign.entities.properties.parent.updatedBy'
  |'modelDesign.entities.properties.parent.name'
  |'modelDesign.entities.properties.parent.propertyType'
  |'modelDesign.entities.properties.parent.columnName'
  |'modelDesign.entities.properties.parent.displayName'
  |'modelDesign.entities.properties.parent.isUnique'
  |'modelDesign.entities.properties.parent.isNullable'
  |'modelDesign.entities.properties.parent.isRequired'
  |'modelDesign.entities.properties.parent.isReadonly'
  |'modelDesign.entities.properties.parent.isSortable'
  |'modelDesign.entities.properties.parent.defaultValue'
  |'modelDesign.entities.properties.parent.enumValues'
  |'modelDesign.entities.properties.parent.sortOrder'
  |'modelDesign.entities.properties.parent.parentId'
  |'modelDesign.entities.properties.parent.designEntityId'
  |'modelDesign.entities.relations.id'
  |'modelDesign.entities.relations.createdAt'
  |'modelDesign.entities.relations.updatedAt'
  |'modelDesign.entities.relations.createdBy'
  |'modelDesign.entities.relations.updatedBy'
  |'modelDesign.entities.relations.name'
  |'modelDesign.entities.relations.relationKind'
  |'modelDesign.entities.relations.mappedEntityId'
  |'modelDesign.entities.relations.mappedPropertyId'
  |'modelDesign.entities.relations.mappedNamespace'
  |'modelDesign.entities.relations.columnName'
  |'modelDesign.entities.relations.displayName'
  |'modelDesign.entities.relations.onDeleteAction'
  |'modelDesign.entities.relations.onUpdateAction'
  |'modelDesign.entities.relations.sortOrder'
  |'modelDesign.entities.relations.designEntityId'
  |'modelDesign.entities.indexes.id'
  |'modelDesign.entities.indexes.createdAt'
  |'modelDesign.entities.indexes.updatedAt'
  |'modelDesign.entities.indexes.createdBy'
  |'modelDesign.entities.indexes.updatedBy'
  |'modelDesign.entities.indexes.propertyIds'
  |'modelDesign.entities.indexes.isUnique'
  |'modelDesign.entities.indexes.displayName'
  |'modelDesign.entities.indexes.sortOrder'
  |'modelDesign.entities.indexes.designEntityId'
  |'messages'
  |'messages.id'
  |'messages.createdAt'
  |'messages.updatedAt'
  |'messages.createdBy'
  |'messages.updatedBy'
  |'messages.role'
  |'messages.content'
  |'messages.chatSessionId',
ChatSessionRule>;

/**
 * OrderByField
 */
declare type ChatSessionOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "contextKind" | "lastUsedAt";

/**
 * rule
 */
declare type ChatMessageRule = UUIDRules<ChatMessage, 'id'>
| DateRules<ChatMessage, 'createdAt'>
| DateRules<ChatMessage, 'updatedAt'>
| StringRules<ChatMessage, 'createdBy'>
| StringRules<ChatMessage, 'updatedBy'>
| StringRules<ChatMessage, 'role'>
| StringRules<ChatMessage, 'content'>
| UUIDRules<ChatMessage, 'chatSessionId'>
| RelationExistsRules<'chatSession', ChatSessionRuleGroup>
| RelationUUIDRules<'chatSession.id', UUID>
| RelationDateRules<'chatSession.createdAt', Date>
| RelationDateRules<'chatSession.updatedAt', Date>
| RelationStringRules<'chatSession.createdBy', string | null>
| RelationStringRules<'chatSession.updatedBy', string | null>
| RelationStringRules<'chatSession.name', string>
| RelationStringRules<'chatSession.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'chatSession.lastUsedAt', Date>
| RelationUUIDRules<'chatSession.modelDesignId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.id', UUID>
| RelationDateRules<'chatSession.modelDesign.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.name', string>
| RelationStringRules<'chatSession.modelDesign.description', string | null>
| RelationStringRules<'chatSession.modelDesign.namespace', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.name', string>
| RelationStringRules<'chatSession.modelDesign.entities.tableName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.displayName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.entityNamespace', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.extendsBase', string>
| RelationStringRules<'chatSession.modelDesign.entities.repositoryType', string>
| RelationNumberRules<'chatSession.modelDesign.entities.nodeX', number>
| RelationNumberRules<'chatSession.modelDesign.entities.nodeY', number>
| RelationNumberRules<'chatSession.modelDesign.entities.nodeWidth', number>
| RelationStringRules<'chatSession.modelDesign.entities.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.modelDesignId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.properties.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.properties.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.properties.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.name', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'chatSession.modelDesign.entities.properties.columnName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.displayName', string | null>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.isUnique', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.isNullable', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.isRequired', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.isReadonly', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.isSortable', boolean>
| RelationStringRules<'chatSession.modelDesign.entities.properties.defaultValue', string | null>
| RelationStringArrayRules<'chatSession.modelDesign.entities.properties.enumValues', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.parentId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.designEntityId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.children.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.properties.children.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.properties.children.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.name', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.columnName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.displayName', string | null>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.children.isUnique', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.children.isNullable', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.children.isRequired', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.children.isReadonly', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.children.isSortable', boolean>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.defaultValue', string | null>
| RelationStringArrayRules<'chatSession.modelDesign.entities.properties.children.enumValues', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.children.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.children.parentId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.children.designEntityId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.parent.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.properties.parent.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.properties.parent.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.name', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.propertyType', "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json">
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.columnName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.displayName', string | null>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.parent.isUnique', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.parent.isNullable', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.parent.isRequired', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.parent.isReadonly', boolean>
| RelationBooleanRules<'chatSession.modelDesign.entities.properties.parent.isSortable', boolean>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.defaultValue', string | null>
| RelationStringArrayRules<'chatSession.modelDesign.entities.properties.parent.enumValues', string>
| RelationStringRules<'chatSession.modelDesign.entities.properties.parent.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.parent.parentId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.properties.parent.designEntityId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.relations.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.relations.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.relations.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.relations.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.name', string>
| RelationStringRules<'chatSession.modelDesign.entities.relations.relationKind', string>
| RelationStringRules<'chatSession.modelDesign.entities.relations.mappedEntityId', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.mappedPropertyId', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.mappedNamespace', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.columnName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.displayName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.onDeleteAction', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.onUpdateAction', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.relations.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.relations.designEntityId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.entities.indexes.id', UUID>
| RelationDateRules<'chatSession.modelDesign.entities.indexes.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.entities.indexes.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.entities.indexes.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.indexes.updatedBy', string | null>
| RelationStringArrayRules<'chatSession.modelDesign.entities.indexes.propertyIds', string>
| RelationBooleanRules<'chatSession.modelDesign.entities.indexes.isUnique', boolean>
| RelationStringRules<'chatSession.modelDesign.entities.indexes.displayName', string | null>
| RelationStringRules<'chatSession.modelDesign.entities.indexes.sortOrder', string>
| RelationUUIDRules<'chatSession.modelDesign.entities.indexes.designEntityId', UUID>
| RelationUUIDRules<'chatSession.modelDesign.chatSessions.id', UUID>
| RelationDateRules<'chatSession.modelDesign.chatSessions.createdAt', Date>
| RelationDateRules<'chatSession.modelDesign.chatSessions.updatedAt', Date>
| RelationStringRules<'chatSession.modelDesign.chatSessions.createdBy', string | null>
| RelationStringRules<'chatSession.modelDesign.chatSessions.updatedBy', string | null>
| RelationStringRules<'chatSession.modelDesign.chatSessions.name', string>
| RelationStringRules<'chatSession.modelDesign.chatSessions.contextKind', "model-designer" | "assistant" | "docs" | "web-llm">
| RelationDateRules<'chatSession.modelDesign.chatSessions.lastUsedAt', Date>
| RelationUUIDRules<'chatSession.modelDesign.chatSessions.modelDesignId', UUID>;

/**
 * RuleGroupBase
 */
export declare type ChatMessageRuleGroup = RuleGroupBase<typeof ChatMessage,
  |'id'
  |'createdAt'
  |'updatedAt'
  |'createdBy'
  |'updatedBy'
  |'role'
  |'content'
  |'chatSessionId'
  |'chatSession'
  |'chatSession.id'
  |'chatSession.createdAt'
  |'chatSession.updatedAt'
  |'chatSession.createdBy'
  |'chatSession.updatedBy'
  |'chatSession.name'
  |'chatSession.contextKind'
  |'chatSession.lastUsedAt'
  |'chatSession.modelDesignId'
  |'chatSession.modelDesign.id'
  |'chatSession.modelDesign.createdAt'
  |'chatSession.modelDesign.updatedAt'
  |'chatSession.modelDesign.createdBy'
  |'chatSession.modelDesign.updatedBy'
  |'chatSession.modelDesign.name'
  |'chatSession.modelDesign.description'
  |'chatSession.modelDesign.namespace'
  |'chatSession.modelDesign.entities.id'
  |'chatSession.modelDesign.entities.createdAt'
  |'chatSession.modelDesign.entities.updatedAt'
  |'chatSession.modelDesign.entities.createdBy'
  |'chatSession.modelDesign.entities.updatedBy'
  |'chatSession.modelDesign.entities.name'
  |'chatSession.modelDesign.entities.tableName'
  |'chatSession.modelDesign.entities.displayName'
  |'chatSession.modelDesign.entities.entityNamespace'
  |'chatSession.modelDesign.entities.extendsBase'
  |'chatSession.modelDesign.entities.repositoryType'
  |'chatSession.modelDesign.entities.nodeX'
  |'chatSession.modelDesign.entities.nodeY'
  |'chatSession.modelDesign.entities.nodeWidth'
  |'chatSession.modelDesign.entities.sortOrder'
  |'chatSession.modelDesign.entities.modelDesignId'
  |'chatSession.modelDesign.entities.properties.id'
  |'chatSession.modelDesign.entities.properties.createdAt'
  |'chatSession.modelDesign.entities.properties.updatedAt'
  |'chatSession.modelDesign.entities.properties.createdBy'
  |'chatSession.modelDesign.entities.properties.updatedBy'
  |'chatSession.modelDesign.entities.properties.name'
  |'chatSession.modelDesign.entities.properties.propertyType'
  |'chatSession.modelDesign.entities.properties.columnName'
  |'chatSession.modelDesign.entities.properties.displayName'
  |'chatSession.modelDesign.entities.properties.isUnique'
  |'chatSession.modelDesign.entities.properties.isNullable'
  |'chatSession.modelDesign.entities.properties.isRequired'
  |'chatSession.modelDesign.entities.properties.isReadonly'
  |'chatSession.modelDesign.entities.properties.isSortable'
  |'chatSession.modelDesign.entities.properties.defaultValue'
  |'chatSession.modelDesign.entities.properties.enumValues'
  |'chatSession.modelDesign.entities.properties.sortOrder'
  |'chatSession.modelDesign.entities.properties.parentId'
  |'chatSession.modelDesign.entities.properties.designEntityId'
  |'chatSession.modelDesign.entities.properties.children.id'
  |'chatSession.modelDesign.entities.properties.children.createdAt'
  |'chatSession.modelDesign.entities.properties.children.updatedAt'
  |'chatSession.modelDesign.entities.properties.children.createdBy'
  |'chatSession.modelDesign.entities.properties.children.updatedBy'
  |'chatSession.modelDesign.entities.properties.children.name'
  |'chatSession.modelDesign.entities.properties.children.propertyType'
  |'chatSession.modelDesign.entities.properties.children.columnName'
  |'chatSession.modelDesign.entities.properties.children.displayName'
  |'chatSession.modelDesign.entities.properties.children.isUnique'
  |'chatSession.modelDesign.entities.properties.children.isNullable'
  |'chatSession.modelDesign.entities.properties.children.isRequired'
  |'chatSession.modelDesign.entities.properties.children.isReadonly'
  |'chatSession.modelDesign.entities.properties.children.isSortable'
  |'chatSession.modelDesign.entities.properties.children.defaultValue'
  |'chatSession.modelDesign.entities.properties.children.enumValues'
  |'chatSession.modelDesign.entities.properties.children.sortOrder'
  |'chatSession.modelDesign.entities.properties.children.parentId'
  |'chatSession.modelDesign.entities.properties.children.designEntityId'
  |'chatSession.modelDesign.entities.properties.parent.id'
  |'chatSession.modelDesign.entities.properties.parent.createdAt'
  |'chatSession.modelDesign.entities.properties.parent.updatedAt'
  |'chatSession.modelDesign.entities.properties.parent.createdBy'
  |'chatSession.modelDesign.entities.properties.parent.updatedBy'
  |'chatSession.modelDesign.entities.properties.parent.name'
  |'chatSession.modelDesign.entities.properties.parent.propertyType'
  |'chatSession.modelDesign.entities.properties.parent.columnName'
  |'chatSession.modelDesign.entities.properties.parent.displayName'
  |'chatSession.modelDesign.entities.properties.parent.isUnique'
  |'chatSession.modelDesign.entities.properties.parent.isNullable'
  |'chatSession.modelDesign.entities.properties.parent.isRequired'
  |'chatSession.modelDesign.entities.properties.parent.isReadonly'
  |'chatSession.modelDesign.entities.properties.parent.isSortable'
  |'chatSession.modelDesign.entities.properties.parent.defaultValue'
  |'chatSession.modelDesign.entities.properties.parent.enumValues'
  |'chatSession.modelDesign.entities.properties.parent.sortOrder'
  |'chatSession.modelDesign.entities.properties.parent.parentId'
  |'chatSession.modelDesign.entities.properties.parent.designEntityId'
  |'chatSession.modelDesign.entities.relations.id'
  |'chatSession.modelDesign.entities.relations.createdAt'
  |'chatSession.modelDesign.entities.relations.updatedAt'
  |'chatSession.modelDesign.entities.relations.createdBy'
  |'chatSession.modelDesign.entities.relations.updatedBy'
  |'chatSession.modelDesign.entities.relations.name'
  |'chatSession.modelDesign.entities.relations.relationKind'
  |'chatSession.modelDesign.entities.relations.mappedEntityId'
  |'chatSession.modelDesign.entities.relations.mappedPropertyId'
  |'chatSession.modelDesign.entities.relations.mappedNamespace'
  |'chatSession.modelDesign.entities.relations.columnName'
  |'chatSession.modelDesign.entities.relations.displayName'
  |'chatSession.modelDesign.entities.relations.onDeleteAction'
  |'chatSession.modelDesign.entities.relations.onUpdateAction'
  |'chatSession.modelDesign.entities.relations.sortOrder'
  |'chatSession.modelDesign.entities.relations.designEntityId'
  |'chatSession.modelDesign.entities.indexes.id'
  |'chatSession.modelDesign.entities.indexes.createdAt'
  |'chatSession.modelDesign.entities.indexes.updatedAt'
  |'chatSession.modelDesign.entities.indexes.createdBy'
  |'chatSession.modelDesign.entities.indexes.updatedBy'
  |'chatSession.modelDesign.entities.indexes.propertyIds'
  |'chatSession.modelDesign.entities.indexes.isUnique'
  |'chatSession.modelDesign.entities.indexes.displayName'
  |'chatSession.modelDesign.entities.indexes.sortOrder'
  |'chatSession.modelDesign.entities.indexes.designEntityId'
  |'chatSession.modelDesign.chatSessions.id'
  |'chatSession.modelDesign.chatSessions.createdAt'
  |'chatSession.modelDesign.chatSessions.updatedAt'
  |'chatSession.modelDesign.chatSessions.createdBy'
  |'chatSession.modelDesign.chatSessions.updatedBy'
  |'chatSession.modelDesign.chatSessions.name'
  |'chatSession.modelDesign.chatSessions.contextKind'
  |'chatSession.modelDesign.chatSessions.lastUsedAt'
  |'chatSession.modelDesign.chatSessions.modelDesignId',
ChatMessageRule>;

/**
 * OrderByField
 */
declare type ChatMessageOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "role" | "content";

/**
 * rxdb
 */
declare module "@aiao/rxdb" {
  /**
   * RxDB
   */
  interface RxDB {
    /**
     * 模型设计
     */
    ModelDesign: typeof ModelDesign;
    /**
     * 设计关系
     */
    DesignRelation: typeof DesignRelation;
    /**
     * 设计属性
     */
    DesignProperty: typeof DesignProperty;
    /**
     * 设计索引
     */
    DesignIndex: typeof DesignIndex;
    /**
     * 设计实体
     */
    DesignEntity: typeof DesignEntity;
    /**
     * AI 会话
     */
    ChatSession: typeof ChatSession;
    /**
     * AI 消息
     */
    ChatMessage: typeof ChatMessage;
  }
}

/**
 * 静态类型
 */
export interface ModelDesignStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof ModelDesign,ModelDesignRuleGroup>;
}

/**
 * 初始化数据
 */
export interface ModelDesignInitData {
  /**
   * 名称
   */
  name?: string;
  /**
   * 描述
   */
  description?: string | null;
  /**
   * 命名空间
   * @default 'public'
   */
  namespace?: string;
}

/**
 * 静态类型
 */
export interface DesignRelationStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof DesignRelation,DesignRelationRuleGroup>;
}

/**
 * 初始化数据
 */
export interface DesignRelationInitData {
  /**
   * 关系名
   */
  name?: string;
  /**
   * 关系类型
   */
  relationKind?: string;
  /**
   * 目标实体
   */
  mappedEntityId?: string | null;
  /**
   * 映射属性
   */
  mappedPropertyId?: string | null;
  /**
   * 目标命名空间
   */
  mappedNamespace?: string | null;
  /**
   * columnName
   */
  columnName?: string | null;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * onDeleteAction
   */
  onDeleteAction?: string | null;
  /**
   * onUpdateAction
   */
  onUpdateAction?: string | null;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder?: string;
  /**
   * designEntity id
   */
  designEntityId?: UUID;
}

/**
 * 静态类型
 */
export interface DesignPropertyStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof DesignProperty,DesignPropertyRuleGroup>;
  /**
   * 查询的实体
   */
  entity: DesignProperty;
  /**
   * 查询选项
   */
  findDescendantsOptions: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>;
  /**
   * 查询选项
   */
  countDescendantsOptions: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>;
  /**
   * 查询选项
   */
  findAncestorsOptions: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>;
  /**
   * 查询选项
   */
  countAncestorsOptions: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>;
}

/**
 * 初始化数据
 */
export interface DesignPropertyInitData {
  /**
   * 属性名
   */
  name?: string;
  /**
   * 类型
   */
  propertyType?: "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json";
  /**
   * 列名
   */
  columnName?: string | null;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * isUnique
   */
  isUnique?: boolean;
  /**
   * isNullable
   */
  isNullable?: boolean;
  /**
   * isRequired
   */
  isRequired?: boolean;
  /**
   * isReadonly
   */
  isReadonly?: boolean;
  /**
   * isSortable
   */
  isSortable?: boolean;
  /**
   * 默认值
   */
  defaultValue?: string | null;
  /**
   * 枚举选项
   */
  enumValues?: string[] | null;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder?: string;
  /**
   * 父节点 id
   */
  parentId?: UUID | null;
  /**
   * designEntity id
   */
  designEntityId?: UUID;
}

/**
 * 静态类型
 */
export interface DesignIndexStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof DesignIndex,DesignIndexRuleGroup>;
}

/**
 * 初始化数据
 */
export interface DesignIndexInitData {
  /**
   * 属性ID列表
   */
  propertyIds?: string[];
  /**
   * 唯一索引
   */
  isUnique?: boolean;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder?: string;
  /**
   * designEntity id
   */
  designEntityId?: UUID;
}

/**
 * 静态类型
 */
export interface DesignEntityStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof DesignEntity,DesignEntityRuleGroup>;
}

/**
 * 初始化数据
 */
export interface DesignEntityInitData {
  /**
   * 实体名
   */
  name?: string;
  /**
   * 表名
   */
  tableName?: string | null;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * 命名空间
   */
  entityNamespace?: string | null;
  /**
   * 基类
   * @default 'EntityBase'
   */
  extendsBase?: string;
  /**
   * Repository
   * @default 'Repository'
   */
  repositoryType?: string;
  /**
   * nodeX
   */
  nodeX?: number;
  /**
   * nodeY
   */
  nodeY?: number;
  /**
   * nodeWidth
   */
  nodeWidth?: number;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder?: string;
  /**
   * modelDesign id
   */
  modelDesignId?: UUID;
}

/**
 * 静态类型
 */
export interface ChatSessionStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof ChatSession,ChatSessionRuleGroup>;
}

/**
 * 初始化数据
 */
export interface ChatSessionInitData {
  /**
   * 会话名称
   */
  name?: string;
  /**
   * 会话场景
   * @default 'model-designer'
   */
  contextKind?: "model-designer" | "assistant" | "docs" | "web-llm";
  /**
   * 最近使用时间
   */
  lastUsedAt?: Date;
  /**
   * 创建时间
   */
  createdAt?: Date;
  /**
   * modelDesign id
   */
  modelDesignId?: UUID | null;
}

/**
 * 静态类型
 */
export interface ChatMessageStaticTypes {
  /**
   * id 类型
   */
  idType: UUID;
  /**
   * 查询选项
   */
  getOptions: UUID;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof ChatMessage,ChatMessageRuleGroup>;
}

/**
 * 初始化数据
 */
export interface ChatMessageInitData {
  /**
   * 角色
   */
  role?: "user" | "assistant";
  /**
   * 消息内容
   */
  content?: string;
  /**
   * 创建时间
   */
  createdAt?: Date;
  /**
   * chatSession id
   */
  chatSessionId?: UUID;
}

/**
 * 模型设计
 */
export declare class ModelDesign extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: ModelDesignStaticTypes;
  /**
   * chatSessions
   */
  readonly chatSessions$: RelationEntitiesObservable<typeof ChatSession>;
  /**
   * entities
   */
  readonly entities$: RelationEntitiesObservable<typeof DesignEntity>;
  /**
   * 描述
   */
  description?: string | null;
  /**
   * 名称
   */
  name: string;
  /**
   * 命名空间
   * @default 'public'
   */
  namespace: string;
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: ModelDesignInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * ModelDesign.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof ModelDesign,ModelDesignRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * ModelDesign.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>): Observable<ModelDesign[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * ModelDesign.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>): Observable<ModelDesign[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * ModelDesign.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>): Observable<ModelDesign[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * ModelDesign.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>): Observable<ModelDesign | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * ModelDesign.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof ModelDesign,ModelDesignRuleGroup,ModelDesignOrderByField>): Observable<ModelDesign>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * ModelDesign.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<ModelDesign>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * 设计关系
 */
export declare class DesignRelation extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: DesignRelationStaticTypes;
  /**
   * designEntity
   */
  readonly designEntity$: RelationEntityObservable<typeof DesignEntity>;
  /**
   * columnName
   */
  columnName?: string | null;
  /**
   * designEntity id
   */
  designEntityId: UUID;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * 目标实体
   */
  mappedEntityId?: string | null;
  /**
   * 目标命名空间
   */
  mappedNamespace?: string | null;
  /**
   * 映射属性
   */
  mappedPropertyId?: string | null;
  /**
   * 关系名
   */
  name: string;
  /**
   * onDeleteAction
   */
  onDeleteAction?: string | null;
  /**
   * onUpdateAction
   */
  onUpdateAction?: string | null;
  /**
   * 关系类型
   */
  relationKind: string;
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder: string;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: DesignRelationInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * DesignRelation.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof DesignRelation,DesignRelationRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * DesignRelation.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>): Observable<DesignRelation[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * DesignRelation.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>): Observable<DesignRelation[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * DesignRelation.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>): Observable<DesignRelation[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * DesignRelation.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>): Observable<DesignRelation | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * DesignRelation.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof DesignRelation,DesignRelationRuleGroup,DesignRelationOrderByField>): Observable<DesignRelation>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * DesignRelation.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<DesignRelation>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * 设计属性
 */
export declare class DesignProperty extends TreeAdjacencyListEntityBase implements ITreeEntity {
  static [ENTITY_STATIC_TYPES]: DesignPropertyStaticTypes;
  /**
   * 子节点
   */
  readonly children$: RelationEntitiesObservable<typeof DesignProperty>;
  /**
   * designEntity
   */
  readonly designEntity$: RelationEntityObservable<typeof DesignEntity>;
  /**
   * 是否有子节点
   */
  readonly hasChildren?: boolean | null;
  /**
   * 父节点
   */
  readonly parent$: RelationEntityObservable<typeof DesignProperty>;
  /**
   * 列名
   */
  columnName?: string | null;
  /**
   * 默认值
   */
  defaultValue?: string | null;
  /**
   * designEntity id
   */
  designEntityId: UUID;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * 枚举选项
   */
  enumValues?: string[] | null;
  /**
   * isNullable
   */
  isNullable: boolean;
  /**
   * isReadonly
   */
  isReadonly: boolean;
  /**
   * isRequired
   */
  isRequired: boolean;
  /**
   * isSortable
   */
  isSortable: boolean;
  /**
   * isUnique
   */
  isUnique: boolean;
  /**
   * 属性名
   */
  name: string;
  /**
   * 父节点 id
   */
  parentId?: UUID | null;
  /**
   * 类型
   */
  propertyType: "uuid" | "string" | "enum" | "number" | "integer" | "boolean" | "date" | "stringArray" | "numberArray" | "keyValue" | "json";
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder: string;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: DesignPropertyInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * DesignProperty.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof DesignProperty,DesignPropertyRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 统计祖先实体数量（不包含自身）
   * @param options 查询选项
   * @example
   * // 统计某节点的祖先层级深度
   * DesignProperty.countAncestors({ entityId: grand.id }).subscribe(depth => console.log(depth));
   */
  static countAncestors(options?: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>): Observable<number>;
  static countAncestors<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<number>;
  /**
   * 统计子孙实体数量（不包含自身）
   * @param options 查询选项
   * @example
   * // 统计某节点下的后代数量
   * DesignProperty.countDescendants({ entityId: root.id }).subscribe(count => console.log(count));
   */
  static countDescendants(options?: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>): Observable<number>;
  static countDescendants<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * DesignProperty.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>): Observable<DesignProperty[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * DesignProperty.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>): Observable<DesignProperty[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 查询祖先实体（包含自身）
   * @param options 查询选项
   * @example
   * // 查询某节点的所有祖先（面包屑导航）
   * DesignProperty.findAncestors({ entityId: grand.id }).subscribe(ancestors => console.log(ancestors));
   *
   * // 仅查询直接父节点（level 1）
   * DesignProperty.findAncestors({ entityId: grand.id, level: 1 }).subscribe(parents => console.log(parents));
   */
  static findAncestors(options?: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>): Observable<DesignProperty[]>;
  static findAncestors<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * DesignProperty.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>): Observable<DesignProperty[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询子孙实体（包含自身）
   * @param options 查询选项
   * @example
   * // 查询某节点的所有后代
   * DesignProperty.findDescendants({ entityId: root.id }).subscribe(list => console.log(list));
   *
   * // 仅查询直接子节点（level 1）
   * DesignProperty.findDescendants({ entityId: root.id, level: 1 }).subscribe(children => console.log(children));
   */
  static findDescendants(options?: FindTreeOptions<typeof DesignProperty,DesignPropertyTreeRuleGroup>): Observable<DesignProperty[]>;
  static findDescendants<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * DesignProperty.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>): Observable<DesignProperty | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * DesignProperty.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof DesignProperty,DesignPropertyRuleGroup,DesignPropertyOrderByField>): Observable<DesignProperty>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * DesignProperty.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<DesignProperty>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * 设计索引
 */
export declare class DesignIndex extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: DesignIndexStaticTypes;
  /**
   * designEntity
   */
  readonly designEntity$: RelationEntityObservable<typeof DesignEntity>;
  /**
   * designEntity id
   */
  designEntityId: UUID;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * 唯一索引
   */
  isUnique: boolean;
  /**
   * 属性ID列表
   */
  propertyIds: string[];
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder: string;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: DesignIndexInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * DesignIndex.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof DesignIndex,DesignIndexRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * DesignIndex.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>): Observable<DesignIndex[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * DesignIndex.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>): Observable<DesignIndex[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * DesignIndex.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>): Observable<DesignIndex[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * DesignIndex.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>): Observable<DesignIndex | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * DesignIndex.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof DesignIndex,DesignIndexRuleGroup,DesignIndexOrderByField>): Observable<DesignIndex>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * DesignIndex.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<DesignIndex>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * 设计实体
 */
export declare class DesignEntity extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: DesignEntityStaticTypes;
  /**
   * indexes
   */
  readonly indexes$: RelationEntitiesObservable<typeof DesignIndex>;
  /**
   * modelDesign
   */
  readonly modelDesign$: RelationEntityObservable<typeof ModelDesign>;
  /**
   * properties
   */
  readonly properties$: RelationEntitiesObservable<typeof DesignProperty>;
  /**
   * relations
   */
  readonly relations$: RelationEntitiesObservable<typeof DesignRelation>;
  /**
   * 显示名
   */
  displayName?: string | null;
  /**
   * 命名空间
   */
  entityNamespace?: string | null;
  /**
   * 基类
   * @default 'EntityBase'
   */
  extendsBase: string;
  /**
   * modelDesign id
   */
  modelDesignId: UUID;
  /**
   * 实体名
   */
  name: string;
  /**
   * nodeWidth
   */
  nodeWidth: number;
  /**
   * nodeX
   */
  nodeX: number;
  /**
   * nodeY
   */
  nodeY: number;
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * Repository
   * @default 'Repository'
   */
  repositoryType: string;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * sortOrder
   * @default ''
   */
  sortOrder: string;
  /**
   * 表名
   */
  tableName?: string | null;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: DesignEntityInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * DesignEntity.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof DesignEntity,DesignEntityRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * DesignEntity.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>): Observable<DesignEntity[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * DesignEntity.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>): Observable<DesignEntity[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * DesignEntity.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>): Observable<DesignEntity[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * DesignEntity.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>): Observable<DesignEntity | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * DesignEntity.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof DesignEntity,DesignEntityRuleGroup,DesignEntityOrderByField>): Observable<DesignEntity>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * DesignEntity.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<DesignEntity>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * AI 会话
 */
export declare class ChatSession extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: ChatSessionStaticTypes;
  /**
   * messages
   */
  readonly messages$: RelationEntitiesObservable<typeof ChatMessage>;
  /**
   * modelDesign
   */
  readonly modelDesign$: RelationEntityObservable<typeof ModelDesign>;
  /**
   * 会话场景
   * @default 'model-designer'
   */
  contextKind: "model-designer" | "assistant" | "docs" | "web-llm";
  /**
   * 创建时间
   */
  createdAt: Date;
  /**
   * 最近使用时间
   */
  lastUsedAt: Date;
  /**
   * modelDesign id
   */
  modelDesignId?: UUID | null;
  /**
   * 会话名称
   */
  name: string;
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: ChatSessionInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * ChatSession.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof ChatSession,ChatSessionRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * ChatSession.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>): Observable<ChatSession[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * ChatSession.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>): Observable<ChatSession[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * ChatSession.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>): Observable<ChatSession[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * ChatSession.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>): Observable<ChatSession | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * ChatSession.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof ChatSession,ChatSessionRuleGroup,ChatSessionOrderByField>): Observable<ChatSession>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * ChatSession.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<ChatSession>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

/**
 * AI 消息
 */
export declare class ChatMessage extends EntityBase implements IEntity {
  static [ENTITY_STATIC_TYPES]: ChatMessageStaticTypes;
  /**
   * chatSession
   */
  readonly chatSession$: RelationEntityObservable<typeof ChatSession>;
  /**
   * chatSession id
   */
  chatSessionId: UUID;
  /**
   * 消息内容
   */
  content: string;
  /**
   * 创建时间
   */
  createdAt: Date;
  /**
   * 删除
   */
  remove: () => Promise<this>;
  /**
   * 重置数据
   */
  reset: () => void;
  /**
   * 角色
   */
  role: "user" | "assistant";
  /**
   * 保存
   */
  save: () => Promise<this>;
  /**
   * 初始化数据
   * @param initData 初始化数据
   */
  constructor(initData?: ChatMessageInitData);
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * ChatMessage.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
   */
  static count(options: CountOptions<typeof ChatMessage,ChatMessageRuleGroup>): Observable<number>;
  static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * ChatMessage.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static find(options: FindOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>): Observable<ChatMessage[]>;
  static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * ChatMessage.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findAll(options: FindAllOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>): Observable<ChatMessage[]>;
  static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * ChatMessage.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
   */
  static findByCursor(options: FindByCursorOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>): Observable<ChatMessage[]>;
  static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
  /**
   * 查询单个实体,未找到时返回 null
   * @param options 查询选项
   * @example
   * ChatMessage.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOne(options: FindOneOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>): Observable<ChatMessage | null>;
  static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * ChatMessage.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
   */
  static findOneOrFail(options: FindOneOrFailOptions<typeof ChatMessage,ChatMessageRuleGroup,ChatMessageOrderByField>): Observable<ChatMessage>;
  static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * ChatMessage.get('123').subscribe(entity => console.log(entity));
   */
  static get(options: UUID): Observable<ChatMessage>;
  static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
}

export declare const ENTITIES: EntityType[];
