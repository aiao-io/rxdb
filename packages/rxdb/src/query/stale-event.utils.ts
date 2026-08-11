/**
 * @packageDocumentation
 * 陈旧事件识别（P0-004）。
 *
 * 变更事件是异步批量投递的，投递期间实体可能已经被再次修改。当事件负载里的
 * `updatedAt` **早于**实体缓存里的 `updatedAt` 时，这条事件描述的是一个已经过期的版本，
 * 拿它去改写缓存或做增量计算都只会得出错误结论。
 */
import type { EntityType } from '../entity/entity.interface.js';
import type { RxDBEntityLocalEventData, RxDBEntityLocalRemovedEventData } from '../rxdb-events.js';
import type { RxDB } from '../RxDB.js';

/**
 * 读取并归一化 `updatedAt` 时间戳。
 *
 * 各存储后端回填的类型不一致（`Date` / ISO 字符串 / epoch 数字），统一转成毫秒数；
 * 缺失或非法一律返回 `undefined`，由调用方决定「无法判断」时的行为。
 *
 * @param source 任意可能带 `updatedAt` 的对象
 * @returns 毫秒时间戳；无法判定时为 `undefined`
 * @public
 */
export const readUpdatedAtTime = (source: unknown): number | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  const raw: unknown = (source as { updatedAt?: unknown }).updatedAt;
  if (raw === undefined || raw === null) return undefined;
  const time = raw instanceof Date ? raw.getTime() : new Date(raw as string | number).getTime();
  return Number.isNaN(time) ? undefined : time;
};

/**
 * 判断事件负载是否**旧于**缓存中的实体。
 *
 * 比较的两侧都必须是 `updatedAt`：它由适配器的 `getMonotonicUpdatedAt` 生成，
 * 同毫秒内连续更新会被抬成 `current + 1ms`，**可能领先于墙上时钟**。拿它和事件的
 * `recordAt`（`new Date()`）比较，会在密集保存时把**新鲜**事件误判成陈旧，
 * 静默丢掉合法回写——比 P0-004 本身更糟。只有同源的 `updatedAt` 之间才可比。
 *
 * 任一侧缺失或非法时返回 `false`：宁可不拦，也不误拦。
 *
 * @param cached 实体缓存中的当前实例
 * @param payload 事件负载（INSERT/UPDATE 用 `patch`，DELETE 用 `inversePatch`）
 * @public
 */
export const isStaleEventPayload = (cached: unknown, payload: unknown): boolean => {
  const cachedAt = readUpdatedAtTime(cached);
  const payloadAt = readUpdatedAtTime(payload);
  if (cachedAt === undefined || payloadAt === undefined) return false;
  return cachedAt > payloadAt;
};

/**
 * 判断一条实体变更事件相对实体缓存是否陈旧。
 *
 * 缓存里没有该实体时返回 `false`——无从比较，且此时事件正是唯一的信息来源。
 * DELETE 事件的 `patch` 是 `null`，同样落到「无从判断 → 不拦」。
 *
 * @param rxdb RxDB 实例，用于解析实体类型与读取实体缓存
 * @param event 本地实体变更事件
 * @public
 */
export const isStaleEntityEvent = <T extends EntityType>(rxdb: RxDB, event: RxDBEntityLocalEventData<T>): boolean => {
  const entityType = event.entityType || rxdb.schemaManager.getEntityType<T>(event.entity, event.namespace);
  if (!entityType) return false;
  const cached = rxdb.entityManager.getEntityRef(entityType, event.id);
  if (!cached) return false;
  return isStaleEventPayload(cached, event.patch);
};

/**
 * 判断一条 DELETE 事件相对实体缓存是否陈旧。
 *
 * DELETE 事件没有 `patch`，但 `inversePatch` 是删除前的完整快照（含 `updatedAt`），
 * 足以做同样的单调性比较：如果缓存里的实体比这条删除事件更新（说明删除之后又有更新
 * 事件先一步落地、或删除本身是乱序重放的旧事件），就不能让它把较新的缓存实体清掉。
 *
 * 缓存里没有该实体时返回 `false`——无从比较，正常放行删除。
 *
 * @param rxdb RxDB 实例，用于解析实体类型与读取实体缓存
 * @param event 本地实体删除事件
 * @public
 */
export const isStaleEntityRemoveEvent = <T extends EntityType>(
  rxdb: RxDB,
  event: RxDBEntityLocalRemovedEventData<T>
): boolean => {
  const entityType = event.entityType || rxdb.schemaManager.getEntityType<T>(event.entity, event.namespace);
  if (!entityType) return false;
  const cached = rxdb.entityManager.getEntityRef(entityType, event.id);
  if (!cached) return false;
  return isStaleEventPayload(cached, event.inversePatch);
};
