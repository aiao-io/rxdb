/**
 * pg-tsvector 后端与 `@aiao/rxdb-adapter-pglite/fts` 之间的**唯一**接触面。
 *
 * @remarks
 * 存在的理由是加载图，不是代码整洁：`@aiao/rxdb-adapter-pglite` 是本包的**可选** peer
 * 依赖，而 `index.ts` 导出的 `createPgTsvectorBackend` 会把它整条依赖链拉进静态图。
 * 于是只装了 sqlite adapter 的下游连 `import '@aiao/rxdb-plugin-search'` 都做不到——
 * 「可选」就成了一句空话。三个框架绑定包的 spec 全红正是这么炸出来的。
 *
 * 所以这里做两件事，且只做这两件：
 *
 * 1. **常量本地声明**。`FTS_COLUMN` / `DEFAULT_FTS_REGCONFIG` / `DEFAULT_FTS_ARRAY_KIND`
 *    是三个字面量，抄过来不会带任何模块进图。抄写必然有漂移风险，因此
 *    `pg-fts-contract.spec.ts` 把它们与适配器里的真值逐个对等断言——本包把适配器列为
 *    devDependency，那条 spec 一定跑得到，改名当场变红。
 * 2. **DDL 构造器惰性加载**。`buildCreateFtsTableSql` / `buildFtsTriggersSql` 是真正的
 *    SQL 生成逻辑，抄一份必然与适配器漂移（这正是整套设计要消灭的东西），所以照旧复用，
 *    只是改成安装期 `import()`。安装期只有 adapter 确实是 pglite 时才会走到，
 *    sqlite-only 的下游永远不会解析这个说明符。
 *
 * @packageDocumentation
 */

import type { FtsInstallPlan } from '../../core/fts5-installer.js';

/** 安装计划里的字段描述符；与适配器 `fts` 子路径的 `FtsField` 同形。 */
type FtsField = FtsInstallPlan['fields'][number];

/**
 * 数组列的物理存储形态。
 *
 * 结构性复制自 `@aiao/rxdb-adapter-pglite/fts` 的同名类型。
 *
 * @public
 */
export type FtsArrayKind = 'text[]' | 'jsonb';

/**
 * 数组列的默认物理形态（`'text[]'`）。
 *
 * @public
 */
export const DEFAULT_FTS_ARRAY_KIND: FtsArrayKind = 'text[]';

/**
 * 物化 tsvector 列名（`_fts`），由适配器的建表器定义。
 *
 * @public
 */
export const FTS_COLUMN = '_fts';

/**
 * 默认 PostgreSQL `regconfig`（`simple`：不做 stemming，对多语言混合内容最安全）。
 *
 * @public
 */
export const DEFAULT_FTS_REGCONFIG = 'simple';

/** 适配器 `fts` 子路径里本后端真正复用的两个 DDL 构造器。 */
interface PgFtsDdlBuilders {
  readonly buildCreateFtsTableSql: (table: string, fields: readonly FtsField[]) => string;
  readonly buildFtsTriggersSql: (table: string, fields: readonly FtsField[]) => string;
}

/**
 * 惰性取出适配器的 DDL 构造器。
 *
 * @remarks
 * 缺包时不做任何降级：没有 `@aiao/rxdb-adapter-pglite` 就意味着当前根本不可能是
 * pglite 连接，此处继续往下走只会用错误的 DDL 污染一个真实数据库。让 `import()`
 * 的原始错误直接抛出去，它比任何自造消息都更能指明缺的是哪个包。
 *
 * @returns 建表与建 trigger 的两个 SQL 构造器
 * @internal
 */
export const loadPgFtsDdl = async (): Promise<PgFtsDdlBuilders> => {
  const mod = await import('@aiao/rxdb-adapter-pglite/fts');
  return { buildCreateFtsTableSql: mod.buildCreateFtsTableSql, buildFtsTriggersSql: mod.buildFtsTriggersSql };
};
