/**
 * @fileoverview `workingTreeCaptureConformanceSuite` —— 捕获侧一致性套件。
 *
 * @remarks
 * 覆盖范围见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §1：
 * 捕获完备性（4 个挂载点各自成组）、写入口语义矩阵逐行、bypass 判定 5 步、untracked 域、
 * 存储契约静态断言。归属 US-306 阶段 A。
 *
 * **当前是占位实现**：T004 只冻结调用形状与导出名，让 6 个适配器包的调用点可以先写、先红。
 * 用例本体在 Phase 4（T046–T055）填。
 *
 * 占位体注册一条**必失败**的用例，而不是 `describe.skip`，也不是在函数体里直接 `throw`：
 * - skip 会让运行矩阵显示成「已跑过」，那正是本套件自己要禁止的假绿；
 * - 在函数体里同步 throw 会在 collect 阶段炸掉整个 spec 文件，把「套件未实现」伪装成
 *   「适配器测试全挂」，排查的人得先还原出这是占位才看得懂。
 *
 * @module @aiao/rxdb/testing
 */

import { describe, it } from 'vitest';

import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';

/**
 * 注册捕获侧一致性用例。
 *
 * @param context - 适配器名与数据库工厂，见 {@link WorkingTreeConformanceSuiteContext}
 *
 * @public
 */
export const workingTreeCaptureConformanceSuite = (context: WorkingTreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 工作树捕获一致性`, () => {
    it('占位：用例本体在 US-306 阶段 A（T046–T055）填入', () => {
      throw new Error('workingTreeCaptureConformanceSuite: not implemented');
    });
  });
};
