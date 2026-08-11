/**
 * @fileoverview 加密属性的 schema 与查询校验。
 */

import { EncryptedConfigurationError, EncryptedQueryError, type EncryptedErrorCode } from './errors.js';

type ConfigurationCode = Extract<
  EncryptedErrorCode,
  | 'encrypted_pk_forbidden'
  | 'encrypted_fk_forbidden'
  | 'encrypted_index_forbidden'
  | 'encrypted_unique_forbidden'
  | 'encrypted_sortable_forbidden'
  | 'encrypted_computed_forbidden'
  | 'encrypted_fts_forbidden'
>;

type QueryCode = Extract<
  EncryptedErrorCode,
  'where_on_encrypted' | 'order_on_encrypted' | 'group_on_encrypted' | 'projection_on_encrypted'
>;

interface PropertyShape {
  name: string;
  type?: unknown;
  columnName?: string;
  encrypted?: boolean;
  primary?: boolean;
  unique?: boolean;
  sortable?: boolean;
  searchable?: boolean;
}

interface IndexShape {
  name?: string;
  properties?: ReadonlyArray<string>;
}

interface RelationShape {
  name?: string;
  columnName?: string;
  kind?: string;
  mappedEntity?: string;
  mappedNamespace?: string;
}

/** schema 与查询安全校验所需的最小实体元数据形状。 */
export interface EncryptedAwareEntity {
  name?: string;
  namespace?: string;
  tableName?: string;
  properties?: ReadonlyArray<PropertyShape>;
  computedProperties?: ReadonlyArray<PropertyShape>;
  relations?: ReadonlyArray<RelationShape>;
  relationMap?: ReadonlyMap<string, RelationShape>;
  indexes?: ReadonlyArray<IndexShape>;
  foreignKeyNames?: ReadonlyArray<string>;
  foreignKeyColumnNames?: ReadonlyArray<string>;
  encryptedPropertyMap?: ReadonlyMap<string, PropertyShape>;
}

/** 按实体名与可选 namespace 解析关系目标元数据。返回 `undefined` 会使跨实体查询 fail-closed。 */
export type EncryptedEntityResolver = (entityName: string, namespace?: string) => EncryptedAwareEntity | undefined;

/** 将适配器级字段别名规范化为实体属性路径。 */
export type EncryptedFieldPathNormalizer = (field: string) => string;

interface WhereLeaf {
  field?: string;
  operator?: string;
  where?: WhereGroup;
}

interface WhereGroup {
  combinator: 'and' | 'or';
  rules: ReadonlyArray<WhereLeaf | WhereGroup>;
}

type ParsedWhere = WhereGroup | WhereLeaf;

const entityName = (entity: EncryptedAwareEntity): string | undefined => entity.name ?? entity.tableName;
const isEncrypted = (property: PropertyShape | undefined): boolean => property?.encrypted === true;

function getEncryptedProperties(entity: EncryptedAwareEntity): PropertyShape[] {
  const properties = new Map<string, PropertyShape>();
  for (const property of entity.encryptedPropertyMap?.values() ?? []) {
    properties.set(property.name, property);
  }
  for (const property of [...(entity.properties ?? []), ...(entity.computedProperties ?? [])]) {
    if (isEncrypted(property)) properties.set(property.name, property);
  }
  return [...properties.values()];
}

function getEncryptedAliases(entity: EncryptedAwareEntity): ReadonlyMap<string, PropertyShape> {
  const aliases = new Map<string, PropertyShape>();
  for (const property of getEncryptedProperties(entity)) {
    aliases.set(property.name, property);
    if (property.columnName) aliases.set(property.columnName, property);
  }
  return aliases;
}

function getPropertyAliases(entity: EncryptedAwareEntity): ReadonlyMap<string, PropertyShape> {
  const aliases = new Map<string, PropertyShape>();
  for (const property of [...(entity.properties ?? []), ...(entity.computedProperties ?? [])]) {
    aliases.set(property.name, property);
    if (property.columnName) aliases.set(property.columnName, property);
  }
  return aliases;
}

function throwConfig(code: ConfigurationCode, entity: EncryptedAwareEntity, property: string, hint: string): never {
  throw new EncryptedConfigurationError({
    code,
    entity: entityName(entity),
    property,
    hint,
    message: `${hint} (entity: ${entityName(entity) ?? '?'}, property: ${property})`
  });
}

function throwQuery(code: QueryCode, entity: EncryptedAwareEntity, property: string, hint: string): never {
  throw new EncryptedQueryError({
    code,
    entity: entityName(entity),
    property,
    hint,
    message: `${hint} (entity: ${entityName(entity) ?? '?'}, property: ${property})`
  });
}

function findRelation(entity: EncryptedAwareEntity, segment: string): RelationShape | undefined {
  const direct = entity.relationMap?.get(segment);
  if (direct) return direct;
  return [...(entity.relationMap?.values() ?? []), ...(entity.relations ?? [])].find(
    relation => relation.name === segment || relation.columnName === segment
  );
}

function resolveRelationTarget(
  entity: EncryptedAwareEntity,
  path: string,
  resolveEntity: EncryptedEntityResolver | undefined
): EncryptedAwareEntity | undefined {
  if (!resolveEntity) return undefined;
  const segments = path.split('.');
  let current = entity;
  for (const segment of segments) {
    const relation = findRelation(current, segment);
    if (!relation?.mappedEntity) return undefined;
    const target = resolveEntity(relation.mappedEntity, relation.mappedNamespace ?? current.namespace);
    if (!target) return undefined;
    current = target;
  }
  return current;
}

type FieldResolution = { kind: 'safe' } | { kind: 'encrypted'; owner: EncryptedAwareEntity } | { kind: 'unresolved' };

function resolveQueryField(
  entity: EncryptedAwareEntity,
  path: string,
  resolveEntity: EncryptedEntityResolver | undefined
): FieldResolution {
  const segments = path.split('.');
  let current = entity;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (getEncryptedAliases(current).has(segment)) return { kind: 'encrypted', owner: current };
    if (getPropertyAliases(current).has(segment)) return { kind: 'safe' };
    if (index === segments.length - 1) return { kind: 'safe' };
    const relation = findRelation(current, segment);
    if (!relation?.mappedEntity || !resolveEntity) return { kind: 'unresolved' };
    const target = resolveEntity(relation.mappedEntity, relation.mappedNamespace ?? current.namespace);
    if (!target) return { kind: 'unresolved' };
    current = target;
  }
  return { kind: 'safe' };
}

function validateQueryField(args: {
  entity: EncryptedAwareEntity;
  field: string;
  code: QueryCode;
  hint: string;
  resolveEntity?: EncryptedEntityResolver;
  normalizeField?: EncryptedFieldPathNormalizer;
}): void {
  const field = args.normalizeField?.(args.field) ?? args.field;
  const resolution = resolveQueryField(args.entity, field, args.resolveEntity);
  if (resolution.kind === 'encrypted') throwQuery(args.code, resolution.owner, field, args.hint);
  if (resolution.kind === 'unresolved') {
    throwQuery(args.code, args.entity, field, 'cannot validate unresolved query path');
  }
}

function validateWhere(
  entity: EncryptedAwareEntity,
  where: ParsedWhere | undefined,
  resolveEntity: EncryptedEntityResolver | undefined,
  normalizeField: EncryptedFieldPathNormalizer | undefined
): void {
  if (!where) return;
  if ('field' in where && typeof where.field === 'string') {
    validateQueryField({
      entity,
      field: where.field,
      code: 'where_on_encrypted',
      hint: 'cannot filter on encrypted column',
      resolveEntity,
      normalizeField
    });
    if ((where.operator === 'exists' || where.operator === 'notExists') && where.where) {
      const field = normalizeField?.(where.field) ?? where.field;
      const target = resolveRelationTarget(entity, field, resolveEntity);
      if (!target) throwQuery('where_on_encrypted', entity, field, 'cannot validate unresolved relation query');
      validateWhere(target, where.where, resolveEntity, normalizeField);
    }
    return;
  }
  if ('rules' in where && Array.isArray(where.rules)) {
    for (const child of where.rules) validateWhere(entity, child, resolveEntity, normalizeField);
  }
}

/**
 * 校验加密属性不能参与主键、外键、索引、唯一、排序、计算列或 FTS。
 *
 * @throws {@link EncryptedConfigurationError} 元数据组合不受支持
 */
export function validateEncryptedPropertyMetadata(entity: EncryptedAwareEntity): void {
  const encryptedProperties = getEncryptedProperties(entity);
  if (encryptedProperties.length === 0) return;
  const encryptedAliases = getEncryptedAliases(entity);

  for (const property of encryptedProperties) {
    if (property.primary === true) {
      throwConfig('encrypted_pk_forbidden', entity, property.name, 'primary key cannot be encrypted');
    }
    if (property.unique === true) {
      throwConfig('encrypted_unique_forbidden', entity, property.name, 'unique column cannot be encrypted');
    }
    if (property.sortable === true) {
      throwConfig('encrypted_sortable_forbidden', entity, property.name, 'sortable column cannot be encrypted');
    }
    // `searchable: true` 会把该列的**明文**送进 FTS5 外部内容表。
    // 守卫此前只存在于 `validateFTSRegistrationAgainstEncryptedColumns`，
    // 而那个函数没有任何生产调用方 —— 于是 `encrypted + searchable` 一路放行。
    if (property.searchable === true) {
      throwConfig('encrypted_fts_forbidden', entity, property.name, 'FTS cannot index an encrypted column');
    }
  }

  for (const property of entity.computedProperties ?? []) {
    if (isEncrypted(property)) {
      throwConfig('encrypted_computed_forbidden', entity, property.name, 'computed property cannot be encrypted');
    }
  }

  for (const index of entity.indexes ?? []) {
    for (const property of index.properties ?? []) {
      if (encryptedAliases.has(property)) {
        throwConfig(
          'encrypted_index_forbidden',
          entity,
          property,
          `index "${index.name ?? '?'}" cannot include encrypted column`
        );
      }
    }
  }

  for (const foreignKey of [...(entity.foreignKeyNames ?? []), ...(entity.foreignKeyColumnNames ?? [])]) {
    if (encryptedAliases.has(foreignKey)) {
      throwConfig('encrypted_fk_forbidden', entity, foreignKey, 'foreign key cannot be encrypted');
    }
  }
}

/**
 * 拒绝在加密列上过滤、排序、分组或显式投影。
 *
 * 关系路径必须能由 `resolveEntity` 完整解析；带点路径无法判定时会 fail-closed。
 * adapter 可用 `normalizeField` 把 SQL 别名还原为逻辑属性路径。
 *
 * @throws {@link EncryptedQueryError} 命中加密列或无法可靠解析跨层路径
 */
export function validateQueryAgainstEncryptedColumns(args: {
  entity: EncryptedAwareEntity;
  where?: ParsedWhere;
  order?: ReadonlyArray<{ name: string; direction: 'asc' | 'desc' }>;
  group?: ReadonlyArray<string>;
  projection?: ReadonlyArray<string>;
  resolveEntity?: EncryptedEntityResolver;
  normalizeField?: EncryptedFieldPathNormalizer;
}): void {
  if (args.where) validateWhere(args.entity, args.where, args.resolveEntity, args.normalizeField);

  for (const order of args.order ?? []) {
    validateQueryField({
      entity: args.entity,
      field: order.name,
      code: 'order_on_encrypted',
      hint: 'cannot order by encrypted column',
      resolveEntity: args.resolveEntity,
      normalizeField: args.normalizeField
    });
  }
  for (const group of args.group ?? []) {
    validateQueryField({
      entity: args.entity,
      field: group,
      code: 'group_on_encrypted',
      hint: 'cannot group by encrypted column',
      resolveEntity: args.resolveEntity,
      normalizeField: args.normalizeField
    });
  }
  for (const projection of args.projection ?? []) {
    validateQueryField({
      entity: args.entity,
      field: projection,
      code: 'projection_on_encrypted',
      hint: 'cannot explicitly project encrypted column',
      resolveEntity: args.resolveEntity,
      normalizeField: args.normalizeField
    });
  }
}

/**
 * 拒绝把加密列注册进 FTS 索引。
 *
 * @throws {@link EncryptedConfigurationError} code 固定为 `encrypted_fts_forbidden`
 */
export function validateFTSRegistrationAgainstEncryptedColumns(args: {
  entity: EncryptedAwareEntity;
  ftsColumns: ReadonlyArray<string>;
}): void {
  const encryptedAliases = getEncryptedAliases(args.entity);
  for (const column of args.ftsColumns) {
    if (encryptedAliases.has(column)) {
      throwConfig('encrypted_fts_forbidden', args.entity, column, 'FTS cannot index an encrypted column');
    }
  }
}
