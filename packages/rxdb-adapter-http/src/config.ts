/**
 * @packageDocumentation
 * 数值配置的默认值与**构造期**校验（US-212 AC#31）。
 */

import { HttpConfigError } from './errors.js';
import type { HttpNumericConfig } from './http.interface.js';

/**
 * 五个数值配置的默认值。
 *
 * @remarks
 * `pageSize` / `idChunkSize` 对标 supabase 适配器的 `SUPABASE_PAGE_SIZE`（1000）与
 * `SUPABASE_IN_CHUNK_SIZE`（100）——同一份 metadata 契约下两家取值不同没有理由，
 * 只会让「换个适配器就翻页行为变了」变成需要排查的现象。
 */
export const DEFAULT_HTTP_CONFIG: HttpNumericConfig = {
  pageSize: 1000,
  idChunkSize: 100,
  maxEmptyPages: 3,
  maxPages: 1000,
  requestTimeoutMs: 30000
};

/**
 * 允许取 `0` 的字段。
 *
 * @remarks
 * 只有 `maxEmptyPages`：它的语义是「容忍几个连续空页」，`0` = 一个都不容忍，是合法且
 * 最严格的配置。其余四个取 `0` 都是死值——`pageSize: 0` 每页零条永远翻不完、
 * `maxPages: 0` 一页都不许翻、`requestTimeoutMs: 0` 请求发出即超时。
 */
const ZERO_ALLOWED = new Set<keyof HttpNumericConfig>(['maxEmptyPages']);

/**
 * 校验单个数值字段：必须是 **finite 正整数**。
 *
 * @remarks
 * 判据不是 `> 0`。`1.5` 能过 `> 0`，但会让翻页的 `offset += limit` 逐页漂移、
 * 分块的 `slice` 边界落在半条记录上；`Infinity` 也能过 `> 0`，而它恰好等于放弃
 * `maxPages` / `requestTimeoutMs` 这两条触顶保护——那正是这两个配置存在的理由。
 * 所以三条缺一不可：`Number.isInteger` 挡小数与 `NaN`，`Number.isFinite` 挡
 * `Infinity`，下界挡零与负数。
 */
const assertPositiveInteger = (field: keyof HttpNumericConfig, value: number): void => {
  const min = ZERO_ALLOWED.has(field) ? 0 : 1;
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < min) {
    throw new HttpConfigError(
      `HTTP adapter config "${field}" must be a finite integer >= ${min}, received ${String(value)}`,
      field,
      value
    );
  }
};

/**
 * 合并默认值并逐字段校验，返回可直接使用的完整配置。
 *
 * @remarks
 * 在构造期调用、**同步抛错**：这些值决定翻页与分块的终止条件，等到首次查询才发现
 * 配错了，错误会以「结果少了一半」的形态出现，而不是以配置错误的形态。
 *
 * 按字段名逐个取值而不是 `{ ...DEFAULT, ...options }`，是因为调用方传进来的是**整个**
 * 适配器 options（还带着 `baseUrl` / `handlers`）：整体展开会把它们一并塞进配置对象。
 * 顺带把「显式传 `undefined`」正确地当成「没传」——展开写法会让它覆盖掉默认值。
 *
 * @param options - 用户覆盖项，缺省字段取 {@link DEFAULT_HTTP_CONFIG}
 * @returns 五个字段齐全且均已校验的配置
 * @throws HttpConfigError 任一字段不是 finite 正整数（`maxEmptyPages` 下界为 `0`）
 */
export const resolveHttpConfig = (options: Partial<HttpNumericConfig>): HttpNumericConfig => {
  const resolved = {} as HttpNumericConfig;
  for (const field of Object.keys(DEFAULT_HTTP_CONFIG) as (keyof HttpNumericConfig)[]) {
    const value = options[field] ?? DEFAULT_HTTP_CONFIG[field];
    assertPositiveInteger(field, value);
    resolved[field] = value;
  }
  return resolved;
};
