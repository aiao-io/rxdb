/**
 * PostgreSQL `tsvector` 后端。
 *
 * @packageDocumentation
 */

import { DEFAULT_FTS_REGCONFIG } from './pg-fts-contract.js';

import type { FtsInstallPlan } from '../../core/fts5-installer.js';
import type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from '../../core/fts5-runtime.js';
import type { FtsExecutor, SearchEngine } from '../../core/search-engine.js';
import { SearchBackendCapabilityError } from '../../types.js';
import { FULL_SEARCH_CAPABILITIES, type SearchBackend } from '../search-backend.js';
import { createPgSearchEngine } from './pg-engine.js';
import { compilePgQuery } from './pg-query-compiler.js';
import { installPgFtsForEntity, pgFtsMigrationName } from './pg-runtime.js';

/**
 * 实测这条连接真的能跑全文检索的三个组成部分：`to_tsvector`（索引）、
 * `to_tsquery` + `@@`（匹配）、`ts_headline`（片段）。
 *
 * 三者都在核心里，正常 PostgreSQL / PGlite 构建不会缺；但 `DEFAULT_FTS_REGCONFIG`
 * 指定的文本搜索配置**可能不存在**——PGlite 的精简构建裁掉过若干 `pg_catalog` 配置。
 * 缺失时报的是「text search configuration does not exist」，出现在第一次查询里，
 * 与「搜索插件装载失败」相距甚远，所以提前在装载期探一次。
 */
const assertPgCapabilities = async (executor: RuntimeSqlExecutor, adapter: string): Promise<void> => {
  const cfg = DEFAULT_FTS_REGCONFIG;
  try {
    await executor.rawQuery(
      [
        `SELECT`,
        `  to_tsvector('${cfg}', 'probe') @@ to_tsquery('${cfg}', 'probe') AS matched,`,
        `  ts_headline('${cfg}', 'probe', to_tsquery('${cfg}', 'probe')) AS fragment`
      ].join('\n')
    );
  } catch (error) {
    throw new SearchBackendCapabilityError(
      adapter,
      'pg-tsvector',
      `PostgreSQL connection cannot run full-text search with the "${cfg}" text search configuration`,
      error
    );
  }
};

/**
 * 构造 PostgreSQL tsvector 后端。
 *
 * @returns pg-tsvector 后端实例
 * @public
 */
export const createPgTsvectorBackend = (): SearchBackend => ({
  id: 'pg-tsvector',
  capabilities: FULL_SEARCH_CAPABILITIES,
  compile: compilePgQuery,
  installMigrationPrefix: (tableName: string): string => `${pgFtsMigrationName(tableName, 'install')}__`,
  assertCapabilities: assertPgCapabilities,
  install: (
    plan: FtsInstallPlan,
    executor: RuntimeSqlExecutor,
    migrationStore: MigrationRecordStore
  ): Promise<InstallFtsResult> => installPgFtsForEntity(plan, executor, migrationStore),
  createEngine: (executor: FtsExecutor): SearchEngine => createPgSearchEngine(executor)
});
