/**
 * sqliteai 搜索套件入口（US-703 AC#8）。
 *
 * 用 `@aiao/rxdb-adapter-sqliteai` 的 `sqliteaiFactory` 装载并执行
 * 与 sqlite-wasm 完全相同的搜索行为套件 + FTS5 安装套件 + 可写检出位的全文索引套件。
 */
import { sqliteaiFactory } from '@aiao/rxdb-adapter-sqliteai/testing';

import { createFts5InstallerHarnessFactory, fts5InstallerSuite } from './fts5-installer.suite.js';
import { createSearchBehaviorHarnessFactory, searchBehaviorSuite } from './search-behavior.suite.js';
import { createSqliteWorktreeSearchFactory, worktreeSearchSuite } from './worktree-search.suite.js';

searchBehaviorSuite(createSearchBehaviorHarnessFactory(sqliteaiFactory));
fts5InstallerSuite(createFts5InstallerHarnessFactory(sqliteaiFactory));
worktreeSearchSuite(createSqliteWorktreeSearchFactory(sqliteaiFactory));
