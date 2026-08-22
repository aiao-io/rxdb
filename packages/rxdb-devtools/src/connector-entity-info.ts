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
