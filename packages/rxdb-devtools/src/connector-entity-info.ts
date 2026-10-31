import type { EntityType } from '@aiao/rxdb';
import type { DevToolsEntityMetadata, DevToolsRxDB, GetEntityMetadataFn } from './connector-types.js';
import type {
  DevToolsEntityField,
  DevToolsEntityFieldOption,
  DevToolsEntityFieldType,
  DevToolsEntityModel
} from './types.js';

/** 连接器内部缓存的实体身份。 */
export type EntityInfo = {
  name: string;
  namespace: string;
  encryptedFields: string[];
  entityType: EntityType;
};

const MODEL_FIELD_TYPES: ReadonlySet<string> = new Set<DevToolsEntityFieldType>([
  'uuid',
  'string',
  'enum',
  'number',
  'integer',
  'bigint',
  'boolean',
  'date',
  'binary',
  'stringArray',
  'numberArray',
  'keyValue',
  'json',
  'oneToOne',
  'manyToOne',
  'computed'
]);

const SYSTEM_FIELD_ORDER = new Map([
  ['id', 0],
  ['createdAt', 1],
  ['updatedAt', 2]
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readFieldType(value: unknown): DevToolsEntityFieldType | undefined {
  return typeof value === 'string' && MODEL_FIELD_TYPES.has(value) ? (value as DevToolsEntityFieldType) : undefined;
}

function readFieldOptions(value: unknown): Record<string, DevToolsEntityFieldOption> | undefined {
  if (!isRecord(value)) return undefined;
  const options: Record<string, DevToolsEntityFieldOption> = {};
  for (const [key, option] of Object.entries(value)) {
    if (!isRecord(option)) continue;
    const projected: DevToolsEntityFieldOption = {};
    if (typeof option['label'] === 'string') projected.label = option['label'];
    if (typeof option['color'] === 'string') projected.color = option['color'];
    if (typeof option['disabled'] === 'boolean') projected.disabled = option['disabled'];
    options[key] = projected;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function projectField(
  name: string,
  source: unknown,
  forcedType?: DevToolsEntityFieldType
): DevToolsEntityField | undefined {
  const raw = isRecord(source) ? source : {};
  const type = forcedType ?? readFieldType(raw['type']);
  if (type === undefined) return undefined;
  const field: DevToolsEntityField = { name, type };
  const displayName = readString(raw['displayName']);
  if (displayName !== undefined) field.displayName = displayName;
  else if (name === 'id') field.displayName = 'ID';
  if (typeof raw['nullable'] === 'boolean') field.nullable = raw['nullable'];
  if (Array.isArray(raw['enum']) && raw['enum'].every(item => typeof item === 'string')) {
    field.enumValues = [...raw['enum']];
  }
  const options = readFieldOptions(raw['options']);
  if (options !== undefined) field.options = options;
  return field;
}

function projectModel(metadata: DevToolsEntityMetadata): DevToolsEntityModel {
  const fields = new Map<string, DevToolsEntityField>();
  fields.set('id', { name: 'id', displayName: 'ID', type: 'uuid' });
  for (const [name, fieldMetadata] of metadata.propertyMap ?? []) {
    const field = projectField(name, fieldMetadata);
    if (field !== undefined) fields.set(name, field);
  }
  for (const [name, fieldMetadata] of metadata.computedPropertyMap ?? []) {
    const field = projectField(name, fieldMetadata, 'computed');
    if (field !== undefined) fields.set(name, field);
  }
  for (const [name, fieldMetadata] of metadata.foreignKeyRelationMap ?? []) {
    const field = projectField(name, fieldMetadata, fieldMetadataType(fieldMetadata));
    if (field !== undefined) fields.set(name, field);
  }

  const orderedFields = [...fields.values()].sort((a, b) => {
    const aOrder = SYSTEM_FIELD_ORDER.get(a.name) ?? 3;
    const bOrder = SYSTEM_FIELD_ORDER.get(b.name) ?? 3;
    return aOrder - bOrder;
  });
  const model: DevToolsEntityModel = { fields: orderedFields };
  const displayName = readString(metadata.displayName);
  if (displayName !== undefined) model.displayName = displayName;
  return model;
}

function fieldMetadataType(value: unknown): DevToolsEntityFieldType {
  const raw = isRecord(value) ? value['kind'] : undefined;
  return raw === '1:1' ? 'oneToOne' : 'manyToOne';
}

/**
 * 实体身份的复合 key。
 *
 * @remarks
 * 上游以 `namespace:name` 唯一标识实体（`SchemaManager` 明确允许不同 namespace 下重名）。
 * 只用 `name` 建索引会后写覆盖前写：查询落到错误 namespace 的仓库，事件遮罩套用
 * 另一个 namespace 的加密字段集 —— 该遮的留明文，不该遮的被遮。
 */
export const entityKey = (namespace: string, name: string): string => `${namespace}:${name}`;

/** 从 conflict 的 `entityKey` 还原 metadata 复合 key。 */
export const metadataKeyFromConflictKey = (conflictKey: unknown): string | undefined => {
  if (typeof conflictKey !== 'string') return undefined;
  const [namespace, name] = conflictKey.split(':', 2);
  return namespace && name ? entityKey(namespace, name) : undefined;
};

/**
 * 按名称（可选 namespace）解析实体身份。
 *
 * @returns 命中时返回复合 key；名称存在歧义且未指定 namespace 时返回 `{ ambiguous: true }`
 */
export function resolveEntityKey(
  entityInfo: readonly EntityInfo[],
  entityName: string,
  namespace?: string
): { key?: string; ambiguous?: boolean } {
  if (namespace) return { key: entityKey(namespace, entityName) };
  const matches = entityInfo.filter(info => info.name === entityName);
  if (matches.length === 1) return { key: entityKey(matches[0].namespace, matches[0].name) };
  if (matches.length > 1) return { ambiguous: true };
  return {};
}

/** 从 RxDB 配置与元数据读取函数收集实体身份。 */
export interface CollectedEntityInfo {
  entityInfo: EntityInfo[];
  modelMap: Map<string, DevToolsEntityModel>;
}

function collectEntityView(rxdb: DevToolsRxDB, getEntityMetadata: GetEntityMetadataFn): CollectedEntityInfo {
  const entityInfo: EntityInfo[] = [];
  const modelMap = new Map<string, DevToolsEntityModel>();
  for (const entityType of rxdb.config.entities) {
    const metadata = getEntityMetadata(entityType);
    if (!metadata?.name) continue;
    const namespace = metadata.namespace || 'public';
    entityInfo.push({
      name: metadata.name,
      namespace,
      encryptedFields: metadata.encryptedPropertyMap ? [...metadata.encryptedPropertyMap.keys()] : [],
      entityType
    });
    modelMap.set(entityKey(namespace, metadata.name), projectModel(metadata));
  }
  return { entityInfo, modelMap };
}

export function collectEntityInfo(rxdb: DevToolsRxDB, getEntityMetadata: GetEntityMetadataFn): EntityInfo[] {
  return collectEntityView(rxdb, getEntityMetadata).entityInfo;
}

/** 从实体元数据生成不会携带 Map、函数、默认值或约束的模型投影。 */
export function collectEntityModels(
  rxdb: DevToolsRxDB,
  getEntityMetadata: GetEntityMetadataFn
): Map<string, DevToolsEntityModel> {
  return collectEntityView(rxdb, getEntityMetadata).modelMap;
}

/** 由实体身份列表派生查询 / 遮罩索引。 */
export function entityIndexMaps(entityInfo: readonly EntityInfo[]): {
  entityTypeMap: Map<string, EntityType>;
  encryptedFieldsMap: Map<string, string[]>;
} {
  return {
    entityTypeMap: new Map(entityInfo.map(info => [entityKey(info.namespace, info.name), info.entityType])),
    encryptedFieldsMap: new Map(entityInfo.map(info => [entityKey(info.namespace, info.name), info.encryptedFields]))
  };
}

/** 一次收集产出的实体视图：身份列表 + 两张派生索引，三者永远同源。 */
export interface EntityIndex {
  readonly entityInfo: readonly EntityInfo[];
  readonly entityTypeMap: ReadonlyMap<string, EntityType>;
  readonly encryptedFieldsMap: ReadonlyMap<string, string[]>;
  readonly modelMap: ReadonlyMap<string, DevToolsEntityModel>;
}

/** 按需重算的实体注册表。 */
export interface EntityRegistry {
  /**
   * 取当前实体视图。
   *
   * @remarks
   * `config.entities` 未变时返回**上一次的同一个对象**（引用相等可断言），
   * 因此调用方可以在每条事件上无脑调用它。
   */
  sync(): EntityIndex;
}

/** 空视图：没有实例或没有元数据读取函数时的中性返回值。 */
export const EMPTY_ENTITY_INDEX: EntityIndex = Object.freeze({
  entityInfo: Object.freeze([]) as readonly EntityInfo[],
  entityTypeMap: new Map<string, EntityType>(),
  encryptedFieldsMap: new Map<string, string[]>(),
  modelMap: new Map<string, DevToolsEntityModel>()
});

/**
 * 判定两份实体清单是否一致：先比长度，再**逐位比元素身份**。
 *
 * @remarks
 * 只比长度是不够的 —— 一次同步段内可以同时发生 push 与 splice
 * （插件 `install()` 补一个、另一处作用域回收摘一个），长度回到原值而内容已换。
 * 那种情况下只比长度的实现会静默返回过期索引：查询打到不存在的实体，
 * 更糟的是遮罩表缺席导致密文列以明文发上页面消息总线。
 */
function sameEntityList(a: readonly EntityType[], b: readonly EntityType[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entityType, index) => entityType === b[index]);
}

/**
 * 建一个跟随 `rxdb.config.entities` 的实体注册表。
 *
 * @remarks
 * `config.entities` 是**活数组**（`LIVE_BEHAVIOUR_CONFIG_KEYS` 把它排除在 config 冻结之外）：
 * `SchemaManager.init()` 往里补系统实体与 repository 生成类，插件 `install()` 往里 push
 * 自己的实体、作用域回收时再 splice 掉。init 那一刻拍的快照拍的是一个移动的靶子。
 *
 * @param getEntityMetadata - 元数据读取函数。**异常一律透传**：上游对未装饰的类是
 *   fail-fast 的，在遮罩路径上 catch-and-skip 等于静默不遮罩（= 明文泄漏），
 *   所以这里不设兜底。生产上该输入不可达 —— `SchemaManager.init()` 会先一步抛。
 */
export function createEntityRegistry(rxdb: DevToolsRxDB, getEntityMetadata: GetEntityMetadataFn): EntityRegistry {
  let lastEntities: readonly EntityType[] = [];
  let lastIndex: EntityIndex = EMPTY_ENTITY_INDEX;
  let collected = false;

  return {
    sync(): EntityIndex {
      const entities = rxdb.config.entities;
      if (collected && sameEntityList(lastEntities, entities)) return lastIndex;
      const view = collectEntityView(rxdb, getEntityMetadata);
      lastEntities = [...entities];
      lastIndex = { entityInfo: view.entityInfo, ...entityIndexMaps(view.entityInfo), modelMap: view.modelMap };
      collected = true;
      return lastIndex;
    }
  };
}
