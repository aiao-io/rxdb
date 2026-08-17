/**
 * @packageDocumentation
 * 实体字段工具模块
 * 提供从实体元数据提取字段配置、字段类型转换等功能
 *
 * @remarks
 * 本模块并存两代契约：
 *
 * - **冻结层**：`EntityFieldConfig` 与 `extractEntityFields()` / `extractSystemFields()`
 *   是 US-012 之前的既有导出，行为逐字节冻结，只标 `@deprecated` 不改实现。
 * - **描述层**：`EntityFieldsDescriptor` 与 `describeEntityFields()` /
 *   `parseEntityFieldsDescriptor()` 是新的跨端字段语义契约，修掉冻结层的三处漏报
 *   （丢弃 `encrypted`、看不见 `1:m`/`m:n`、把主键硬编码成 `id`/`uuid`）。
 *
 * 两层不互相调用：冻结层的语义缺陷不能通过复用传染给描述层。
 */
import { RxDBError } from '../RxDBError.js';
import { formatConfigLiteralsOf, missingFormatConfigKeys } from './format-rules.js';
import { isPlainRecord, walkJsonContainer, type JsonWalkPath } from './json-safe.js';
import {
  PropertyType,
  RelationKind,
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  type FieldFormat,
  type FieldOptionDisplay,
  type FieldOptions,
  type KeyValuePropertyMetadata
} from './metadata-options.interface.js';
import {
  FIELD_FORMAT_CONFIG_KEYS,
  type FieldFormatConfigKey,
  type RelationResolutionRule
} from './metadata-validate.js';
import type { EntityMetadata } from './metadata.interface.js';

// ------------------------------------------------------[ 冻结层 ]

/**
 * @deprecated 用 {@link EntityFieldDescriptor} 的 `valueType` / `source` 取代。
 * 本别名把计算属性塌缩成 `'computed'`、把关系塌缩成 `'oneToOne'` / `'manyToOne'`，
 * 丢失了真实值类型，也表达不了 `1:m` / `m:n`。
 */
export type EntityFieldType = PropertyType | 'oneToOne' | 'manyToOne' | 'computed';

export interface KeyValueSchemaEntry {
  label?: string;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'date';
  required?: boolean;
  nullable?: boolean;
}

/**
 * @deprecated 用 {@link EntityFieldDescriptor} 取代。本接口的布尔标志全是可选的，
 * 「没声明」与「声明为 false」不可区分，且完全没有 `encrypted` / `format` / `options`。
 */
export interface EntityFieldConfig {
  field: string;
  displayName: string;
  type: EntityFieldType;
  readonly?: boolean;
  nullable?: boolean;
  required?: boolean;
  unique?: boolean;
  enumValues?: readonly string[];
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
  relatedEntityName?: string;
  relatedNamespace?: string;
}

/** 将实体属性名或关系 ID 名转换为数据库列名。 */
export function getEntityColumnName(metadata: EntityMetadata, field: string): string | undefined {
  const property = metadata.propertyMap.get(field);
  if (property) return property.columnName;
  return metadata.foreignKeyRelationMap.get(field)?.columnName;
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

function propertyToField(key: string, prop: EntityPropertyMetadata): EntityFieldConfig {
  const field: EntityFieldConfig = {
    field: key,
    displayName: prop.displayName ?? key,
    type: prop.type as PropertyType,
    readonly: (prop as Record<string, unknown>)['readonly'] === true,
    nullable: prop.nullable,
    required: prop.required,
    unique: prop.unique
  };
  if (prop.type === PropertyType.enum) {
    field.enumValues = (prop as { enum: readonly string[] }).enum;
  }
  if (prop.type === PropertyType.keyValue) {
    const kvProp = prop as { properties: KeyValuePropertyMetadata[] };
    field.keyValueSchema = Object.fromEntries(
      kvProp.properties.map(p => [
        p.name,
        {
          label: p.displayName,
          type: p.type as KeyValueSchemaEntry['type'],
          required: p.required,
          nullable: p.nullable
        }
      ])
    );
  }
  return field;
}

function relationToField(fkField: string, relation: EntityRelationMetadata): EntityFieldConfig {
  return {
    field: fkField,
    displayName: relation.displayName ?? fkField,
    type: relation.kind === RelationKind.ONE_TO_ONE ? 'oneToOne' : 'manyToOne',
    nullable: (relation as Record<string, unknown>)['nullable'] === true,
    relatedEntityName: relation.mappedEntity,
    relatedNamespace: relation.mappedNamespace
  };
}

/**
 * @deprecated 用 {@link describeEntityFields} 取代。本函数看不见 `1:m` / `m:n` 关系，
 * 也不输出 `encrypted` / `format` / `sortable` / `searchable`。
 */
export function extractEntityFields(metadata: EntityMetadata): EntityFieldConfig[] {
  const fields: EntityFieldConfig[] = [];

  metadata.propertyMap.forEach((prop, key) => {
    if (SYSTEM_FIELDS.has(key)) return;
    fields.push(propertyToField(key, prop));
  });

  metadata.computedPropertyMap.forEach((prop, key) => {
    fields.push({
      field: key,
      displayName: prop.displayName ?? key,
      type: 'computed',
      readonly: true
    });
  });

  metadata.foreignKeyRelationMap.forEach((relation, fkField) => {
    fields.push(relationToField(fkField, relation));
  });

  return fields;
}

/**
 * @deprecated 用 {@link describeEntityFields} 取代：系统字段以 `source: 'system'`
 * 混在同一张表里。本函数把主键硬编码成 `id` / `uuid` / `readonly: true`，
 * 主键叫别的名字或声明成可写时会直接报错。
 */
export function extractSystemFields(metadata: EntityMetadata): EntityFieldConfig[] {
  const fields: EntityFieldConfig[] = [{ field: 'id', displayName: 'ID', type: PropertyType.uuid, readonly: true }];

  if (metadata.propertyMap.has('createdAt')) {
    fields.push({ field: 'createdAt', displayName: '创建时间', type: PropertyType.date, readonly: true });
  }
  if (metadata.propertyMap.has('updatedAt')) {
    fields.push({ field: 'updatedAt', displayName: '更新时间', type: PropertyType.date, readonly: true });
  }
  if (metadata.propertyMap.has('createdBy')) {
    fields.push({ field: 'createdBy', displayName: '创建者', type: PropertyType.string, readonly: true });
  }
  if (metadata.propertyMap.has('updatedBy')) {
    fields.push({ field: 'updatedBy', displayName: '更新者', type: PropertyType.string, readonly: true });
  }

  return fields;
}

// ------------------------------------------------------[ 字段描述 DTO ]

/**
 * 字段描述 DTO 的协议版本。
 *
 * @remarks
 * 唯一真相源：`describeEntityFields()` 写入它，`parseEntityFieldsDescriptor()` 先校验它。
 * 版本不匹配一律解析失败，不做跨版本兼容。
 */
export const ENTITY_FIELDS_DTO_VERSION = 1;

/**
 * 按 `entity` / `namespace` 查找已注册实体元数据。
 *
 * @remarks
 * 返回 `undefined` 表示目标未注册；{@link describeEntityFields} 会因此抛错，
 * 不会退化成猜测主键类型。
 */
export type EntityMetadataResolver = (entity: string, namespace: string) => EntityMetadata | undefined;

/**
 * 字段基数。
 *
 * @remarks
 * 由 {@link PropertyType} / {@link RelationKind} 派生的只读投影（INV-1），
 * 不是可独立声明的开关。
 */
export type FieldCardinality = 'multiple' | 'single';

/** 字段来源判别式。系统字段与普通属性形状相同，只在这里区分。 */
export type FieldSource = 'computed' | 'property' | 'relation' | 'system';

/** 关系字段的值类型全集：目标实体主键只允许这四种。 */
export type RelationValueType = `${
  PropertyType.bigint | PropertyType.integer | PropertyType.string | PropertyType.uuid}`;

/**
 * 字段描述的公共部分。
 *
 * @remarks
 * 布尔标志只在元数据真能声明它时才出现：属性与计算属性恒输出
 * `readonly` / `nullable` / `required` / `unique` / `encrypted` 五键，
 * `sortable` / `searchable` / `primary` 只在对应 `PropertyType` 支持时出现。
 * 「键不存在」表示该维度对此字段不适用，与「值为 false」语义不同。
 */
interface EntityFieldDescriptorBase {
  field: string;
  displayName: string;
  cardinality: FieldCardinality;
  valueType: `${PropertyType}`;
  format?: FieldFormat;
  readonly: boolean;
  nullable: boolean;
  required: boolean;
  unique: boolean;
  encrypted: boolean;
  sortable?: boolean;
  searchable?: boolean;
  primary?: boolean;
  enum?: readonly string[];
  options?: FieldOptions;
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
}

/** 普通属性与系统字段的描述。 */
export interface EntityPropertyFieldDescriptor extends EntityFieldDescriptorBase {
  source: 'property' | 'system';
  relation?: never;
}

/** 计算属性的描述：输出真实 `valueType`，永远只读。 */
export interface EntityComputedFieldDescriptor extends EntityFieldDescriptorBase {
  source: 'computed';
  readonly: true;
  relation?: never;
}

/**
 * 关系字段描述的公共部分。
 *
 * @remarks
 * 关系不接受 `format`（INV-1），也没有 `searchable` / `primary` / `enum` /
 * `options` / `keyValueSchema` 这些属性维度；`readonly` 是常量 `true`（D9.1），
 * 不读元数据。四种 kind 都 `extends ISortable`，因此 `sortable` 恒输出。
 */
type EntityRelationFieldDescriptorBase = Omit<
  EntityFieldDescriptorBase,
  | 'encrypted'
  | 'enum'
  | 'format'
  | 'keyValueSchema'
  | 'nullable'
  | 'options'
  | 'primary'
  | 'readonly'
  | 'required'
  | 'searchable'
  | 'unique'
  | 'valueType'
> & {
  source: 'relation';
  readonly: true;
  format?: never;
  searchable?: never;
  primary?: never;
  enum?: never;
  options?: never;
  keyValueSchema?: never;
  sortable: boolean;
  valueType: RelationValueType;
  relation: {
    kind: `${RelationKind}`;
    entity: string;
    namespace: string;
    mutation: 'add-remove' | 'set-remove';
    writeField?: string;
  };
};

/** `1:1` / `m:1` 关系：单值，写外键列，语义是「设置 / 清除」。 */
export type EntityToOneRelationFieldDescriptor = EntityRelationFieldDescriptorBase & {
  cardinality: 'single';
  nullable: boolean;
  required: boolean;
  unique: boolean;
  encrypted: boolean;
  relation: {
    kind: `${RelationKind.MANY_TO_ONE | RelationKind.ONE_TO_ONE}`;
    mutation: 'set-remove';
    writeField: string;
  };
};

/** `1:m` / `m:n` 关系：多值，没有可写外键列，语义是「加入 / 移出」。 */
export type EntityToManyRelationFieldDescriptor = EntityRelationFieldDescriptorBase & {
  cardinality: 'multiple';
  nullable?: never;
  required?: never;
  unique?: never;
  encrypted?: never;
  relation: {
    kind: `${RelationKind.MANY_TO_MANY | RelationKind.ONE_TO_MANY}`;
    mutation: 'add-remove';
    writeField?: never;
  };
};

/** 关系字段描述。用顶层 `cardinality` 收窄到具体分支。 */
export type EntityRelationFieldDescriptor = EntityToManyRelationFieldDescriptor | EntityToOneRelationFieldDescriptor;

/** 单个字段的描述。用 `source` 收窄到具体分支（INV-5）。 */
export type EntityFieldDescriptor =
  EntityComputedFieldDescriptor | EntityPropertyFieldDescriptor | EntityRelationFieldDescriptor;

/** 一个实体的完整字段描述。 */
export interface EntityFieldsDescriptor {
  dtoVersion: typeof ENTITY_FIELDS_DTO_VERSION;
  entity: string;
  namespace: string;
  fields: EntityFieldDescriptor[];
}

/**
 * 关系目标解析失败。
 *
 * @remarks
 * 与注册期的 {@link EntityMetadataValidationError} 分开：那批规则在 `EntityManager.init()`
 * 聚合上报，本错误在生成字段描述时立即抛出，`details` 供调用方定位到具体字段。
 */
export class EntityRelationResolutionError extends RxDBError {
  constructor(
    message: string,
    readonly details: {
      namespace: string;
      entity: string;
      field: string;
      rule: RelationResolutionRule;
    }
  ) {
    super(message);
    this.name = 'EntityRelationResolutionError';
    Object.setPrototypeOf(this, EntityRelationResolutionError.prototype);
  }
}

// ------------------------------------------------------[ 能力矩阵 ]

/** 多值属性类型：决定 `cardinality`（INV-3）。 */
const MULTI_VALUE_PROPERTY_TYPES: ReadonlySet<string> = new Set([PropertyType.stringArray, PropertyType.numberArray]);

/** 接口 `extends ISortable` 的属性类型。 */
const SORTABLE_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  PropertyType.bigint,
  PropertyType.boolean,
  PropertyType.date,
  PropertyType.enum,
  PropertyType.integer,
  PropertyType.number,
  PropertyType.numberArray,
  PropertyType.string,
  PropertyType.stringArray,
  PropertyType.uuid
]);

/** 接口声明了 `searchable?` 的属性类型。 */
const SEARCHABLE_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  PropertyType.enum,
  PropertyType.string,
  PropertyType.stringArray
]);

/** 接口声明了 `primary?` 的属性类型，也是关系外键值类型的全集。 */
const PRIMARY_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  PropertyType.bigint,
  PropertyType.integer,
  PropertyType.string,
  PropertyType.uuid
]);

/** 读取属性/关系上的布尔标志：只有显式 `true` 才算声明过。 */
const readFlag = (source: object, key: string): boolean => (source as Record<string, unknown>)[key] === true;

// ------------------------------------------------------[ describeEntityFields ]

/** 只在载体声明了 `format` 时产出该键。 */
const formatKey = (prop: EntityPropertyMetadata): { format?: FieldFormat } => {
  const format = (prop as Record<string, unknown>)['format'];
  return format === undefined ? {} : { format: format as FieldFormat };
};

/** 只在载体声明了 `enum` 时产出该键，顺序原样保留。 */
const enumKey = (prop: EntityPropertyMetadata): { enum?: readonly string[] } => {
  const values = (prop as Record<string, unknown>)['enum'];
  return values === undefined ? {} : { enum: values as readonly string[] };
};

/** 只在载体声明了 `options` 时产出该键。 */
const optionsKey = (prop: EntityPropertyMetadata): { options?: FieldOptions } => {
  const options = (prop as Record<string, unknown>)['options'];
  return options === undefined ? {} : { options: options as FieldOptions };
};

/** 把 keyValue 的嵌套属性折成 schema 条目；未声明的键直接省略，保持 JSON-safe。 */
const toKeyValueEntry = (item: KeyValuePropertyMetadata): KeyValueSchemaEntry => ({
  ...(item.displayName === undefined ? {} : { label: item.displayName }),
  type: item.type as KeyValueSchemaEntry['type'],
  ...(item.required === undefined ? {} : { required: item.required }),
  ...(item.nullable === undefined ? {} : { nullable: item.nullable })
});

/** 只有 keyValue 属性产出 `keyValueSchema`。 */
const keyValueSchemaKey = (prop: EntityPropertyMetadata): { keyValueSchema?: Record<string, KeyValueSchemaEntry> } => {
  if (prop.type !== PropertyType.keyValue) return {};
  const nested = (prop as { properties: KeyValuePropertyMetadata[] }).properties;
  return { keyValueSchema: Object.fromEntries(nested.map(item => [item.name, toKeyValueEntry(item)])) };
};

/** 按能力矩阵产出 `sortable` / `searchable` / `primary`：接口不支持就不出现该键。 */
const capabilityKeys = (
  prop: EntityPropertyMetadata
): { sortable?: boolean; searchable?: boolean; primary?: boolean } => ({
  ...(SORTABLE_PROPERTY_TYPES.has(prop.type) ? { sortable: readFlag(prop, 'sortable') } : {}),
  ...(SEARCHABLE_PROPERTY_TYPES.has(prop.type) ? { searchable: readFlag(prop, 'searchable') } : {}),
  ...(PRIMARY_PROPERTY_TYPES.has(prop.type) ? { primary: readFlag(prop, 'primary') } : {})
});

/** 描述一个普通属性或系统字段。 */
function describeProperty(key: string, prop: EntityPropertyMetadata): EntityPropertyFieldDescriptor {
  return {
    field: key,
    displayName: prop.displayName ?? key,
    source: SYSTEM_FIELDS.has(key) ? 'system' : 'property',
    cardinality: MULTI_VALUE_PROPERTY_TYPES.has(prop.type) ? 'multiple' : 'single',
    valueType: prop.type,
    ...formatKey(prop),
    readonly: readFlag(prop, 'readonly'),
    nullable: readFlag(prop, 'nullable'),
    required: readFlag(prop, 'required'),
    unique: readFlag(prop, 'unique'),
    encrypted: readFlag(prop, 'encrypted'),
    ...capabilityKeys(prop),
    ...enumKey(prop),
    ...optionsKey(prop),
    ...keyValueSchemaKey(prop)
  };
}

/** 描述一个计算属性：形状同属性，只是 `source` 与 `readonly` 固定。 */
function describeComputed(key: string, prop: EntityPropertyMetadata): EntityComputedFieldDescriptor {
  return { ...describeProperty(key, prop), source: 'computed', readonly: true };
}

/** 解析关系目标的主键类型，作为外键的值类型。 */
function resolveRelationValueType(
  metadata: EntityMetadata,
  relation: EntityRelationMetadata,
  namespace: string,
  resolve: EntityMetadataResolver
): RelationValueType {
  const target = resolve(relation.mappedEntity, namespace);
  const location = `${metadata.namespace}/${metadata.name} 的关系 ${relation.name}`;
  if (!target) {
    throw new RxDBError(`${location} 指向未注册实体 ${namespace}/${relation.mappedEntity}`);
  }

  const details = { namespace: metadata.namespace, entity: metadata.name, field: relation.name };
  const primaries = [...target.propertyMap.values()].filter(prop => readFlag(prop, 'primary'));
  // 取 `find()` 的第一个等于让外键类型跟着 Map 插入顺序走 —— 属于「无 fallback 兜底」铁律禁止的静默兜底。
  // 与下面「主键数 = 0」是同一个目标实体的同一类声明错误，因此走同一种结构化错误：
  // 调用方 catch EntityRelationResolutionError 后能照样从 details 拿到字段归属。
  if (primaries.length > 1) {
    const names = primaries.map(prop => prop.name).join('、');
    throw new EntityRelationResolutionError(
      `${location} 的目标实体 ${namespace}/${relation.mappedEntity} 声明了多个主键：${names}`,
      { ...details, rule: 'multipleRelationPrimaries' }
    );
  }
  const primary = primaries[0];
  if (!primary) {
    throw new EntityRelationResolutionError(
      `${location} 的目标实体 ${namespace}/${relation.mappedEntity} 没有声明主键`,
      {
        ...details,
        rule: 'missingRelationPrimary'
      }
    );
  }
  if (!PRIMARY_PROPERTY_TYPES.has(primary.type)) {
    throw new EntityRelationResolutionError(`${location} 的目标主键类型 "${primary.type}" 不能作为外键值类型`, {
      ...details,
      rule: 'unsupportedRelationValueType'
    });
  }
  return primary.type as RelationValueType;
}

/** 描述一个关系字段。`field` 取关系名，外键列不单独成字段（D9）。 */
function describeRelation(
  metadata: EntityMetadata,
  relation: EntityRelationMetadata,
  resolve: EntityMetadataResolver
): EntityRelationFieldDescriptor {
  const namespace = relation.mappedNamespace ?? metadata.namespace;
  const base = {
    field: relation.name,
    displayName: relation.displayName ?? relation.name,
    source: 'relation' as const,
    valueType: resolveRelationValueType(metadata, relation, namespace, resolve),
    readonly: true as const,
    sortable: readFlag(relation, 'sortable')
  };
  const target = { entity: relation.mappedEntity, namespace };

  if (relation.kind === RelationKind.ONE_TO_ONE || relation.kind === RelationKind.MANY_TO_ONE) {
    return {
      ...base,
      cardinality: 'single',
      nullable: readFlag(relation, 'nullable'),
      required: readFlag(relation, 'required'),
      unique: readFlag(relation, 'unique'),
      encrypted: readFlag(relation, 'encrypted'),
      relation: { kind: relation.kind, ...target, mutation: 'set-remove', writeField: `${relation.name}Id` }
    };
  }
  return {
    ...base,
    cardinality: 'multiple',
    relation: { kind: relation.kind, ...target, mutation: 'add-remove' }
  };
}

/**
 * 生成一个实体的完整字段描述。
 *
 * @param metadata - 已完成 `transitionMetadata()` 的实体元数据
 * @param resolve - 关系目标解析器；返回 `undefined` 直接抛错，不猜测主键类型（D7）
 *
 * @returns 严格 JSON-safe 的字段描述；`fields` 顺序恒为
 *   `propertyMap` → `computedPropertyMap` → `relationMap`，各组内保持 Map 插入顺序（INV-6）
 *
 * @throws {@link EntityRelationResolutionError} 关系目标缺主键或主键类型不受支持
 * @throws {@link RxDBError} 关系目标未注册
 */
export function describeEntityFields(
  metadata: EntityMetadata,
  resolve: EntityMetadataResolver
): EntityFieldsDescriptor {
  const fields: EntityFieldDescriptor[] = [];

  metadata.propertyMap.forEach((prop, key) => fields.push(describeProperty(key, prop)));
  metadata.computedPropertyMap.forEach((prop, key) => fields.push(describeComputed(key, prop)));
  metadata.relationMap.forEach(relation => fields.push(describeRelation(metadata, relation, resolve)));

  return {
    dtoVersion: ENTITY_FIELDS_DTO_VERSION,
    entity: metadata.name,
    namespace: metadata.namespace,
    fields
  };
}

// ------------------------------------------------------[ parseEntityFieldsDescriptor ]

/** `format` 各配置键的线格式。键集与 {@link FIELD_FORMAT_CONFIG_KEYS} 的取值全集一一对应。 */
const FORMAT_CONFIG_WIRE_TYPES: Record<FieldFormatConfigKey, 'number' | 'string' | 'stringArray'> = {
  colorSpace: 'string',
  contentType: 'string',
  currency: 'string',
  display: 'string',
  language: 'string',
  max: 'number',
  min: 'number',
  scale: 'string',
  schemes: 'stringArray',
  step: 'number',
  timezone: 'string',
  unit: 'string'
};

const FIELD_SOURCES: readonly FieldSource[] = ['computed', 'property', 'relation', 'system'];
const CARDINALITIES: readonly FieldCardinality[] = ['multiple', 'single'];
const PROPERTY_VALUE_TYPES = Object.values(PropertyType) as readonly `${PropertyType}`[];
const RELATION_VALUE_TYPES: readonly RelationValueType[] = [
  PropertyType.bigint,
  PropertyType.integer,
  PropertyType.string,
  PropertyType.uuid
];
const RELATION_KINDS = Object.values(RelationKind) as readonly `${RelationKind}`[];
const KEY_VALUE_ENTRY_TYPES: readonly NonNullable<KeyValueSchemaEntry['type']>[] = [
  'boolean',
  'date',
  'integer',
  'number',
  'string'
];

/** 关系字段绝不携带的属性维度键（INV-5）。 */
const RELATION_FORBIDDEN_KEYS: readonly string[] = [
  'enum',
  'format',
  'keyValueSchema',
  'options',
  'primary',
  'searchable'
];

/** `1:m` / `m:n` 绝不携带的单值语义键（INV-5）。 */
const TO_MANY_FORBIDDEN_KEYS: readonly string[] = ['encrypted', 'nullable', 'required', 'unique'];

/** 分组序号，用于校验 INV-6 的字段顺序。 */
const FIELD_SOURCE_RANK: Record<FieldSource, number> = { property: 0, system: 0, computed: 1, relation: 2 };

/** 构造解析失败错误。 */
const parseError = (path: string, reason: string): RxDBError =>
  new RxDBError(`实体字段描述解析失败：${path} ${reason}`);

/**
 * 递归判定输入是否严格 JSON-safe；不安全值直接失败，不做静默丢弃。
 *
 * @remarks
 * 循环引用也算不安全：不拦就是 `RangeError: Maximum call stack size exceeded`，
 * 会漏过调用方 `catch (e) { if (e instanceof RxDBError) }` 的分支，破坏本函数
 * 「解析失败抛 {@link RxDBError}」的契约。进出场纪律与 `entity-value.utils.ts`
 * 的两个遍历器共用 {@link walkJsonContainer}。
 */
function assertJsonSafe(value: unknown, path: string, walked: JsonWalkPath = new WeakSet()): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw parseError(path, '不是有限数值');
    return;
  }
  const onCycle = (): never => {
    throw parseError(path, '存在循环引用');
  };
  if (Array.isArray(value)) {
    const visit = (): void => value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`, walked));
    walkJsonContainer(value as object, walked, visit, onCycle);
    return;
  }
  if (!isPlainRecord(value)) throw parseError(path, `不是 JSON-safe 的值（${Object.prototype.toString.call(value)}）`);
  const visit = (): void =>
    Object.entries(value).forEach(([key, item]) => assertJsonSafe(item, `${path}.${key}`, walked));
  walkJsonContainer(value, walked, visit, onCycle);
}

/** 取必填字符串。 */
function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  throw parseError(`${path}.${key}`, '必须是字符串');
}

/** 取必填布尔。 */
function requireBoolean(record: Record<string, unknown>, key: string, path: string): boolean {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  throw parseError(`${path}.${key}`, '必须是布尔值');
}

/** 取必填字面量。 */
function requireLiteral<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[]
): T {
  const value = record[key];
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw parseError(`${path}.${key}`, `必须是 ${allowed.join(' | ')} 之一`);
}

/** 键不存在则不产出；存在则必须是布尔。 */
function optionalBoolean<K extends string>(
  record: Record<string, unknown>,
  key: K,
  path: string
): { [P in K]?: boolean } {
  if (!(key in record)) return {};
  return { [key]: requireBoolean(record, key, path) } as { [P in K]?: boolean };
}

/** 键不存在则不产出；存在则必须是字符串。 */
function optionalString<K extends string>(
  record: Record<string, unknown>,
  key: K,
  path: string
): { [P in K]?: string } {
  if (!(key in record)) return {};
  return { [key]: requireString(record, key, path) } as { [P in K]?: string };
}

/**
 * 校验单个 format 配置值的线格式。
 *
 * @remarks
 * 线格式之外还要判字面量联合：`scale` / `contentType` / `unit` / `colorSpace` / `display`
 * 在类型层都是字面量联合而非任意字符串，只判 `typeof === 'string'` 就会把
 * `{ kind: 'percentage', scale: 'bogus' }` 断言成 `FieldFormat` —— 下游
 * `validateFieldValue()` 拿它去查 `PERCENTAGE_DOMAIN` 会解构到 `undefined` 直接崩。
 * 字面量表与注册期闸门同源（`format-rules.ts`）。
 */
function parseFormatConfigValue(key: string, value: unknown, path: string): number | string | readonly string[] {
  const wire = FORMAT_CONFIG_WIRE_TYPES[key as FieldFormatConfigKey];
  if (wire === 'number') {
    if (typeof value === 'number') return value;
    throw parseError(`${path}.${key}`, '必须是数值');
  }
  if (wire === 'stringArray') {
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value as readonly string[];
    throw parseError(`${path}.${key}`, '必须是字符串数组');
  }
  if (typeof value !== 'string') throw parseError(`${path}.${key}`, '必须是字符串');

  const literals = formatConfigLiteralsOf(key);
  if (literals && !literals.includes(value)) {
    throw parseError(`${path}.${key}`, `必须是 ${literals.join(' | ')} 之一`);
  }
  return value;
}

/**
 * 解析 `format`。
 *
 * @remarks
 * D6.1 的两半都在这里：陌生键（含跨 format 的合法键）静默丢弃，**必填键缺失则显式失败**。
 * 后者不能一并丢弃——`RichTextFormat.contentType`、`RatingFormat.min/max/step` 都是必选属性，
 * 放行会产出一个 `as FieldFormat` 断言出来的类型谎言，下游 `validateFieldValue()` 读到
 * `undefined` 的 min/max 就静默跳过全部范围校验。必填键表与注册期闸门同源（`format-rules.ts`）。
 */
function parseFormatKey(record: Record<string, unknown>, path: string): { format?: FieldFormat } {
  if (!('format' in record)) return {};
  const format = record['format'];
  const formatPath = `${path}.format`;
  if (!isPlainRecord(format)) throw parseError(formatPath, '必须是对象');

  const kind = requireLiteral(format, 'kind', formatPath, Object.keys(FIELD_FORMAT_CONFIG_KEYS));
  const missing = missingFormatConfigKeys(kind, format);
  if (missing.length > 0) throw parseError(formatPath, `format "${kind}" 缺少必填配置 ${missing.join('、')}`);

  const config = FIELD_FORMAT_CONFIG_KEYS[kind as FieldFormat['kind']]
    .filter(key => key in format)
    .map(key => [key, parseFormatConfigValue(key, format[key], formatPath)] as const);
  return { format: { kind, ...Object.fromEntries(config) } as FieldFormat };
}

/** 解析 `enum`：值集合原样保留，顺序不动。 */
function parseEnumKey(record: Record<string, unknown>, path: string): { enum?: readonly string[] } {
  if (!('enum' in record)) return {};
  const values = record['enum'];
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string')) {
    throw parseError(`${path}.enum`, '必须是字符串数组');
  }
  return { enum: values as readonly string[] };
}

/** 解析单个选项展示项：业务键（选项值）保留，未知展示键丢弃。 */
function parseOptionDisplay(value: unknown, path: string): FieldOptionDisplay {
  if (!isPlainRecord(value)) throw parseError(path, '必须是对象');
  return {
    ...optionalString(value, 'label', path),
    ...optionalString(value, 'color', path),
    ...optionalBoolean(value, 'disabled', path)
  };
}

/** 解析 `options`。 */
function parseOptionsKey(record: Record<string, unknown>, path: string): { options?: FieldOptions } {
  if (!('options' in record)) return {};
  const options = record['options'];
  const optionsPath = `${path}.options`;
  if (!isPlainRecord(options)) throw parseError(optionsPath, '必须是对象');
  return {
    options: Object.fromEntries(
      Object.entries(options).map(([key, display]) => [key, parseOptionDisplay(display, `${optionsPath}.${key}`)])
    )
  };
}

/** 解析单个 keyValue schema 条目。 */
function parseKeyValueEntry(value: unknown, path: string): KeyValueSchemaEntry {
  if (!isPlainRecord(value)) throw parseError(path, '必须是对象');
  const type = 'type' in value ? { type: requireLiteral(value, 'type', path, KEY_VALUE_ENTRY_TYPES) } : {};
  return {
    ...optionalString(value, 'label', path),
    ...type,
    ...optionalBoolean(value, 'required', path),
    ...optionalBoolean(value, 'nullable', path)
  };
}

/** 解析 `keyValueSchema`：业务键（嵌套属性名）保留。 */
function parseKeyValueSchemaKey(
  record: Record<string, unknown>,
  path: string
): { keyValueSchema?: Record<string, KeyValueSchemaEntry> } {
  if (!('keyValueSchema' in record)) return {};
  const schema = record['keyValueSchema'];
  const schemaPath = `${path}.keyValueSchema`;
  if (!isPlainRecord(schema)) throw parseError(schemaPath, '必须是对象');
  return {
    keyValueSchema: Object.fromEntries(
      Object.entries(schema).map(([key, entry]) => [key, parseKeyValueEntry(entry, `${schemaPath}.${key}`)])
    )
  };
}

/** 解析属性 / 系统字段 / 计算属性描述。 */
function parsePropertyField(
  record: Record<string, unknown>,
  source: 'computed' | 'property' | 'system',
  path: string
): EntityComputedFieldDescriptor | EntityPropertyFieldDescriptor {
  if ('relation' in record) throw parseError(path, `source "${source}" 不接受 relation 键`);

  const valueType = requireLiteral(record, 'valueType', path, PROPERTY_VALUE_TYPES);
  const cardinality = requireLiteral(record, 'cardinality', path, CARDINALITIES);
  const expected: FieldCardinality = MULTI_VALUE_PROPERTY_TYPES.has(valueType) ? 'multiple' : 'single';
  if (cardinality !== expected) {
    throw parseError(`${path}.cardinality`, `与 valueType "${valueType}" 不一致，必须是 "${expected}"`);
  }

  const readonly = requireBoolean(record, 'readonly', path);
  if (source === 'computed' && !readonly) throw parseError(`${path}.readonly`, 'source "computed" 恒为 true');

  const base = {
    field: requireString(record, 'field', path),
    displayName: requireString(record, 'displayName', path),
    cardinality,
    valueType,
    ...parseFormatKey(record, path),
    readonly,
    nullable: requireBoolean(record, 'nullable', path),
    required: requireBoolean(record, 'required', path),
    unique: requireBoolean(record, 'unique', path),
    encrypted: requireBoolean(record, 'encrypted', path),
    ...optionalBoolean(record, 'sortable', path),
    ...optionalBoolean(record, 'searchable', path),
    ...optionalBoolean(record, 'primary', path),
    ...parseEnumKey(record, path),
    ...parseOptionsKey(record, path),
    ...parseKeyValueSchemaKey(record, path)
  };
  return source === 'computed' ? { ...base, source, readonly: true } : { ...base, source };
}

/** 解析 `1:1` / `m:1` 关系描述。 */
function parseToOneRelationField(
  record: Record<string, unknown>,
  relation: Record<string, unknown>,
  kind: `${RelationKind.MANY_TO_ONE | RelationKind.ONE_TO_ONE}`,
  base: Omit<EntityRelationFieldDescriptorBase, 'cardinality' | 'relation'>,
  path: string
): EntityToOneRelationFieldDescriptor {
  const relationPath = `${path}.relation`;
  if (requireLiteral(record, 'cardinality', path, CARDINALITIES) !== 'single') {
    throw parseError(`${path}.cardinality`, `与关系 kind "${kind}" 不一致，必须是 "single"`);
  }
  return {
    ...base,
    cardinality: 'single',
    nullable: requireBoolean(record, 'nullable', path),
    required: requireBoolean(record, 'required', path),
    unique: requireBoolean(record, 'unique', path),
    encrypted: requireBoolean(record, 'encrypted', path),
    relation: {
      kind,
      entity: requireString(relation, 'entity', relationPath),
      namespace: requireString(relation, 'namespace', relationPath),
      mutation: requireLiteral(relation, 'mutation', relationPath, ['set-remove'] as const),
      writeField: requireString(relation, 'writeField', relationPath)
    }
  };
}

/** 解析 `1:m` / `m:n` 关系描述。 */
function parseToManyRelationField(
  record: Record<string, unknown>,
  relation: Record<string, unknown>,
  kind: `${RelationKind.MANY_TO_MANY | RelationKind.ONE_TO_MANY}`,
  base: Omit<EntityRelationFieldDescriptorBase, 'cardinality' | 'relation'>,
  path: string
): EntityToManyRelationFieldDescriptor {
  const relationPath = `${path}.relation`;
  const extra = TO_MANY_FORBIDDEN_KEYS.filter(key => key in record);
  if (extra.length > 0) throw parseError(path, `关系 kind "${kind}" 不接受 ${extra.join('、')} 键`);
  if ('writeField' in relation) throw parseError(relationPath, `关系 kind "${kind}" 不接受 writeField 键`);
  if (requireLiteral(record, 'cardinality', path, CARDINALITIES) !== 'multiple') {
    throw parseError(`${path}.cardinality`, `与关系 kind "${kind}" 不一致，必须是 "multiple"`);
  }
  return {
    ...base,
    cardinality: 'multiple',
    relation: {
      kind,
      entity: requireString(relation, 'entity', relationPath),
      namespace: requireString(relation, 'namespace', relationPath),
      mutation: requireLiteral(relation, 'mutation', relationPath, ['add-remove'] as const)
    }
  };
}

/** 判定是否为单值关系 kind。 */
const isToOneKind = (kind: `${RelationKind}`): kind is `${RelationKind.MANY_TO_ONE | RelationKind.ONE_TO_ONE}` =>
  kind === RelationKind.ONE_TO_ONE || kind === RelationKind.MANY_TO_ONE;

/** 解析关系字段描述。 */
function parseRelationField(record: Record<string, unknown>, path: string): EntityRelationFieldDescriptor {
  const forbidden = RELATION_FORBIDDEN_KEYS.filter(key => key in record);
  if (forbidden.length > 0) throw parseError(path, `关系字段不接受 ${forbidden.join('、')} 键`);
  if (!requireBoolean(record, 'readonly', path)) throw parseError(`${path}.readonly`, '关系字段恒为 true');

  const relationPath = `${path}.relation`;
  const relation = record['relation'];
  if (!isPlainRecord(relation)) throw parseError(relationPath, '必须是对象');

  const base = {
    field: requireString(record, 'field', path),
    displayName: requireString(record, 'displayName', path),
    source: 'relation' as const,
    valueType: requireLiteral(record, 'valueType', path, RELATION_VALUE_TYPES),
    readonly: true as const,
    sortable: requireBoolean(record, 'sortable', path)
  };
  const kind = requireLiteral(relation, 'kind', relationPath, RELATION_KINDS);
  return isToOneKind(kind) ?
      parseToOneRelationField(record, relation, kind, base, path)
    : parseToManyRelationField(record, relation, kind, base, path);
}

/** 解析单个字段描述，按 `source` 分派。 */
function parseFieldDescriptor(value: unknown, path: string): EntityFieldDescriptor {
  if (!isPlainRecord(value)) throw parseError(path, '必须是对象');
  const source = requireLiteral(value, 'source', path, FIELD_SOURCES);
  return source === 'relation' ? parseRelationField(value, path) : parsePropertyField(value, source, path);
}

/** 校验字段顺序满足 INV-6 的分组约束。 */
function assertFieldOrder(fields: readonly EntityFieldDescriptor[], path: string): void {
  const ranks = fields.map(field => FIELD_SOURCE_RANK[field.source]);
  const broken = ranks.findIndex((rank, index) => index > 0 && rank < (ranks[index - 1] as number));
  if (broken >= 0) throw parseError(`${path}[${broken}]`, '违反 INV-6：必须按属性 → 计算属性 → 关系分组排列');
}

/**
 * 解析并校验来自网络或存储的字段描述。
 *
 * @param value - 任意未受信输入
 *
 * @returns 全新构造的描述对象；任意层级的未知键都不会出现在返回值里
 *
 * @throws {@link RxDBError} `dtoVersion` 不匹配、已知键缺失或类型错误、
 *   值非 JSON-safe，或字段组合违反 INV-4 / INV-5 / INV-6
 *
 * @remarks
 * 未知键静默丢弃、已知键严格校验（D6.1）。跨 format 的陌生配置键属于前者：
 * 那是注册期 `invalidFormatConfig` 的职责，解析器只负责把它删掉。
 */
export function parseEntityFieldsDescriptor(value: unknown): EntityFieldsDescriptor {
  assertJsonSafe(value, '$');
  if (!isPlainRecord(value)) throw parseError('$', '必须是对象');

  if (value['dtoVersion'] !== ENTITY_FIELDS_DTO_VERSION) {
    throw parseError('$.dtoVersion', `必须是 ${ENTITY_FIELDS_DTO_VERSION}`);
  }
  const fields = value['fields'];
  if (!Array.isArray(fields)) throw parseError('$.fields', '必须是数组');

  const parsed = fields.map((field, index) => parseFieldDescriptor(field, `$.fields[${index}]`));
  assertFieldOrder(parsed, '$.fields');

  return {
    dtoVersion: ENTITY_FIELDS_DTO_VERSION,
    entity: requireString(value, 'entity', '$'),
    namespace: requireString(value, 'namespace', '$'),
    fields: parsed
  };
}
