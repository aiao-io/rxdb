/**
 * @fileoverview `@aiao/rxdb-devtools/testing-providers` 入口：纯 fake provider 装配。
 *
 * @remarks
 * 薄壳，只 re-export `testing/fake-providers`，不放实现。独立成子路径的原因与
 * `./testing` **相反**：那一条链路要 `import 'vitest'`，运行时入口不能背上测试框架；
 * 这一条只含 fake 集合与它的类型，宿主测试（如 Tauri demo 的 fake 档 e2e）需要 fake
 * provider 却**不该**因此背上 vitest。
 *
 * **本入口不受 `requirements/api-baseline/rxdb-devtools.json` 保护**（baseline 只扫
 * `src/index.ts`）。按 `requirements/README.md`，日后收窄这里的导出必须在 PR 描述里手动
 * 声明为 breaking，没有门禁会替你发现。
 *
 * @module @aiao/rxdb-devtools/testing-providers
 */

export { createFakeProviders } from './testing/fake-providers.js';
export type {
  DevToolsFakePlatformFailure,
  DevToolsFakeProviderKinds,
  DevToolsFakeProviderOptions,
  DevToolsFakeProviderSet
} from './testing/fake-providers.js';
