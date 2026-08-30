/**
 * 搜索后端契约（US-703）。
 *
 * 插件本体不再认识任何一种具体的全文索引实现：它拿到的只有一个 {@link SearchBackend}，
 * 由 {@link resolveSearchBackend} 按当前 adapter 解析而来。SQLite FTS5 与 PostgreSQL
 * tsvector 的差异（编译目标语法、DDL、回填方式、查询 SQL、rank 方向）全部收在各自的
 * backend 实现内部，`plugin.ts` 里不出现任何一处 adapter/方言分支。
 *
 * @packageDocumentation
 */

import type { FtsInstallPlan } from '../core/fts5-installer.js';
import type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from '../core/fts5-runtime.js';
import type { CompiledQuery } from '../core/query-compiler.js';
import type { FtsExecutor, SearchEngine } from '../core/search-engine.js';

/**
 * 已实现的搜索后端标识。
 *
 * - `fts5` —— SQLite FTS5 外部内容虚拟表（`@aiao/rxdb-adapter-sqlite-core` 家族）
 * - `pg-tsvector` —— PostgreSQL 物化 `tsvector` 列 + GIN 索引（`@aiao/rxdb-adapter-pglite`）
 *
 * @public
 */
export type SearchBackendId = 'fts5' | 'pg-tsvector';

/**
 * 后端**自我声明**的能力集合。
 *
 * adapter 能不能用由这里决定，不由名字决定：注册表把 adapter 名映射到后端，
 * 后端声明能力，真实可用性再由 {@link SearchBackend.assertCapabilities} 在装载时
 * 对着活连接实测一次。三层都通过才放行。
 *
 * @public
 */
export interface SearchBackendCapabilities {
  /** 具备可被索引加速的全文匹配（FTS5 虚拟表 / GIN + tsvector） */
  readonly fullTextIndex: boolean;
  /** 能由存储层直接产出高亮片段（`snippet()` / `ts_headline()`） */
  readonly snippet: boolean;
  /** 全表零命中时支持无索引的中缀兜底扫描 */
  readonly containsFallback: boolean;
  /** 能把数组列展开成可索引文本 */
  readonly arrayFields: boolean;
}

/**
 * 一种全文搜索后端的完整实现。
 *
 * @public
 */
export interface SearchBackend {
  /** 后端标识 */
  readonly id: SearchBackendId;
  /** 后端声明的能力 */
  readonly capabilities: SearchBackendCapabilities;

  /**
   * 把用户输入编译为该后端的匹配表达式。
   *
   * 在**构造期**就必须可用：`isSearchableQuery` 与结果池缓存键都依赖它，
   * 二者都早于 `install()` 完成即可被调用。
   *
   * @param query - 原始输入
   * @returns 编译结果；归一化后为空时返回 `null`（不视为错误）
   */
  compile(query: string): CompiledQuery | null;

  /**
   * 该后端在 `rxdb_migration` 表中使用的 install 记录前缀。
   *
   * 两套后端各占一个命名空间，避免同名记录被互相误读为「已安装」。
   *
   * @param tableName - 物理表名
   */
  installMigrationPrefix(tableName: string): string;

  /**
   * 对着**活连接**实测后端所需的存储能力，缺失即抛。
   *
   * 这是两层守卫的第二层：第一层（注册表）只能判断 adapter 属于哪个引擎家族，
   * 判断不了这个具体构建有没有编进 FTS5、有没有注册 `rxdb_fts_bigram` 这类自定义函数。
   *
   * @param executor - 引导期 SQL 执行器
   * @param adapter - 当前 adapter 名（仅用于错误归因）
   * @throws {SearchBackendCapabilityError} 能力缺失时，带可判别的原因
   */
  assertCapabilities(executor: RuntimeSqlExecutor, adapter: string): Promise<void>;

  /**
   * 安装单个实体的全文索引；幂等，且中断后可判定（US-703 AC#4 / AC#7）。
   *
   * @param plan - 由实体元数据推导出的安装计划
   * @param executor - 引导期 SQL 执行器
   * @param migrationStore - 迁移记录读写
   */
  install(
    plan: FtsInstallPlan,
    executor: RuntimeSqlExecutor,
    migrationStore: MigrationRecordStore
  ): Promise<InstallFtsResult>;

  /**
   * 绑定查询执行器，产出与后端无关的 {@link SearchEngine}。
   *
   * @param executor - 查询期 SQL 执行器
   */
  createEngine(executor: FtsExecutor): SearchEngine;
}

/**
 * 两套后端当前均已实现全部能力；抽成常量避免各自重复字面量导致漂移。
 *
 * @internal
 */
export const FULL_SEARCH_CAPABILITIES: SearchBackendCapabilities = Object.freeze({
  fullTextIndex: true,
  snippet: true,
  containsFallback: true,
  arrayFields: true
});
