/**
 * sqlite-wasm 搜索行为套件入口。
 *
 * 套件本体在 {@link searchBehaviorSuite}（按 adapter 参数化），这里用
 * `@aiao/rxdb-adapter-sqlite-wasm` 的 `sqliteWasmFactory` 装载并执行同一套断言。
 */
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';

import { createSearchBehaviorHarnessFactory, searchBehaviorSuite } from './search-behavior.suite.js';

searchBehaviorSuite(createSearchBehaviorHarnessFactory(sqliteWasmFactory));
