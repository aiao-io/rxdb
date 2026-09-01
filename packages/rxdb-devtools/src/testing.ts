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

export { DEVTOOLS_DEFAULT_SCENARIO, DEVTOOLS_RELAY_SEGMENTS, createScenario } from './testing/driver.js';
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
export type {
  JsonConformanceDriverOptions,
  JsonDriverEndpointFactory,
  JsonDriverEndpoints,
  JsonDriverNodeFactory,
  JsonDriverNodes
} from './testing/json-driver.js';

// 中间两段的接缝：下游 driver 换掉 relay 实现，装配与判据一份都不复制（AC#44）。
export type { FakeRelayNode } from './testing/fake-relay.js';

export { createFakeEndpointFactory } from './testing/fake-endpoints.js';

export { createFakeProviders } from './testing/fake-providers.js';
export type {
  DevToolsFakePlatformFailure,
  DevToolsFakeProviderKinds,
  DevToolsFakeProviderOptions,
  DevToolsFakeProviderSet
} from './testing/fake-providers.js';

// fixture 表是 AC#23 穷尽性的抓手：下游补映射要**加一行**，而不是加一条 default 分支。
export { DEVTOOLS_ERROR_MAPPING_FIXTURES } from './testing/error-fixtures.js';
export type { DevToolsErrorFixture } from './testing/error-fixtures.js';

export {
  encodeFrame,
  readErrorCodes,
  readLegacyFramesOfType,
  readV2Frames,
  readV2FramesOfType
} from './testing/frames.js';
export type { DevToolsAnyErrorCode } from './testing/frames.js';

export {
  DEVTOOLS_SUITE_BASE_TIMESTAMP,
  connected,
  connectorOutput,
  panelClient,
  panelOutput,
  sessionIdOf
} from './testing/suite-support.js';
export type { DevToolsSuitePanelClient } from './testing/suite-support.js';

export { runDevToolsControlPlaneSuite } from './testing/control-plane.suite.js';
export { runDevToolsDataPlaneSuite } from './testing/data-plane.suite.js';
export {
  assertCanonicalJsonFrame,
  isCanonicalJsonFrame,
  runDevToolsWireHygieneSuite
} from './testing/wire-hygiene.suite.js';
