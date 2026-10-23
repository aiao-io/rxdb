/**
 * sqlite-wasm 搜索行为套件入口。
 *
 * 套件本体在 {@link searchBehaviorSuite}（按 adapter 参数化），这里用
 * `@aiao/rxdb-adapter-sqlite-wasm` 的 `sqliteWasmFactory` 装载并执行同一套断言；
 * 可写检出位的全文索引套件（US-314 B2.5）同样在这里跑。
 */
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';

import { createSearchBehaviorHarnessFactory, searchBehaviorSuite } from './search-behavior.suite.js';
import { createSqliteWorktreeSearchFactory, worktreeSearchSuite } from './worktree-search.suite.js';

searchBehaviorSuite(createSearchBehaviorHarnessFactory(sqliteWasmFactory));
worktreeSearchSuite(createSqliteWorktreeSearchFactory(sqliteWasmFactory));
