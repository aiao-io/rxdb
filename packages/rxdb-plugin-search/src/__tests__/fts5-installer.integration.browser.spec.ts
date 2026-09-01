/**
 * sqlite-wasm FTS5 安装套件入口。
 *
 * 套件本体在 {@link fts5InstallerSuite}（按 adapter 参数化），这里用
 * `@aiao/rxdb-adapter-sqlite-wasm` 的 `sqliteWasmFactory` 装载并执行同一套断言。
 */
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';

import { createFts5InstallerHarnessFactory, fts5InstallerSuite } from './fts5-installer.suite.js';

fts5InstallerSuite(createFts5InstallerHarnessFactory(sqliteWasmFactory));
