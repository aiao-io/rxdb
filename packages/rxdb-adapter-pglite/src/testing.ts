/**
 * PGlite 适配器测试工具集
 *
 * 提供给适配器消费者（应用 e2e、第三方测试）复用的辅助函数：
 * 数据库命名、表/触发器清理、Entity Class 克隆（避免多 RxDB 实例注册冲突）。
 *
 * @packageDocumentation
 */

import { ACTIVE_BRANCH_KEY } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';
import remove_all_triggers_sql from './table/remove_trigger_sql.js';
import { generateBranchTriggerSql } from './version/switch_branch.js';

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

  // `activeKey` 与 `activated` 同进同出：下面刻意不跑 switch 的那条激活 UPDATE，
  // 所以这条 INSERT 是本函数里唯一一处把 main 置为 active 的地方，哨兵值只能由它写。
  // 漏写的话清库之后的 main 就退出「至多一个 active」的唯一约束管辖，且不报任何错。
  await adapter.query(
    `INSERT INTO "rxdb"."rxdb_branch" (id,activated,"activeKey","fromChangeId",local,remote) VALUES ('main',TRUE,'${ACTIVE_BRANCH_KEY}',NULL,TRUE,FALSE)`
  );

  // TRUNCATE 同时清掉了工作树/提交侧的单例与 main 的伴生行，这里**不补**：抽包之后那十张表
  // 只存在于 `use(rxDBPluginWorkingTree)` 过的库里，而 `cleanup_db` 的调用点一个都没装插件
  // （装了的只有两个一致性 spec，它们各自建库、不走清库）。在没有那些表的库上调
  // `createWorkingTreeCommitsInitialRows` 只会因为实体未注册当场抛错。
  //
  // 真让某个装了插件的库走到这里，症状是**响的**：清库后第一次 `createBranch()` 在发放分支
  // 代际时读不到激活态行直接抛错。届时该做的是给 `cleanup_db` 加一个由调用方传入初始行的
  // 入口，**而不是**在本文件 import 插件包——`src/testing.ts` 是已发布的 `./testing` 子路径，
  // 而 `@aiao/rxdb-plugin-working-tree` 只是 devDependency，静态 import 等于把它塞进发布链。

  // 只重挂触发器，不再顺带跑 switch 的那条分支激活 UPDATE：上一行的 INSERT 已经把
  // main 置为 activated=TRUE，那条 UPDATE 在取值上是空操作，却会触发行级 NOTIFY，
  // 异步派发成裸 RxDBBranch UPDATE 事件污染下一个用例的监听窗口。
  const sql = generateBranchTriggerSql(adapter, 'main');
  const triggerStatements = sql.split('---STATEMENT_SEPARATOR---').filter((s: string) => s.trim());
  for (const stmt of triggerStatements) {
    await adapter.query(stmt.trim());
  }

  adapter.rxdb.entityManager.cleanAllCache();
};

/**
 * 克隆 Entity Class 数组，避免多 RxDB 实例注册同一组实体类时互相干扰。
 *
 * @remarks
 * **是核心 `@aiao/rxdb/testing` 那一份的转出口，不是第二份实现。** 本包与
 * `@aiao/rxdb-adapter-sqlite-core` 曾各写一遍逐字等价的副本，两份都靠
 * `symbol.description === 'ɵMetadata'` 找元数据槽位——而核心的槽位描述是
 * `'@aiao/rxdb/ɵMetadata'`，那个字面量从来没匹配上过，元数据隔离那一段一直是死代码。
 * 核心那一份按 `METADATA` 符号本身认，核心改名即编译错误。
 *
 * 转出口而不是让调用方改去 import 核心：这个名字是本包 `testing` 入口的对外契约，
 * 已有的 e2e 与第三方测试从这里取，路径不该因为实现搬家而断。
 *
 * @public
 */
export { cloneEntityClasses } from '@aiao/rxdb/testing';
