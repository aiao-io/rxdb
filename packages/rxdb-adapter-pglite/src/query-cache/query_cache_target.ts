import { getEntityMetadata, type EntityMetadata, type RxDB } from '@aiao/rxdb';
import { getTableNameByMetadata, RxdbAdapterPGliteError } from '../pglite.utils.js';

/**
 * `QueryCacheRepository` 传入的**逻辑实体名**解析出的物理定位信息。
 *
 * @remarks
 * QueryCache 的三个批量方法（`getMetadataByIds` / `upsertMany` / `deleteByIds`）
 * 拿到的只有实体名和远端行，物理表名、schema、主键列名全部要从 metadata 推出来。
 */
export interface QueryCacheTarget {
  /** 命中的实体元数据 */
  metadata: EntityMetadata;
  /** 完全限定且已转义的表名，如 `"shop"."qc_shop_items"` */
  tableName: string;
  /** 主键的物理列名（未转义） */
  idColumn: string;
}

/**
 * 把逻辑实体名解析为唯一的物理定位。
 *
 * @remarks
 * 旧实现写死 `getEntityMetadata(entityName, 'public')` 再 `?? entityName` 回退：
 * 非 public namespace 的实体永远查不到 metadata，于是降级成不带 schema 的裸表名，
 * 真机执行必然找错表。这里改为在**全部已配置实体**里按名字查找，
 * 与 `RxDBAdapterSupabase` 的 `resolveEntityScope` 同口径（支持 `namespace:entity`
 * 显式限定；裸实体名只有在配置中唯一时才允许）。
 *
 * metadata 查不到时 **fail-fast** 而不是回退裸表名 —— 回退只会把「实体没配」
 * 这一配置错误推迟到 PG 报 `relation does not exist`，且错误里不再有实体名。
 *
 * @param rxdb - 当前 RxDB 实例
 * @param entityName - 逻辑实体名，或 `namespace:entity` 形式的显式限定名
 * @returns 唯一命中的 {@link QueryCacheTarget}
 * @throws {RxdbAdapterPGliteError} 实体未配置、在多个 namespace 下重名，或缺少主键属性
 */
export const resolveQueryCacheTarget = (rxdb: RxDB, entityName: string): QueryCacheTarget => {
  const separatorIndex = entityName.indexOf(':');
  const wantedNamespace = separatorIndex > 0 ? entityName.slice(0, separatorIndex) : undefined;
  const wantedName = separatorIndex > 0 ? entityName.slice(separatorIndex + 1) : entityName;

  const matches = new Map<string, EntityMetadata>();
  for (const EntityClass of rxdb.config.entities ?? []) {
    const metadata = getEntityMetadata(EntityClass);
    const namespace = metadata.namespace || 'public';
    if (metadata.name !== wantedName) continue;
    if (wantedNamespace !== undefined && namespace !== wantedNamespace) continue;
    matches.set(`${namespace}:${metadata.name}`, metadata);
  }

  if (matches.size === 0) {
    throw new RxdbAdapterPGliteError(`QueryCache: entity "${entityName}" is not configured`);
  }
  if (matches.size > 1) {
    throw new RxdbAdapterPGliteError(
      `QueryCache: entity "${entityName}" is configured in multiple namespaces (${[...matches.keys()].join(', ')}); use "namespace:entity"`
    );
  }

  const metadata = [...matches.values()][0];
  return {
    metadata,
    tableName: getTableNameByMetadata(metadata),
    idColumn: resolvePrimaryColumn(metadata, entityName)
  };
};

/**
 * 解析 `updatedAt` 的物理列名。
 *
 * @remarks
 * 只有 `getMetadataByIds` 需要它 —— 它的返回值就是 id → updatedAt 映射，
 * 没有 `updatedAt` 的实体根本参与不了 `diffMetadata` 的新鲜度比较。
 * 因此这一步刻意不放进 {@link resolveQueryCacheTarget}：
 * 那会让不需要 `updatedAt` 的 `upsertMany` / `deleteByIds` 一起失败。
 *
 * @param target - 已解析的定位信息
 * @returns `updatedAt` 的物理列名（未转义）
 * @throws {RxdbAdapterPGliteError} 实体没有 `updatedAt` 属性
 */
export const resolveUpdatedAtColumn = (target: QueryCacheTarget): string => {
  const property = target.metadata.propertyMap.get('updatedAt');
  if (!property) {
    throw new RxdbAdapterPGliteError(
      `QueryCache: entity "${target.metadata.name}" has no "updatedAt" property; cannot compare freshness`
    );
  }
  return property.columnName;
};

/**
 * 取主键的物理列名：优先 `primary === true` 的属性，其次名为 `id` 的属性。
 *
 * @remarks
 * `primary` 不在 `EntityPropertyMetadata` 的公开类型上，用 `Reflect.get` 读取 ——
 * 与 `pglite.utils.ts` 的 `transformForeignKey` 同一写法。
 */
const resolvePrimaryColumn = (metadata: EntityMetadata, entityName: string): string => {
  const primary = [...metadata.propertyMap.values()].find(property => Reflect.get(property, 'primary') === true);
  const property = primary ?? metadata.propertyMap.get('id');
  if (!property) {
    throw new RxdbAdapterPGliteError(`QueryCache: entity "${entityName}" has no primary property`);
  }
  return property.columnName;
};
