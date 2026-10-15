/**
 * @fileoverview 调用方捕获型 CAS 的比较与它的诊断返回值（FR-031/FR-035、SC-008，
 * 契约见 contracts/core-api.md §4.1、data-model.md §7）
 *
 * @remarks
 * 这个模块只有一件事：把「调用方看到的三个位」与「事务里读到的三个位」比一遍，
 * 第一处对不上就停下来，产出一个**值**。三条不可让步的性质都写死在这里：
 *
 * 1. **三个位各自有一次比较，一个都不能省。** 只比 `headRevision` 看起来够用——提交推进的
 *    正是 HEAD——但那测不到另一个 Tab 在 `status()` 与 `commit()` 之间做的一次 `save()`：
 *    那次写只动工作树、不动 HEAD，于是用户提交了他没看过的变更（SC-008 点名的正是这条）。
 *    只比 `branchId` 也不行：`main → feature → main` 一个来回之后分支 id 又「对上了」，
 *    而这中间工作树已经换过两轮，`activationRevision` 是唯一能认出这件事的位。
 * 2. **期望值只能来自调用方。** 缺省时「由命令自己在事务里读一次」的实现，读到的恒等于
 *    当前值，CAS 永远命中——这比不校验更糟，因为它看起来校验过了。所以本函数的两个入参
 *    是分开的：一份是调用方给的，一份是刚读出来的，没有第三种来源。
 * 3. **冲突是返回值，不是异常，更不触发重试。** `commit_conflict` 不在
 *    {@link CommitErrorCode} 那张封闭表里；自动重试等于用**第二次**读到的 revision 再打一次
 *    CAS，那一次必然成功，而它提交的正是调用方没看过的那批变更。
 *
 * {@link CommitConflict} **不入库**：没有冲突表、没有「清除冲突」的 API、没有生命周期。
 * 一旦落库，库里就有了两份会互相漂移的冲突真相，而其中一份没有任何人负责清——
 * `status()` 的 `conflicted` 位因此只认 `WorkingTreeRestoreSession`（见 `status.ts` 第 2 条）。
 */

import type { ActiveBranchToken } from './write-entry.js';

/**
 * 三次比较各自对应的冲突种类。
 *
 * @remarks
 * 取值域与「有几次比较」是同一件事的两种写法：少一个取值就意味着少一次比较。
 * 因此它不是描述性文案，改动它等于改动并发仲裁的强度。
 *
 * 捕获的 `branchId` 与当前 active 分支**不是同一条**时也归到
 * `activation_revision`——它与「同一条分支上激活号对不上」同属「你看的不是这个工作树」，
 * 而不是另开一个取值让调用方多分一路。两者靠
 * {@link CommitConflict.branchId} 区分：它恒为**当前** active 分支。
 */
export type CommitConflictKind = 'working_tree_revision' | 'head_revision' | 'activation_revision';

/**
 * 一次被拒的提交 / 丢弃给出的类型化诊断（contracts/core-api.md §4.1）。
 *
 * @remarks
 * **键集恰好四个，不留扩展位。** 多一个字段就多一处可以被顺手写进某张表的东西，
 * 而这个值的全部设计前提是它不入库。想补充上下文的调用方手上已经有完整的入参与
 * 一次新的 `status()`，不需要库替它记。
 *
 * 「建议动作」不做成字段：三种 kind 的出路是同一条——重新 `status()`、让用户复核、
 * 再提交一次。写成字符串字段只会诱导调用方把它直接显示给用户。
 */
export interface CommitConflict {
  /** 哪一次比较没通过；见 {@link CommitConflictKind} */
  readonly kind: CommitConflictKind;

  /** 调用方捕获的值 */
  readonly expected: number;

  /** 事务里读到的当前值 */
  readonly actual: number;

  /** **当前** active 分支 id；与捕获的分支不同时，这就是调用方认错分支的证据 */
  readonly branchId: string;
}

/**
 * 调用方在读取时捕获的三个位（FR-020/FR-031）。
 *
 * @remarks
 * `commit()` 与 `discard()` 的选项类型都继承它，而不是各写一遍三个字段：两份声明迟早会在
 * 某次增补时分岔，而「两个命令用同一组凭据」正是调用方能把一次 `status()` 的结果同时喂给
 * 它们的前提。
 *
 * 三个字段**全部必填**。给默认值等于让调用方可以跳过某一次比较，而跳过哪一次都会落回
 * 上面第 1 条描述的那个退化形态。
 */
export interface WorkingTreeCredentials {
  /** 捕获时的 active 分支身份 */
  readonly expectedBranch: ActiveBranchToken;

  /** 捕获时的 HEAD 推进 revision */
  readonly expectedHeadRevision: number;

  /** 捕获时的工作树 revision */
  readonly expectedWorkingTreeRevision: number;
}

/**
 * 命令在自己的写事务里读到的三个位的当前值。
 *
 * @remarks
 * 与 {@link WorkingTreeCredentials} 刻意长成不同的形状：两者同形的话，调用方可以把同一个
 * 对象同时当期望值与实际值传进 {@link findCommitConflict}，而那正是第 2 条要排除的写法。
 */
export interface WorkingTreeRevisionSnapshot {
  /** 事务里读到的 active 分支令牌 */
  readonly token: ActiveBranchToken;

  /** `CommitBranchRef.headRevision` 的当前值 */
  readonly headRevision: number;

  /** `WorkingTreeState.workingTreeRevision` 的当前值 */
  readonly workingTreeRevision: number;
}

/**
 * 比一遍三个捕获位，产出第一处不匹配（FR-031）。
 *
 * @param credentials - 调用方捕获的三个位
 * @param observed - 命令在写事务里读到的当前值
 * @returns 第一处不匹配的 {@link CommitConflict}；三者全都对得上时返回 `undefined`
 *
 * @remarks
 * **比较顺序是 activation → head → working tree，在第一处不匹配上停下。** 顺序按
 * 「错得有多离谱」排：分支认错了的话，后两个 revision 根本不属于同一条时间线，先报它们
 * 会把调用方引向「重新读一次 head 再试」——而正确的出路是先搞清楚自己在哪条分支上。
 *
 * **调用点必须把它排在任何写入之前。** 排在写之后的话，一次被拒的提交照样推进了一格
 * `headRevision`，别的 Tab 手里的凭据全部失效，而实际上什么都没提交。
 *
 * 分支 id 不匹配时，`expected` / `actual` 给的是两边的 `activationRevision`——它们可能
 * 恰好相等（两条分支各自激活过同样多次）。这不是 bug：这一路的判据是
 * {@link CommitConflict.branchId} 与调用方手上的 `expectedBranch.branchId` 不同，
 * 而不是两个数字的大小关系。
 */
export const findCommitConflict = (
  credentials: WorkingTreeCredentials,
  observed: WorkingTreeRevisionSnapshot
): CommitConflict | undefined => {
  const { token } = observed;
  const branch = credentials.expectedBranch;
  if (branch.branchId !== token.branchId || branch.activationRevision !== token.activationRevision) {
    return {
      kind: 'activation_revision',
      expected: branch.activationRevision,
      actual: token.activationRevision,
      branchId: token.branchId
    };
  }
  if (credentials.expectedHeadRevision !== observed.headRevision) {
    return {
      kind: 'head_revision',
      expected: credentials.expectedHeadRevision,
      actual: observed.headRevision,
      branchId: token.branchId
    };
  }
  if (credentials.expectedWorkingTreeRevision !== observed.workingTreeRevision) {
    return {
      kind: 'working_tree_revision',
      expected: credentials.expectedWorkingTreeRevision,
      actual: observed.workingTreeRevision,
      branchId: token.branchId
    };
  }
  return undefined;
};
