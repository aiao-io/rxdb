import type { EntityType } from '@aiao/rxdb';
import type { DevToolsRxDB, GetEntityMetadataFn } from './connector-types.js';

/** 连接器内部缓存的实体身份。 */
export type EntityInfo = {
  name: string;
  namespace: string;
  encryptedFields: string[];
  entityType: EntityType;
};

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
export function collectEntityInfo(rxdb: DevToolsRxDB, getEntityMetadata: GetEntityMetadataFn): EntityInfo[] {
  const entityInfo: EntityInfo[] = [];
  for (const entityType of rxdb.config.entities) {
    const metadata = getEntityMetadata(entityType);
    if (!metadata?.name) continue;
    entityInfo.push({
      name: metadata.name,
      namespace: metadata.namespace || 'public',
      encryptedFields: metadata.encryptedPropertyMap ? [...metadata.encryptedPropertyMap.keys()] : [],
      entityType
    });
  }
  return entityInfo;
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
  encryptedFieldsMap: new Map<string, string[]>()
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
      const entityInfo = collectEntityInfo(rxdb, getEntityMetadata);
      lastEntities = [...entities];
      lastIndex = { entityInfo, ...entityIndexMaps(entityInfo) };
      collected = true;
      return lastIndex;
    }
  };
}
