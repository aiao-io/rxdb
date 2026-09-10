/**
 * @fileoverview QueryCache 新鲜度判定的时间戳比较
 *
 * 本模块**不进 barrel**：它是 {@link diffMetadata} 与 `QueryCacheRepository` 共用的内部工具，
 * 不属于公共 API 面。
 */

/**
 * 把 `updatedAt` 解析成毫秒时间点。
 *
 * @param value - 待解析的时间串
 * @param context - 报错时用于定位的上下文，例如 `"实体 'p-1' 的 remote"`
 * @returns 毫秒时间点
 *
 * @throws TypeError 解析不出时间点时抛出。
 *
 * @remarks
 * 不返回 0、也不把解析失败当成「过期」：那会让一条坏数据把整个 QueryCache 变成
 * 每轮全量重拉，而且完全无声。拉不动和永远重拉都是故障，但后者查不出来。
 */
export const parseUpdatedAt = (value: string, context: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`${context} updatedAt 不是可解析的时间: ${value}`);
  }
  return parsed;
};

/**
 * 判定远端记录是否比本地新。
 *
 * @param remoteUpdatedAt - 远端时间串
 * @param localUpdatedAt - 本地时间串
 * @param context - 报错时用于定位的上下文
 * @returns 远端严格更新时为 `true`
 *
 * @throws TypeError 任一侧解析不出时间点时抛出。
 *
 * @remarks
 * 必须比**时间点**，不能比字符串字典序。字典序要求两侧格式完全一致，而实际来源并不一致：
 * 本地写的是 `.000Z`，Supabase 给 `+00:00` 偏移，多数 HTTP 后端给不带毫秒的 `Z`。
 * `'…:00Z' > '…:00.000Z'` 在字典序下为真（`'Z'` 的码位大于 `'.'`），于是**同一个时刻**
 * 被判成过期 —— 每次同步全量重拉，永不收敛。反向的写法（`local >= remote`）则相反，
 * 会把新鲜判成过期，症状一样。
 */
export const isRemoteNewer = (remoteUpdatedAt: string, localUpdatedAt: string, context: string): boolean =>
  parseUpdatedAt(remoteUpdatedAt, `${context} remote`) > parseUpdatedAt(localUpdatedAt, `${context} local`);
