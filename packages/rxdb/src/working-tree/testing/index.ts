/**
 * @fileoverview `@aiao/rxdb/testing` 入口：两套工作树 conformance 套件。
 *
 * @remarks
 * 薄壳，只 re-export，不放实现。它独立成子路径而不是并进 `@aiao/rxdb` 主入口，唯一原因是
 * 这条链路最终要 `import 'vitest'`——运行时入口不能背上测试框架。
 *
 * 运行矩阵是 **6 个 v1 适配器 × 2 套套件**，每个适配器包必须有**实际调用点**；
 * 「导出了但没人跑」等于没覆盖。
 *
 * @module @aiao/rxdb/testing
 */

export { workingTreeCaptureConformanceSuite } from './capture.suite.js';
export { workingTreeCommitConformanceSuite } from './commit.suite.js';
export type { WorkingTreeConformanceSuiteContext } from './suite-context.js';
