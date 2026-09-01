/**
 * SQLite FTS5 后端。
 *
 * 刻意是一层**薄壳**：安装、查询 SQL、结果映射全部沿用既有的 `core/fts5-*` 与
 * `core/search-engine`，一行行为都不改。US-703 引入 backend 抽象的目的是「多接一种后端」，
 * 不是「重排 FTS5 的实现」；把 SQLite 逻辑搬进 backend 目录会让公开导出面被迫改名，
 * 那是纯粹的破坏性变更（见故事 AC#9 的处置说明）。
 *
 * @packageDocumentation
 */

import { FTS_BIGRAM_SQL_FUNCTION } from '@aiao/rxdb-adapter-sqlite-core';

import { ftsMigrationName, type FtsInstallPlan } from '../core/fts5-installer.js';
import {
  installFtsForEntity,
  type InstallFtsResult,
  type MigrationRecordStore,
  type RuntimeSqlExecutor
} from '../core/fts5-runtime.js';
import { compile } from '../core/query-compiler.js';
import { createSearchEngine, type FtsExecutor, type SearchEngine } from '../core/search-engine.js';
import { SearchBackendCapabilityError } from '../types.js';
import { FULL_SEARCH_CAPABILITIES, type SearchBackend } from './search-backend.js';

/** 能力探针用的临时 FTS5 虚拟表名，建完即删。 */
const PROBE_TABLE = 'rxdb_search_fts5_probe';

/**
 * 实测两件事，缺任一件都不能放行：
 *
 * 1. **FTS5 模块编进了这个构建**——建一张 `temp.` 虚拟表最直接，比读 `pragma_compile_options`
 *    可靠（后者在部分构建里被 `SQLITE_OMIT_INTROSPECTION_PRAGMAS` 关掉）。
 * 2. **`rxdb_fts_bigram` 自定义函数已注册**——索引侧的 CJK bigram 变换靠它，
 *    缺了的话建表会成功而回填在第一条 SQL 上炸「no such function」，
 *    错误信息与真正的原因相距甚远。
 */
const assertFts5Capabilities = async (executor: RuntimeSqlExecutor, adapter: string): Promise<void> => {
  try {
    await executor.rawQuery(
      [
        `CREATE VIRTUAL TABLE IF NOT EXISTS temp.${PROBE_TABLE} USING fts5(probe);`,
        `DROP TABLE IF EXISTS temp.${PROBE_TABLE};`
      ].join('\n')
    );
  } catch (error) {
    throw new SearchBackendCapabilityError(adapter, 'fts5', 'SQLite build does not provide the FTS5 module', error);
  }
  try {
    await executor.rawQuery(`SELECT ${FTS_BIGRAM_SQL_FUNCTION}('probe') AS probe`);
  } catch (error) {
    throw new SearchBackendCapabilityError(
      adapter,
      'fts5',
      `SQLite connection does not register the custom function ${FTS_BIGRAM_SQL_FUNCTION}() required for CJK indexing`,
      error
    );
  }
};

/**
 * 构造 SQLite FTS5 后端。
 *
 * @returns FTS5 后端实例
 * @public
 */
export const createFts5Backend = (): SearchBackend => ({
  id: 'fts5',
  capabilities: FULL_SEARCH_CAPABILITIES,
  compile,
  installMigrationPrefix: (tableName: string): string => `${ftsMigrationName(tableName, 'install')}__`,
  assertCapabilities: assertFts5Capabilities,
  install: (
    plan: FtsInstallPlan,
    executor: RuntimeSqlExecutor,
    migrationStore: MigrationRecordStore
  ): Promise<InstallFtsResult> => installFtsForEntity(plan, executor, migrationStore),
  createEngine: (executor: FtsExecutor): SearchEngine => createSearchEngine(executor)
});
