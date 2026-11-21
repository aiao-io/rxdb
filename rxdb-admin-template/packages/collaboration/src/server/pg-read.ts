import type { Pool } from 'pg';
import { readPageSize, type Filter, type ReadSource, type RowQuery } from '../read-source.js';

/** 投影、列与函数名只能是普通标识符：它们拼进 SQL，取值一律走参数。 */
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier ${name}`);
  return name;
};

/**
 * 与 PostgREST 等价的读取来源：以 `authenticated` 角色加 JWT 声明（`sub` 为 null 时以 `anon` 角色）在只读事务里直连 PostgreSQL，
 * 执行浏览器经 PostgREST 发出的同一组查询，可见范围同样只由 public 下只读投影的成员资格条件裁决。
 * 集成测试用它在临时库上验证读取路径，容量基准用它测量团队页与 PR 详情的体积；生产浏览器走 `supabaseReadSource`。
 * 声明同时写进 `request.jwt.claims`（PostgREST v14 与 Realtime 的做法）与 `request.jwt.claim.sub`（旧版 `auth.uid()` 读它）。
 */
export function pgReadSource(pool: Pool, sub: string | null): ReadSource {
  const read = async <T extends object>(sql: string, params: unknown[]): Promise<T[]> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
      if (sub === null) await client.query('SET LOCAL ROLE anon');
      else {
        await client.query('SET LOCAL ROLE authenticated');
        await client.query(
          "SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
          [JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated' }), sub]
        );
      }
      return (await client.query<T>(sql, params)).rows;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  };
  const conditions = (where: Readonly<Record<string, Filter>>, params: unknown[]) =>
    Object.entries(where).map(([column, filter]) => {
      params.push(
        'eq' in filter ? filter.eq
        : 'in' in filter ? [...filter.in]
        : filter.lt
      );
      const placeholder = `$${params.length}`;
      return (
        'eq' in filter ? `${identifier(column)} = ${placeholder}`
        : 'in' in filter ? `${identifier(column)} = ANY(${placeholder})`
        : `${identifier(column)} < ${placeholder}`
      );
    });
  return {
    rows<T extends object>(view: string, query: RowQuery) {
      const params: unknown[] = [];
      const where = conditions(query.where, params);
      const order = (query.order ?? []).map(
        ([column, direction]) => `${identifier(column)} ${direction.toUpperCase()}`
      );
      const paging: string[] = [];
      if (query.limit !== undefined || query.offset !== undefined) {
        params.push(query.limit ?? readPageSize);
        paging.push(`LIMIT $${params.length}`);
      }
      if (query.offset !== undefined) {
        params.push(query.offset);
        paging.push(`OFFSET $${params.length}`);
      }
      const sql = [
        `SELECT ${query.columns.map(identifier).join(', ')} FROM public.${identifier(view)}`,
        where.length ? `WHERE ${where.join(' AND ')}` : '',
        order.length ? `ORDER BY ${order.join(', ')}` : '',
        ...paging
      ].join(' ');
      return read<T>(sql, params);
    },
    async count(view, filters) {
      const params: unknown[] = [];
      const where = conditions(filters, params);
      const [row] = await read<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.${identifier(view)}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
        params
      );
      return row.count;
    },
    async call<T>(fn: string, args: Readonly<Record<string, unknown>>) {
      const names = Object.keys(args);
      const [row] = await read<{ value: T | null }>(
        `SELECT public.${identifier(fn)}(${names.map((name, index) => `${identifier(name)} => $${index + 1}`).join(', ')}) AS value`,
        names.map(name => args[name])
      );
      return row.value;
    }
  };
}
