import {
  parseEntityFieldsDescriptor,
  RxDBError,
  type EntityFieldDescriptor,
  type EntityFieldsDescriptor,
  type EntityPropertyFieldDescriptor,
  type EntityToOneRelationFieldDescriptor
} from '@aiao/rxdb';
import {
  CollaborationError,
  demand,
  type ChangeSet,
  type DataRow,
  type Records,
  type SchemaManifest,
  type Value
} from './model.js';
import { canonical, isIdentifier } from './records.js';

/**
 * 协作记录能承载的属性取值类型：记录字段只能是文本、数字、布尔或 null（JSON 原生类型），日期以 ISO 日期文本存放。
 * 清单里出现其他类型（bigint、binary、数组、键值、JSON）的记录字段时整份清单被拒绝。
 */
const supportedValueTypes: readonly string[] = ['string', 'enum', 'uuid', 'number', 'integer', 'boolean', 'date'];
/** 一份清单最多的实体数与每个实体最多的字段数：清单来自成员管理者的命令，体积必须有上限。 */
const limits = { entities: 100, fields: 200 } as const;
const formatError = '数据模式清单格式错误';

/** 记录里一个字段的模型：属性字段，或单值关联（1:1 / m:1）写在记录里的外键字段。 */
export interface RecordField {
  /** 记录里的字段名：属性名，或关联的外键字段（`writeField`，即关联名加 `Id`，例如 `ownerId`）。 */
  readonly name: string;
  /** 清单里的字段描述：属性描述，或单值关联的描述。 */
  readonly descriptor: EntityPropertyFieldDescriptor | EntityToOneRelationFieldDescriptor;
  /** 单值关联指向的实体名；属性字段为 undefined。 */
  readonly target: string | undefined;
}
/** 一个实体在协作记录里的模型：清单顺序的记录字段（先属性、后单值关联）、系统字段与标题字段。 */
export interface EntityModel {
  readonly entity: string;
  readonly namespace: string;
  /** 记录里允许出现的字段，按清单顺序：普通属性在前，单值关联的外键字段在后；系统字段、计算属性与 1:m / m:n 关联不在其中。 */
  readonly fields: readonly RecordField[];
  /**
   * 系统字段：清单里 `source: 'system'` 的字段，主键除外（主键是单元的 `entityId`，平台的变更日志触发器从不把它写进补丁）。
   * 资产实体是 `createdAt`、`updatedAt`、`createdBy`、`updatedBy`。平台 working-tree 在 sqlite-wasm 上捕获的单元带着它们：
   * 插入是整行（含审计时间与审计主体），修改带着这一刻的 `updatedAt`（主体变了还有 `updatedBy`）。协作只原样保存、原样下发，
   * 不检查、不进键索引、不参与前像核对与合并冲突——它们是每台设备自己的簿记，平台导入时也不比、不回写。
   */
  readonly system: readonly string[];
  /** 标题字段：第一个必填的文本属性，界面以它的取值作记录名称；没有时为 undefined。 */
  readonly title: string | undefined;
  /** 按记录里的字段名取字段模型；不是记录字段时为 undefined。 */
  field(name: string): RecordField | undefined;
  /** 这个字段能不能出现在记录与单元的补丁里：记录字段或系统字段。 */
  accepts(name: string): boolean;
}
/** 一份清单的模型：清单本身与按清单顺序排列的实体模型。 */
export interface SchemaModel {
  readonly manifest: SchemaManifest;
  readonly entities: readonly EntityModel[];
  /** 按实体名取实体模型；不在清单里时为 undefined。 */
  entity(name: string): EntityModel | undefined;
}
/**
 * 共享记录的一个检查键，由合并事务按清单维护在键索引里，唯一与关联检查按键查询，不扫全表：
 * `unique` 是唯一字段的取值（`value` 为规范化 JSON 文本），`reference` 是单值关联指向的记录标识（`value` 即标识）。
 */
export interface RecordKey {
  kind: 'unique' | 'reference';
  entity: string;
  field: string;
  value: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 取值是否视为缺失：undefined、null、空串，以及只含空白的文本。必填按它判断，缺失的取值也不参与唯一性比较。
 * 比平台 `validateFieldValue` 的空值口径多认一种只含空白的文本，沿用协作检查一直以来的规则。
 */
export function isMissing(value: Value | undefined): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** 唯一键在查询与映射里用的文本形式：实体、字段与规范化取值三者的 JSON 数组。 */
export function uniqueKey(entity: string, field: string, value: Value): string {
  return JSON.stringify([entity, field, canonical(value)]);
}
/** {@link RecordKey}（`unique`）对应的唯一键文本，与 {@link uniqueKey} 一致。 */
export const recordKeyText = (key: RecordKey) => JSON.stringify([key.entity, key.field, key.value]);

function parseEntity(value: unknown, index: number): EntityFieldsDescriptor {
  try {
    return parseEntityFieldsDescriptor(value);
  } catch (error) {
    if (error instanceof RxDBError) throw new CollaborationError('invalid', formatError, { entity: index });
    throw error;
  }
}

/**
 * 解析并校验数据模式清单（不可信输入：初始化读到的文件、成员管理者登记新版本的命令、客户端读到的响应）。
 * 顶层只接受 `schemaVersion`（≥ 1 的安全整数）与 `entities`；每个实体的字段描述交给平台的 `parseEntityFieldsDescriptor()`
 * 严格解析（未知键丢弃，已知键严格校验）。另外要求实体名唯一、实体名与记录字段名是安全标识、单值关联的目标实体在清单里、
 * 记录字段的取值类型是协作能承载的类型。任何一项不满足都以 `invalid` 拒绝整份清单。
 * @returns 全新构造的清单，只含已知键。
 */
export function parseSchemaManifest(value: unknown): SchemaManifest {
  demand(
    isRecord(value) && Object.keys(value).every(key => key === 'schemaVersion' || key === 'entities'),
    'invalid',
    formatError
  );
  const version = value['schemaVersion'];
  demand(typeof version === 'number' && Number.isSafeInteger(version) && version >= 1, 'invalid', formatError);
  const entities = value['entities'];
  demand(Array.isArray(entities) && entities.length > 0 && entities.length <= limits.entities, 'invalid', formatError);
  const manifest: SchemaManifest = { schemaVersion: version, entities: entities.map(parseEntity) };
  schemaModel(manifest);
  return manifest;
}

/** 从一个字段描述取出记录字段；不进记录的字段（系统字段、计算属性、1:m / m:n 关联）返回 undefined。 */
function recordField(descriptor: EntityFieldDescriptor): RecordField | undefined {
  if (descriptor.source === 'property') return { name: descriptor.field, descriptor, target: undefined };
  if (descriptor.source !== 'relation' || descriptor.cardinality !== 'single') return undefined;
  return { name: descriptor.relation.writeField, descriptor, target: descriptor.relation.entity };
}

/** 系统字段的字段名：`source: 'system'` 且不是主键。 */
const systemName = (descriptor: EntityFieldDescriptor): string | undefined =>
  descriptor.source === 'system' && descriptor.primary !== true ? descriptor.field : undefined;

function entityModel(descriptor: EntityFieldsDescriptor): EntityModel {
  const location = { entity: descriptor.entity };
  demand(
    isIdentifier(descriptor.entity) && descriptor.fields.length <= limits.fields,
    'invalid',
    formatError,
    location
  );
  const fields = descriptor.fields.map(recordField).filter(field => field !== undefined);
  const system = descriptor.fields.map(systemName).filter(name => name !== undefined);
  for (const name of system) demand(isIdentifier(name), 'invalid', formatError, { ...location, field: name });
  const byName = new Map<string, RecordField>();
  for (const field of fields) {
    demand(isIdentifier(field.name) && !byName.has(field.name), 'invalid', formatError, {
      ...location,
      field: field.name
    });
    demand(
      field.target !== undefined || supportedValueTypes.includes(field.descriptor.valueType),
      'invalid',
      '数据模式清单包含协作不支持的字段类型',
      { ...location, field: field.name }
    );
    byName.set(field.name, field);
  }
  const title = fields.find(
    field =>
      field.target === undefined && field.descriptor.required && ['string', 'enum'].includes(field.descriptor.valueType)
  );
  const systemNames = new Set(system);
  return {
    entity: descriptor.entity,
    namespace: descriptor.namespace,
    fields,
    system,
    title: title?.name,
    field: name => byName.get(name),
    accepts: name => byName.has(name) || systemNames.has(name)
  };
}

const models = new WeakMap<SchemaManifest, SchemaModel>();
/**
 * 清单的模型（按清单对象缓存）：实体按清单顺序，各实体的记录字段与标题字段见 {@link EntityModel}。
 * 实体名重复、名称不安全、单值关联指向清单外的实体或记录字段类型不受支持时抛出 `invalid`。
 */
export function schemaModel(manifest: SchemaManifest): SchemaModel {
  const cached = models.get(manifest);
  if (cached) return cached;
  const entities = manifest.entities.map(entityModel);
  const byName = new Map<string, EntityModel>();
  for (const entity of entities) {
    demand(!byName.has(entity.entity), 'invalid', formatError, { entity: entity.entity });
    byName.set(entity.entity, entity);
  }
  for (const entity of entities)
    for (const field of entity.fields) {
      if (field.target === undefined || field.descriptor.source !== 'relation') continue;
      const target = byName.get(field.target);
      demand(target?.namespace === field.descriptor.relation.namespace, 'invalid', formatError, {
        entity: entity.entity,
        field: field.name
      });
    }
  const model: SchemaModel = { manifest, entities, entity: name => byName.get(name) };
  models.set(manifest, model);
  return model;
}

/** 实体名到命名空间：字段级变更的 `namespace` 由它填写与核对；实体不在清单里时抛出 `invalid`。 */
export function namespaceOf(manifest: SchemaManifest): (entity: string) => string {
  const model = schemaModel(manifest);
  return entity => {
    const found = model.entity(entity);
    demand(found, 'invalid', '实体不受支持');
    return found.namespace;
  };
}

/**
 * 某个实体的某个字段是不是系统字段（见 {@link EntityModel.system}）：三方合并按它认出不参与冲突的簿记字段。
 * 不在清单里的实体与字段都不是。
 */
export type SystemField = (entity: string, field: string) => boolean;
/** 按清单认出系统字段的判定函数，见 {@link SystemField}。 */
export function systemFieldOf(manifest: SchemaManifest): SystemField {
  const model = schemaModel(manifest);
  return (entity, field) => model.entity(entity)?.system.includes(field) ?? false;
}

/** 一条记录在清单里的实体，记录的每个字段都必须是该实体的记录字段或系统字段；否则抛出 `invalid`。 */
export function fitRow(model: SchemaModel, row: DataRow): EntityModel {
  const entity = model.entity(row.entity);
  demand(entity, 'invalid', '实体不受支持');
  for (const field of Object.keys(row.fields)) demand(entity.accepts(field), 'invalid', '字段不受支持');
  return entity;
}
/** 记录表的每条记录都必须属于清单里的实体、只含该实体的记录字段与系统字段（网络输入与合并结果的结构核对）。 */
export function assertRecordsFit(manifest: SchemaManifest, records: Records): void {
  const model = schemaModel(manifest);
  for (const row of Object.values(records)) fitRow(model, row);
}
/**
 * 字段级变更必须属于清单里的实体、命名空间与清单一致，`patch` 与 `inversePatch` 只含该实体的记录字段与系统字段；
 * 否则抛出 `invalid`。只核对结构，必填、类型与跨记录约束由最终结果检查负责，未完成的草稿因此可以同步。
 */
export function assertChangesFit(manifest: SchemaManifest, changes: readonly ChangeSet[]): void {
  const model = schemaModel(manifest);
  for (const change of changes) {
    const entity = model.entity(change.entity);
    demand(entity && entity.namespace === change.namespace, 'invalid', '实体不受支持');
    for (const fields of [change.patch, change.inversePatch])
      for (const field of Object.keys(fields ?? {})) demand(entity.accepts(field), 'invalid', '字段不受支持');
  }
}

/**
 * 一条共享记录在键索引里的全部键：唯一字段的非缺失取值（`unique`），以及单值关联指向的记录标识（`reference`，只收非缺失的文本）。
 * 记录必须符合清单（共享记录只经合并写入，合并前已核对）。
 */
export function recordKeys(manifest: SchemaManifest, row: DataRow): RecordKey[] {
  const entity = fitRow(schemaModel(manifest), row);
  const keys: RecordKey[] = [];
  for (const field of entity.fields) {
    const value = row.fields[field.name];
    if (isMissing(value)) continue;
    if (field.descriptor.unique)
      keys.push({ kind: 'unique', entity: entity.entity, field: field.name, value: canonical(value) });
    if (field.target !== undefined && typeof value === 'string')
      keys.push({ kind: 'reference', entity: entity.entity, field: field.name, value });
  }
  return keys;
}
