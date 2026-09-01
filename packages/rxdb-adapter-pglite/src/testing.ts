/**
 * PGlite 适配器测试工具集
 *
 * 提供给适配器消费者（应用 e2e、第三方测试）复用的辅助函数：
 * 数据库命名、表/触发器清理、Entity Class 克隆（避免多 RxDB 实例注册冲突）。
 *
 * @packageDocumentation
 */

import type { EntityType } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';
import remove_all_triggers_sql from './table/remove_trigger_sql.js';
import { generateSwitchBranchSql } from './version/switch_branch.js';

/**
 * 生成唯一的测试数据库名称（带时间戳与随机后缀）。
 *
 * @returns 唯一数据库名
 * @public
 */
export const generateDbName = (): string => `db_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 共享套件所约定的查询返回形状：按语句分组的列名 + 行数组。
 *
 * @remarks
 * 刻意**不**从 `@aiao/rxdb-test` 引进 `EncryptedTestAdapter`：那是 devDependency，
 * 而本文件是发布入口，引进去会让下游装包时少一个类型来源。这里按结构复述一遍，
 * 契约由 {@link wrapEncryptedQueryShape} 的使用方在自己那侧断言。
 *
 * @public
 */
export interface PgSuiteQueryResult {
  readonly results: ReadonlyArray<{
    readonly columns: readonly string[];
    readonly rows: ReadonlyArray<readonly unknown[]>;
  }>;
}

/** 不需要加引号的 SQL 关键字——它们大小写不敏感，加引号反而会变成标识符。 */
const SQL_KEYWORDS =
  /^(SELECT|FROM|WHERE|AND|OR|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|NULL|TRUE|FALSE|IS|NOT|IN|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ASC|DESC)$/i;

/**
 * 把共享套件里的 SQLite 方言 SQL 改写成 PostgreSQL 能吃的形式。
 *
 * @param sql - SQLite 风格的语句
 * @returns PostgreSQL 风格的语句
 *
 * @remarks
 * 两处差异：位置占位符 `?` → `$1, $2, ...`；未加引号的 CamelCase 列引用要补引号，
 * 否则 PG 会把它折叠成小写，找不到我们建的带引号列。
 *
 * @public
 */
export const toPgSuiteSql = (sql: string): string => {
  let index = 0;
  const withParams = sql.replace(/\?/g, () => `$${++index}`);
  // 后顾断言写 `[\w"$]` 而不是 `[A-Za-z"$\w]`：`\w` 已经包含 `A-Za-z`，
  // 重复的范围只会让 CodeQL 把它当成写错的字符类（CS-013 / CS-014），匹配集合完全相同。
  return withParams.replace(/(?<![\w"$])([A-Za-z_][A-Za-z0-9_]*)(?!["\w])/g, match =>
    /[A-Z]/.test(match) && !SQL_KEYWORDS.test(match) ? `"${match}"` : match
  );
};

/** {@link wrapEncryptedQueryShape} 的返回类型：只有 `query` 换了形状，其余原样。 */
export type PgSuiteQueryShaped<A> = Omit<A, 'query'> & {
  query(sql: string, bindings?: unknown[]): Promise<PgSuiteQueryResult>;
};

/**
 * 给适配器套一层 Proxy，只把 `query` 改写成共享套件约定的形状。
 *
 * @param adapter - 被包装的适配器，其余成员原样转发
 * @returns 与入参同构、仅 `query` 换了签名的代理
 *
 * @remarks
 * 写成 `<A>(a: A) =\> A` 会掩盖 `query` 被换掉这件事；写成 `() =\> EncryptedTestAdapter`
 * 又会把 A 上的其余能力全部抹平、变成一次无检查的强制断言（RXT-024）。
 *
 * @public
 */
export const wrapEncryptedQueryShape = <A extends object>(adapter: A): PgSuiteQueryShaped<A> =>
  new Proxy(adapter, {
    get(target, prop) {
      if (prop === 'query') {
        return async (sql: string, bindings?: unknown[]): Promise<PgSuiteQueryResult> => {
          const original = (
            target as unknown as { query: (sql: string, bindings?: unknown[]) => Promise<unknown> }
          ).query.bind(target);
          const raw = (await original(toPgSuiteSql(sql), bindings)) as {
            rows?: ReadonlyArray<Record<string, unknown>>;
            fields?: ReadonlyArray<{ name: string }>;
          };
          const columns = (raw?.fields ?? []).map(field => field.name);
          const rows = (raw?.rows ?? []).map(row => (columns.length ? columns.map(column => row[column]) : []));
          return { results: [{ columns, rows }] };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  }) as PgSuiteQueryShaped<A>;

/**
 * 把库里所有非系统表逐行转储成字节，供加密套件扫描明文哨兵。
 *
 * @param adapter - 已被 {@link wrapEncryptedQueryShape} 包装过的适配器
 * @returns 全部用户表内容的字节表示
 *
 * @remarks
 * PGlite 没有单一库文件可读（内存档位干脆没有文件，Node 档位是一整棵目录树），
 * 所以检材只能由查询产出。覆盖面包括实体行、`rxdb_change` 日志、缓存快照与 keyring。
 *
 * @public
 */
export const dumpPGliteUserTables = async (adapter: unknown): Promise<Uint8Array> => {
  const shaped = adapter as PgSuiteQueryShaped<object>;
  const tableResult = await shaped.query(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')`
  );
  const tables = (tableResult.results[0]?.rows ?? []).map(row => ({ schema: String(row[0]), name: String(row[1]) }));
  const chunks: string[] = [];
  for (const table of tables) {
    const dump = await shaped.query(`SELECT * FROM "${table.schema}"."${table.name}"`);
    for (const set of dump.results) {
      chunks.push(set.columns.join('|'));
      for (const row of set.rows) chunks.push(row.map(cell => (cell == null ? '' : String(cell))).join('|'));
    }
  }
  return new TextEncoder().encode(chunks.join('\n'));
};

/**
 * 清理 PGlite 适配器持有的数据库：移除所有 trigger、TRUNCATE 业务与测试系统表、
 * 复位 `rxdb_branch` 至 `main`，并重新装配版本分支 trigger。
 *
 * 用于测试 setup/teardown 之间快速重置数据库，避免重建 PGlite 实例的开销。
 *
 * 步骤：
 * 1. 清空 RxDB EntityManager 缓存
 * 2. DROP 所有版本分支 trigger
 * 3. TRUNCATE `public` / `rxdb` schema 下的全部表（CASCADE）
 * 4. 重新插入默认 `main` 分支记录
 * 5. 重新装配 `main` 分支的 trigger
 *
 * @param adapter - 待清理的适配器实例
 * @public
 */
export const cleanup_db = async (adapter: RxDBAdapterPGlite): Promise<void> => {
  adapter.rxdb.entityManager.cleanAllCache();

  const remove_trigger_sql = remove_all_triggers_sql(adapter);
  if (remove_trigger_sql) {
    const statements = remove_trigger_sql.split('---STATEMENT_SEPARATOR---').filter((s: string) => s.trim());
    for (const stmt of statements) {
      await adapter.query(stmt.trim());
    }
  }

  const tableResult = await adapter.internalQuery(
    `SELECT schemaname, tablename FROM pg_tables
     WHERE schemaname IN ('public', 'rxdb')`
  );

  if (tableResult.rows.length > 0) {
    const tableList = tableResult.rows
      .map(row => {
        const { schemaname, tablename } = row as { schemaname: string; tablename: string };
        return `"${schemaname}"."${tablename}"`;
      })
      .join(', ');
    await adapter.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  }

  await adapter.query(
    `INSERT INTO "rxdb"."rxdb_branch" (id,activated,"fromChangeId",local,remote) VALUES ('main',TRUE,NULL,TRUE,FALSE)`
  );

  const sql = generateSwitchBranchSql(adapter, 'main');
  const triggerStatements = sql.split('---STATEMENT_SEPARATOR---').filter((s: string) => s.trim());
  for (const stmt of triggerStatements) {
    await adapter.query(stmt.trim());
  }

  adapter.rxdb.entityManager.cleanAllCache();
};

/**
 * 克隆 Entity Class 数组，避免 `Symbol(ɵEntityManager)` 冲突。
 *
 * 当同一组 Entity Class 需要被多个 RxDB 实例同时注册时（典型场景：单测内并发创建多个
 * 隔离的 adapter 实例），EntityManager 会因为 metadata symbol 重复而抛错。
 * 此函数为每个 EntityClass 创建一份 prototype 干净的副本，并复制其 metadata symbol、
 * 静态属性与可枚举 symbol，确保各副本互不干扰。
 *
 * 与 `@aiao/rxdb-adapter-sqlite-core/testing` 的同名函数行为完全一致。
 *
 * @param entities - 待克隆的 Entity Class 数组
 * @returns 克隆后的 Entity Class 数组，顺序与入参一致
 * @public
 */
export const cloneEntityClasses = (entities: EntityType[]): EntityType[] => {
  return entities.map(EntityClass => {
    const Clone = class extends (EntityClass as unknown as new (
      ...a: unknown[]
    ) => Record<string, unknown>) {} as unknown as EntityType;
    let metadataSymbol: symbol | undefined;
    let metadata: unknown;
    let currentCtor: object | null = EntityClass;

    while (currentCtor && !metadataSymbol) {
      metadataSymbol = Object.getOwnPropertySymbols(currentCtor).find(sym => sym.description === 'ɵMetadata');
      metadata = metadataSymbol ? Object.getOwnPropertyDescriptor(currentCtor, metadataSymbol)?.value : undefined;
      currentCtor = metadataSymbol ? null : Object.getPrototypeOf(currentCtor);
    }

    if (metadata && typeof metadata === 'object') {
      Object.defineProperty(Clone, metadataSymbol!, {
        value: Object.create(metadata as object),
        enumerable: false,
        configurable: true,
        writable: false
      });
    }

    for (const key of Object.getOwnPropertyNames(EntityClass)) {
      if (key === 'prototype' || key === 'length' || key === 'name') continue;
      const desc = Object.getOwnPropertyDescriptor(EntityClass, key);
      if (desc) Object.defineProperty(Clone, key, desc);
    }
    for (const sym of Object.getOwnPropertySymbols(EntityClass)) {
      if (sym === metadataSymbol || sym.description?.startsWith('ɵ')) continue;
      const desc = Object.getOwnPropertyDescriptor(EntityClass, sym);
      if (desc) {
        Object.defineProperty(Clone, sym, { ...desc, configurable: true });
      }
    }
    return Clone;
  });
};
