/**
 * @fileoverview PostgREST 分页与 `in()` 分块的共用件
 *
 * 两类失败在 Supabase 上都是**静默**的，不会报错，所以必须靠约定而不是靠调用方自觉：
 *
 * 1. **行数截断**：PostgREST 的 `max-rows`（本仓默认 1000）会把超出的行直接砍掉，
 *    响应仍是 200，`error` 为 null。调用方拿到「看起来完整」的短结果集。
 * 2. **URL 超长**：`in('id', ids)` 把所有值拼进查询串，几百个 uuid 就会撞上
 *    网关/浏览器的 URL 长度上限，表现为 `TypeError: Failed to fetch` 或 414。
 */

import { classify_postgrest_error } from './postgrest-error.js';

/**
 * 单页行数，与 docker compose 里 `PGRST_DB_MAX_ROWS` 的默认值一致。
 *
 * @remarks
 * 取值不必等于服务端的 `max-rows`：只要 ≤ 服务端值，分页就是正确的
 * （请求 N 行、返回 < N 行 ⇒ 已到末页）。取等号只是为了少发几次请求。
 */
export const SUPABASE_PAGE_SIZE = 1000;

/** 单次 `in()` 携带的值个数，控制查询串长度 */
export const SUPABASE_IN_CHUNK_SIZE = 100;

/** PostgREST 响应中本模块关心的部分 */
interface PagedResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
  /** HTTP 状态码；`0` 表示传输失败，用于错误分类（RV-001） */
  status?: number;
}

/**
 * 把一组值切成若干块，供 `in()` 分批查询
 *
 * @param values - 待切分的值
 * @param chunkSize - 每块的最大长度，默认 {@link SUPABASE_IN_CHUNK_SIZE}
 * @returns 分块结果；`values` 为空时返回空数组
 */
export function chunk_values<T>(values: readonly T[], chunkSize: number = SUPABASE_IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    chunks.push(values.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * 反复翻页直到取完，绕过 PostgREST 的 `max-rows` 静默截断
 *
 * @remarks
 * `build_page` 返回的查询**必须带稳定排序**（通常是 `.order('id', { ascending: true })`）。
 * PostgREST 不保证无 `order` 时跨 `range` 的行序，缺了它翻页会重复取到某些行、
 * 同时永久丢掉另一些行 —— 且同样不报错。
 *
 * @param build_page - 给定闭区间 `[from, to]` 构造一次查询
 * @param errorMessage - 出错时的前缀，例如 `'Failed to pull branches'`
 * @param pageSize - 单页行数，默认 {@link SUPABASE_PAGE_SIZE}
 * @returns 全部行
 * @throws `NetworkOfflineError` 任一页因连不上远端而失败（分类见 {@link classify_postgrest_error}）
 * @throws `SupabaseDataError` 任一页被远端拒绝（RLS / 约束 / 语法等）
 */
export async function select_all_pages<T>(
  build_page: (from: number, to: number) => PromiseLike<PagedResponse<T>>,
  errorMessage: string,
  pageSize: number = SUPABASE_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error, status } = await build_page(offset, offset + pageSize - 1);
    if (error) {
      throw classify_postgrest_error({ error, status }, errorMessage);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
