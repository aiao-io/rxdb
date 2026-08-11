/**
 * PGlite 共享测试夹具：工厂、查询形状包装器和内存文件转储器。
 * 由 `encrypted-crud.spec.ts` 和 `encrypted-tamper.spec.ts` 使用。
 */
import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { EncryptedAdapterFactory, EncryptedTestAdapter } from '@aiao/rxdb-test/encrypted';
import type { Results } from '@electric-sql/pglite';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

class QueryCountingPGliteAdapter extends RxDBAdapterPGlite {
  queryCount = 0;

  override query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    this.queryCount++;
    return super.query<T>(sql, bindings);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

/**
 * 将 SQLite 风格的套件 SQL 转换为 PG 语法：
 *   - `?` positional placeholder → `$1, $2, ...`
 *   - 未加引号的 CamelCase 列引用 → `"CamelCase"`（否则 PG 会将其折叠为小写，
 *     找不到我们创建的带引号列）。
 */
function toPGSql(sql: string): string {
  let i = 0;
  const withParams = sql.replace(/\?/g, () => `$${++i}`);
  return withParams.replace(/(?<![A-Za-z"$\w])([A-Za-z_][A-Za-z0-9_]*)(?!["\w])/g, m => {
    if (
      /[A-Z]/.test(m) &&
      !/^(SELECT|FROM|WHERE|AND|OR|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|NULL|TRUE|FALSE|IS|NOT|IN|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ASC|DESC)$/i.test(
        m
      )
    ) {
      return `"${m}"`;
    }
    return m;
  });
}

/**
 * Proxy 只重写 `query` 一个成员的形状，其余原样转发 —— 类型上就如实写成
 * 「除 `query` 外沿用 A，`query` 换成套件契约的那一版」。
 *
 * 写成 `<A>(a: A) => A` 会掩盖 `query` 被换掉这件事；写成 `() => EncryptedTestAdapter`
 * 又会把 A 上的其余能力全部抹平、变成一次无检查的强制断言（RXT-024）。
 */
type QueryShaped<A> = Omit<A, 'query'> & Pick<EncryptedTestAdapter, 'query'>;

function wrapQueryShape<A extends object>(adapter: A): QueryShaped<A> {
  return new Proxy(adapter, {
    get(target, prop) {
      if (prop === 'query') {
        return async (sql: string, bindings?: unknown[]) => {
          const original = (
            target as unknown as { query: (sql: string, bindings?: unknown[]) => Promise<unknown> }
          ).query.bind(target);
          const res = (await original(toPGSql(sql), bindings)) as {
            rows?: Array<Record<string, unknown>>;
            fields?: Array<{ name: string }>;
          };
          const fields = res?.fields ?? [];
          const rawRows = res?.rows ?? [];
          const columns = fields.map(f => f.name);
          const rows = rawRows.map(r => (columns.length ? columns.map(c => (r as Record<string, unknown>)[c]) : []));
          return { results: [{ columns, rows }] };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  }) as QueryShaped<A>;
}

export const pgliteFactory: EncryptedAdapterFactory = {
  name: 'pglite',
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,

  async createAdapter(options?: Record<string, unknown>): Promise<EncryptedTestAdapter> {
    const entities = ((options?.entities as EntityType[]) ?? []).slice();
    const dbName = `pg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities,
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    let countingAdapter: QueryCountingPGliteAdapter | undefined;
    rxdb
      .adapter('pglite', async db => {
        countingAdapter = new QueryCountingPGliteAdapter(db, { store: 'memory' });
        return countingAdapter;
      })
      .init();

    await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
    if (!countingAdapter) throw new Error('pglite adapter factory did not create an adapter');
    const adapter = countingAdapter;
    const wrapped = wrapQueryShape(adapter);
    encryptedQueryCounts.set(wrapped, () => adapter.queryCount);
    return wrapped;
  }
};

/**
 * 测试中的 PGlite 使用内存存储。转储非系统 schema 中的所有用户表，
 * 覆盖实体行、`rxdb_change` 日志、缓存快照和 keyring。
 */
export async function readPGliteDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  const a = adapter as {
    query(sql: string): Promise<{
      results: ReadonlyArray<{ columns: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<unknown>> }>;
    }>;
  };
  const tablesResult = await a.query(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')`
  );
  const tables = (tablesResult.results[0]?.rows ?? []).map(r => ({
    schema: String(r[0]),
    name: String(r[1])
  }));
  const chunks: string[] = [];
  for (const t of tables) {
    const dump = await a.query(`SELECT * FROM "${t.schema}"."${t.name}"`);
    for (const set of dump.results) {
      chunks.push(set.columns.join('|'));
      for (const row of set.rows) {
        chunks.push(row.map(cell => (cell == null ? '' : String(cell))).join('|'));
      }
    }
  }
  return new TextEncoder().encode(chunks.join('\n'));
}
