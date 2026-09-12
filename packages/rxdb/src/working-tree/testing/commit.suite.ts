/**
 * @fileoverview `workingTreeCommitConformanceSuite` —— 提交侧一致性套件。
 *
 * @remarks
 * 覆盖范围见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §2：
 * commit 图与 HEAD 持久化、一次性启用迁移、两类 CAS 分开断言、commit 原子性、
 * 损坏守卫三入口、restore、分支隔离与跨 realm 冲突。
 *
 * US-305 的 commit 图与迁移断言**并入本套件**，不另起第三个套件名——第三个名字会让
 * 「哪套是权威」重新变成开放问题。
 *
 * **当前是占位实现**：占位形态的理由同 `./capture.suite.ts`。用例本体分批在
 * Phase 3（US-305）、Phase 5（阶段 B）、Phase 7（US-307）、Phase 8（US-308）填入。
 *
 * @module @aiao/rxdb/testing
 */

import { describe, it } from 'vitest';

import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';

/**
 * 注册提交侧一致性用例。
 *
 * @param context - 适配器名与数据库工厂，见 {@link WorkingTreeConformanceSuiteContext}
 *
 * @public
 */
export const workingTreeCommitConformanceSuite = (context: WorkingTreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 提交图与工作树提交一致性`, () => {
    it('占位：用例本体在 US-305 / US-306 阶段 B / US-307 / US-308 各自阶段填入', () => {
      throw new Error('workingTreeCommitConformanceSuite: not implemented');
    });
  });
};
