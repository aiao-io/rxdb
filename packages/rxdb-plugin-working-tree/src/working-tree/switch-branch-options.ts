/**
 * @fileoverview 切分支的两道前置：目标分支的历史能不能重放，当前分支干不干净。
 *
 * @remarks
 * 两道各判各的，**不合成一个函数**。判据来源就不是一回事：
 * {@link assertSwitchBranchPreconditions} 问的是当前分支的 `WorkingTreeState.entryCount`，
 * {@link assertSwitchTargetIntact} 问的是**目标**分支的可达父链。合成之后
 * `requireClean: false` 这个开关会顺带把损坏守卫一起关掉——而历史子系统的回放路径
 * 正是这么调的，于是那条路径可以切进一份重放不出来的历史。
 *
 * 两者仍然同住一个模块：它们是同一次切换的两道前置，接线点也是同一处
 * （`RxDBSystemContribution.prepareBranchSwitch`），拆成两个文件只会让那一处要 import 两次。
 */

import { RxDBError, type RxDBBranchSwitchPreconditions, type TransactionExecutor } from '@aiao/rxdb';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { StaleActiveBranchError } from './write-entry.js';

/**
 * `switchBranch()` 的可选第二形参（FR-017、contracts/core-api.md §6）。
 *
 * @remarks
 * 是核心 {@link RxDBBranchSwitchPreconditions} 的**同一个类型**，不是它的副本：形状必须在核心
 * 才能让 `VersionManager.switchBranch()` 在方法声明处就带上补全，含义则只有本能力解释得了
 * （两个字段的判据都在本插件贡献的表上）。别名让两处**只有一处声明**——`switch-branch-options.spec.ts`
 * 上那条「不多不少就这两个字段」的类型断言因此同时看住了核心那一侧。
 *
 * **不复用**适配器的 `SwitchBranchOptions`（`packages/rxdb/src/rxdb-adapter.ts`）：后者是
 * `{ branchId, actions }`，是另一层的入参；漏进公开 API 等于让用户看见适配器的内部形状，
 * 还得自己造一份 `SwitchVersionActions` 才调得动。
 */
export type WorkingTreeSwitchBranchOptions = RxDBBranchSwitchPreconditions;

/**
 * 工作树非空导致切换被拒（FR-017）。
 *
 * @remarks
 * 带上 `branchId` 与 `entryCount` 而不只是一句话：界面拿裸 `Error` 只能把消息原样贴出去，
 * 带上这两项它才说得出「main 上还有 2 条未提交改动，先提交或丢弃」。
 */
export class WorkingTreeDirtyError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'working_tree_dirty';

  /** 被拒时所在的分支 */
  readonly branchId: string;

  /** 该分支上未提交的条目数 */
  readonly entryCount: number;

  /**
   * @param branchId - 被拒时所在的分支
   * @param entryCount - 该分支上未提交的条目数
   */
  constructor(branchId: string, entryCount: number) {
    super(`分支 ${branchId} 上还有 ${entryCount} 条未提交改动：先 commit() 或 discard()，或不传 requireClean。`);
    this.branchId = branchId;
    this.entryCount = entryCount;
    this.name = 'WorkingTreeDirtyError';
    Object.setPrototypeOf(this, WorkingTreeDirtyError.prototype);
  }
}

/**
 * 校验调用方**显式提出**的那些前置条件（FR-017、FR-020）。
 *
 * @param executor - 调用方那个只读事务的执行器
 * @param options - 调用方提出的前置条件；不传即不表态
 * @throws {@link WorkingTreeDirtyError} `requireClean: true` 且当前分支非空时
 * @throws {@link StaleActiveBranchError} `expectedActivationRevision` 与库里的对不上时
 *
 * @remarks
 * **没提出任何条件时一条语句都不发。** 不是「读了再忽略」：那次读会被加进每一次切换的成本，
 * 而读回来的东西迟早会被「顺手」用上——那一步没有任何测试拦得住。
 *
 * `requireClean: false` 与不传是同一件事。反过来把「字段存在」当成「要检查」
 * （`options.requireClean !== undefined` 之类）的话，显式关闭反而打开了检查。
 *
 * clean 的判据只取 `WorkingTreeState.entryCount` 这一列，不扫条目表：扫表既丢掉 SC-001 要的
 * 常数时间，也让判据与 `status().clean` 从此可以漂移——漂移的那天，摘要说干净、切换说脏，
 * 用户没有任何出路。
 */
export const assertSwitchBranchPreconditions = async (
  executor: TransactionExecutor,
  options?: WorkingTreeSwitchBranchOptions
): Promise<void> => {
  const requireClean = options?.requireClean === true;
  const expectedActivationRevision = options?.expectedActivationRevision;
  if (!requireClean && expectedActivationRevision === undefined) return;

  const token = await readActiveBranchToken(executor);
  if (expectedActivationRevision !== undefined && token.activationRevision !== expectedActivationRevision) {
    throw new StaleActiveBranchError(
      { branchId: token.branchId, activationRevision: expectedActivationRevision },
      token
    );
  }
  if (!requireClean) return;

  const state = await readWorkingTreeStateRow(executor, token.branchId);
  if (state.entryCount === 0) return;
  throw new WorkingTreeDirtyError(token.branchId, state.entryCount);
};

/**
 * 校验**目标**分支的提交图可达完好（FR-051、SC-013）。
 *
 * @param executor - 调用方那个只读事务的执行器
 * @param targetBranchId - 要切过去的分支 id
 * @throws {@link CommitGraphCorruptedError} 目标分支已被标记损坏，或可达父链上有一处对不上
 *
 * @remarks
 * 判定**整个**转交 {@link assertCommitGraphIntact}，本模块一个字面量都不重复：FR-051 要的是
 * 「实现为共享 guard，不得各写一份」。抄一份出来一开始逐字段相同，直到某次只改了守卫、
 * 没改抄件——而那一刻两边的用例都还是绿的。
 *
 * 查的是 `targetBranchId`，不是当前分支。另外三处调用点（commit / restore / discard）全写作
 * `assertCommitGraphIntact(executor, token.branchId)`，照抄过来正好把方向弄反：
 * 切进坏分支畅通无阻，切离坏分支反被拒——而「切离」恰恰是 FR-051 明文允许的三件事之一。
 *
 * 只读。损坏标记由 `markBranchCorrupted()` 在**另一个事务**里落；写进这次必然回滚的事务里，
 * 标记会跟着一起消失，用户永远诊断不出来。
 */
export const assertSwitchTargetIntact = async (
  executor: TransactionExecutor,
  targetBranchId: string
): Promise<void> => {
  await assertCommitGraphIntact(executor, targetBranchId);
};
