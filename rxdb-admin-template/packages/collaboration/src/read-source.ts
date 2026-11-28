import type { SupabaseClient } from '@supabase/supabase-js';
import { CollaborationError } from './model.js';

/** 一个列上的筛选条件：等于、属于一组值、小于（按写入顺序向前翻页）。 */
export type Filter = { eq: string | number | boolean } | { in: readonly string[] } | { lt: number };
/** 对一个只读投影的查询：取哪些列、按哪些列筛选与排序、跳过多少行、最多取多少行。 */
export interface RowQuery {
  columns: readonly string[];
  where: Readonly<Record<string, Filter>>;
  order?: readonly (readonly [column: string, direction: 'asc' | 'desc'])[];
  offset?: number;
  limit?: number;
}

/**
 * 只读查询的来源：浏览器经 supabase-js 访问 PostgREST（{@link supabaseReadSource}），集成测试与容量基准以 authenticated 角色
 * 直连 PostgreSQL 执行同样的查询（`server/pg-read.ts`）。两者都只读 public 下的只读投影与读取函数，可见范围由投影的成员资格条件裁决；
 * 读取失败时抛出 `unauthenticated`（会话失效）或 `unavailable`（服务暂不可用，可稍后重试）。
 */
export interface ReadSource {
  /** 按条件读一个投影的若干行。PostgREST 对单次结果有行数上限（Supabase 默认 1000），调用方每页不超过 {@link readPageSize}。 */
  rows<T extends object>(view: string, query: RowQuery): Promise<T[]>;
  /** 按条件计数。 */
  count(view: string, where: Readonly<Record<string, Filter>>): Promise<number>;
  /** 调用一个读取函数（返回 JSON，不受行数上限截断）；不可读的工作区返回 null。 */
  call<T>(fn: string, args: Readonly<Record<string, unknown>>): Promise<T | null>;
}
/**
 * 每次读取的最多行数：须不大于 PostgREST 的 max-rows（Supabase 默认 1000）。不足一页即读完；
 * 部署时若调小 max-rows，必须不小于这个值，否则读取会把被截断的一页误当成最后一页。
 */
export const readPageSize = 500;

/** PostgREST 的 JWT 错误（过期、签名无效、缺少声明）与 401：会话失效，按需重新登录。 */
const jwtErrors = ['PGRST301', 'PGRST302', 'PGRST303'];
function readFailure(status: number, code: string | undefined): CollaborationError {
  return status === 401 || (code !== undefined && jwtErrors.includes(code)) ?
      new CollaborationError('unauthenticated', '会话已失效，请重新登录')
    : new CollaborationError('unavailable', '读取团队数据失败，请稍后重试');
}

/** 浏览器的读取来源：经 supabase-js 访问 PostgREST，会话令牌由 supabase-js 自动带上，RLS 按当前用户裁决。 */
export function supabaseReadSource(client: SupabaseClient): ReadSource {
  type Builder = ReturnType<ReturnType<SupabaseClient['from']>['select']>;
  const filtered = (builder: Builder, where: Readonly<Record<string, Filter>>): Builder => {
    let next = builder;
    for (const [column, filter] of Object.entries(where))
      next =
        'eq' in filter ? next.eq(column, filter.eq)
        : 'in' in filter ? next.in(column, [...filter.in])
        : next.lt(column, filter.lt);
    return next;
  };
  return {
    async rows<T extends object>(view: string, query: RowQuery): Promise<T[]> {
      let builder = filtered(client.from(view).select(query.columns.join(',')), query.where);
      for (const [column, direction] of query.order ?? [])
        builder = builder.order(column, { ascending: direction === 'asc' });
      if (query.offset !== undefined)
        builder = builder.range(query.offset, query.offset + (query.limit ?? readPageSize) - 1);
      else if (query.limit !== undefined) builder = builder.limit(query.limit);
      const { data, error, status } = await builder;
      if (error) throw readFailure(status, error.code);
      return data as unknown as T[];
    },
    async count(view, where) {
      const { count, error, status } = await filtered(
        client.from(view).select('*', { count: 'exact', head: true }),
        where
      );
      if (error || count === null) throw readFailure(status, error?.code);
      return count;
    },
    async call<T>(fn: string, args: Readonly<Record<string, unknown>>): Promise<T | null> {
      const { data, error, status } = await client.rpc(fn, args);
      if (error) throw readFailure(status, error.code);
      return data as T | null;
    }
  };
}
