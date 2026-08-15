/**
 * @fileoverview `@aiao/rxdb-devtools/testing` 入口：conformance 接缝与共享套件。
 *
 * @remarks
 * 薄壳，只 re-export，不放实现。它独立成子路径而不是并进主入口，唯一原因是这条链路要
 * `import 'vitest'`——运行时入口不能背上测试框架。
 *
 * **本入口不受 `requirements/api-baseline/rxdb-devtools.json` 保护**（baseline 只扫
 * `src/index.ts`）。按 `requirements/README.md`，日后收窄这里的导出必须在 PR 描述里手动
 * 声明为 breaking，没有门禁会替你发现。
 *
 * @module @aiao/rxdb-devtools/testing
 */

export {
  DEVTOOLS_DEFAULT_SCENARIO,
  DEVTOOLS_RELAY_SEGMENTS,
  createScenario
} from './testing/driver.js';
export type {
  DevToolsConformanceDriver,
  DevToolsConformanceScenario,
  DevToolsConformanceSession,
  DevToolsProviderProbe,
  DevToolsRelaySegment,
  DevToolsSegmentProbe,
  DevToolsWireFrame
} from './testing/driver.js';

export { createFakeClock } from './testing/fake-clock.js';
export type { DevToolsFakeClock } from './testing/fake-clock.js';

export { createJsonConformanceDriver } from './testing/json-driver.js';
export type { JsonDriverEndpoints } from './testing/json-driver.js';

export {
  assertCanonicalJsonFrame,
  isCanonicalJsonFrame,
  runDevToolsWireHygieneSuite
} from './testing/wire-hygiene.suite.js';
