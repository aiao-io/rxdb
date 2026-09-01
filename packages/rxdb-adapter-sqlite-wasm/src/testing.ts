/**
 * sqlite-wasm 适配器测试工具入口（test-only）。
 *
 * 通过 `@aiao/rxdb-adapter-sqlite-wasm/testing` 子路径导出，供跨包测试复用
 * `sqliteWasmFactory`（US-703 AC#8 的搜索套件入口依赖它）。
 *
 * 刻意用 `import.meta.glob` 而不是直接 `export ... from './__tests__/...'`：
 * 后者会在 lib 类型检查里把测试工厂（及其 `@aiao/rxdb-test/encrypted` 依赖链）
 * 拖进 `rootDir`，违反 `src/__tests__/` 的 lib 排除约定。glob 不产生直接 TS
 * import 边，测试工厂只在 vite 打包/运行期被解析，类型由泛型声明。
 *
 * @packageDocumentation
 */

import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';

const factoryModules = import.meta.glob<{ sqliteWasmFactory: AdapterFactory }>('./__tests__/sqlite-wasm-factory.ts', {
  eager: true
});

export const sqliteWasmFactory: AdapterFactory = factoryModules['./__tests__/sqlite-wasm-factory.ts'].sqliteWasmFactory;
