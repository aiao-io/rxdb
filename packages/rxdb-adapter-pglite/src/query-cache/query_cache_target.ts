import { WorktreeTableSet, type EntityMetadata, type EntityPropertyMetadata, type RxDB } from '@aiao/rxdb';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';

/**
 * `QueryCacheEngine` 传入的**逻辑实体名**解析出的物理定位信息。
 *
 * @remarks
 * QueryCache 的三个批量方法（`getMetadataByIds` / `upsertMany` / `deleteByIds`）
 * 拿到的只有实体名和远端行，物理表名、schema、主键列名全部要从 metadata 推出来。
 */
export interface QueryCacheTarget {
  /**
   * `QueryCacheEngine` 传入的**原始**实体名，含可能的 `namespace:` 限定前缀。
   *
   * @remarks
   * 诊断消息一律用它而不是 `metadata.name`：读者要拿这个名字回去比对自己的同步配置，
   * 而 `metadata.name` 已经把限定前缀丢了 —— 同名实体配在多个 namespace 下时，
   * 报出来的名字会指不回任何一处配置。
   */
  entityName: string;
  /** 命中的实体元数据 */
  metadata: EntityMetadata;
  /** 完全限定且已转义的表名，如 `"shop"."qc_shop_items"` */
  tableName: string;
  /** 主键的物理列名（未转义） */
  idColumn: string;
}

/**
 * 把 QueryCache 的实体标识解析为唯一的物理定位。
 *
 * @remarks
 * 标识契约与 `@aiao/rxdb-plugin-sync` 的 `queryCacheEntityIdentifier`、sqlite-core 的同名解析一致：
 * `namespace:entity` 按所写命名空间查，**裸实体名一律按 `public` 查**，不去别的命名空间里找唯一匹配。
 * 旧实现在全部命名空间里找裸名、重名即抛：public 与别的命名空间同名时，QueryCache 给 public 实体
 * 传的裸名（在线读写与离线重放共用这一个标识）全部报歧义（RV-01a1bb299b62）。
 * 以冒号开头的名字整体当裸名，不拆出一个空命名空间。
 *
 * metadata 查不到时 **fail-fast** 而不是回退裸表名 —— 回退只会把「实体没配」
 * 这一配置错误推迟到 PG 报 `relation does not exist`，且错误里不再有实体名。
 *
 * @param rxdb - 当前 RxDB 实例
 * @param entityName - public 实体的裸名，或 `namespace:entity` 形式的限定名
 * @returns 命中的 {@link QueryCacheTarget}
 * @throws {RxdbAdapterPGliteError} 对应命名空间下没有这个实体（含用裸名指非 public 实体），或缺少主键属性
 */
export const resolveQueryCacheTarget = (rxdb: RxDB, entityName: string): QueryCacheTarget => {
  const separatorIndex = entityName.indexOf(':');
  const namespace = separatorIndex > 0 ? entityName.slice(0, separatorIndex) : 'public';
  const name = separatorIndex > 0 ? entityName.slice(separatorIndex + 1) : entityName;
  const metadata = rxdb.schemaManager.getEntityMetadata(name, namespace);
  if (!metadata) {
    throw new RxdbAdapterPGliteError(
      `QueryCache: entity "${entityName}" is not configured in namespace "${namespace}"; bare names resolve to "public", write other namespaces as "namespace:entity"`
    );
  }

  return {
    entityName,
    metadata,
    // QueryCache 实体没有副本，恒在主表集
    tableName: getTableNameByMetadata(metadata, WorktreeTableSet.MAIN),
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
      `QueryCache: entity "${target.entityName}" has no "updatedAt" property; cannot compare freshness`
    );
  }
  return property.columnName;
};

/**
 * 取主键属性：优先 `primary === true` 的那一条，其次名为 `id` 的那一条。
 *
 * @remarks
 * `primary` 不在 `EntityPropertyMetadata` 的公开类型上，用 `Reflect.get` 读取 ——
 * 与 `pglite.utils.ts` 的 `transformForeignKey` 同一写法。
 *
 * 不抛错的那一半单独导出，是为了让 `query_cache_row_contract.ts` 取 id 时用**同一条**
 * 判定：契约只把 id 拿来放进诊断消息，没有 fail-fast 的立场（它要报的是别的东西），
 * 但两处各写一份「主键是哪个属性」必然分叉 —— 主键属性不叫 `id` 时，诊断消息会把
 * 一行明明带着主键的行报成「无 id」。
 *
 * @param metadata - 实体元数据
 * @returns 主键属性；实体既没有 `primary` 标记也没有 `id` 属性时为 `undefined`
 */
export const queryCachePrimaryProperty = (metadata: EntityMetadata): EntityPropertyMetadata | undefined =>
  [...metadata.propertyMap.values()].find(property => Reflect.get(property, 'primary') === true) ??
  metadata.propertyMap.get('id');

/**
 * 取主键的物理列名。
 *
 * @throws {RxdbAdapterPGliteError} 实体没有主键属性
 */
const resolvePrimaryColumn = (metadata: EntityMetadata, entityName: string): string => {
  const property = queryCachePrimaryProperty(metadata);
  if (!property) {
    throw new RxdbAdapterPGliteError(`QueryCache: entity "${entityName}" has no primary property`);
  }
  return property.columnName;
};
