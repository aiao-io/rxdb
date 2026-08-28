import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  EntityType,
  getEntityMetadata,
  RxDB,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';

type EntityMetadata = ReturnType<typeof getEntityMetadata>;
type EntityPatch<T extends EntityType> = Readonly<Partial<InstanceType<T>>>;
type EntityFull<T extends EntityType> = Readonly<InstanceType<T>>;

/** 一行的字段快照，键是实体属性名、值已按元数据解码（日期是 `Date`，加密列是明文）。 */
export type QueryCacheRowImage = Record<string, unknown>;

/** id → 某一刻表里那一行的快照。缺席 = 该 id 当时不在表里。 */
export type QueryCacheRowImages = ReadonlyMap<string, QueryCacheRowImage>;

/**
 * 派发 QueryCache 回填产生的实体级事件（INSERT / UPDATE）。
 *
 * @param rxdb - 事件总线
 * @param metadata - 目标实体的元数据，提供事件的 `namespace` / `entity`
 * @param postImages - 写入**之后**的行快照，用作 `patch`
 * @param preImages - 写入**之前**的行快照：用来区分新增与更新，并给更新配 `inversePatch`
 *
 * @remarks
 * QueryCache 的缓存写是裸 SQL，且为了不污染 `rxdb_change` 已经把触发器摘掉了
 * （{@link withTriggersDisabled}）。而变更行原本是实时查询**唯一**的通知来源：
 * 触发器 → `rxdb_change` → `handle_rxdb_change` → 实体级事件 → `QueryManager` 增量合并。
 * 摘掉触发器就得在这里把这段通知补回来，否则拉取回填是一次静默写 ——
 * 库里更新了，屏幕上停在旧值，直到用户刷新页面。
 *
 * `patch` 必须是**落地后回读**的行，不能拿远端原样的 JSON 顶：`QueryManager.#serialize`
 * 把 patch 摊进 `createEntityRef`，命中缓存时走的是 `EntityStatus.replace` 的
 * `Object.assign` —— **一次类型转换都不做**。塞进去一个 ISO 字符串，实体的 `updatedAt`
 * 就从 `Date` 变成 `string`，下游任何 `.toISOString()` 当场抛错；抛在模板中段还会留下
 * 半行更新过的 DOM（前半段绑定已提交，后半段没跑）。回读的行与其它任何一次查询同一口径，
 * 也顺带把加密列解回明文。
 */
export const dispatchQueryCacheUpsertEvents = (
  rxdb: RxDB,
  metadata: EntityMetadata,
  postImages: QueryCacheRowImages,
  preImages: QueryCacheRowImages
): void => {
  const created: RxDBEntityLocalCreatedEventData[] = [];
  const updated: RxDBEntityLocalUpdatedEventData[] = [];
  for (const [id, row] of postImages) {
    const before = preImages.get(id);
    const base = { namespace: metadata.namespace, entity: metadata.name, id, recordAt: new Date() };
    if (before) {
      updated.push({
        ...base,
        type: 'UPDATE',
        patch: row as unknown as EntityPatch<EntityType>,
        inversePatch: before as unknown as EntityPatch<EntityType>
      });
    } else {
      created.push({ ...base, type: 'INSERT', patch: row as unknown as EntityFull<EntityType>, inversePatch: null });
    }
  }
  if (created.length) rxdb.dispatchEvent(new EntityLocalCreatedEvent(created));
  if (updated.length) rxdb.dispatchEvent(new EntityLocalUpdatedEvent(updated));
};

/**
 * 派发 QueryCache 缓存删除产生的实体级事件。
 *
 * @param rxdb - 事件总线
 * @param metadata - 目标实体的元数据，提供事件的 `namespace` / `entity`
 * @param preImages - 删除前的行快照；只为**确实存在过**的行发事件
 *
 * @remarks
 * 只发 `preImages` 里有的 id：表里本来就没有的 id 删不掉任何行，触发器也不会开火，
 * 凭空发一条 DELETE 会让实时查询为一件没发生的事重算。
 *
 * `inversePatch` 必须是删除前的整行，不能拿空对象顶：`query_need_refresh_remove` 的门控
 * 直接把它当「旧实体」去比 `where`，空对象会让所有带条件的查询判成「与我无关」——
 * 行删了，列表却不动。
 */
export const dispatchQueryCacheRemoveEvents = (
  rxdb: RxDB,
  metadata: EntityMetadata,
  preImages: QueryCacheRowImages
): void => {
  const removed: RxDBEntityLocalRemovedEventData[] = [];
  for (const [id, before] of preImages) {
    removed.push({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'DELETE',
      id,
      patch: null,
      inversePatch: before as unknown as EntityPatch<EntityType>,
      recordAt: new Date()
    });
  }
  if (removed.length) rxdb.dispatchEvent(new EntityLocalRemovedEvent(removed));
};
