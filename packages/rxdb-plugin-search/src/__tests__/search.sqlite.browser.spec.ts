/**
 * sqlite（官方 sqlite-wasm / OPFS worker）搜索套件入口（US-703 AC#8）。
 *
 * 用 `@aiao/rxdb-adapter-sqlite` 的 `sqliteOfficialFactory` 装载并执行
 * 与 sqlite-wasm 完全相同的搜索行为套件 + FTS5 安装套件。
 */
import { sqliteOfficialFactory } from '@aiao/rxdb-adapter-sqlite/testing';

import { createFts5InstallerHarnessFactory, fts5InstallerSuite } from './fts5-installer.suite.js';
import { createSearchBehaviorHarnessFactory, searchBehaviorSuite } from './search-behavior.suite.js';

searchBehaviorSuite(createSearchBehaviorHarnessFactory(sqliteOfficialFactory));
fts5InstallerSuite(createFts5InstallerHarnessFactory(sqliteOfficialFactory));
