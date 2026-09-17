/**
 * @fileoverview 三端入口共用的**命令实现**：把 {@link WorkingTreeManager} 的九个方法与
 * `versionManager.switchBranch()` 接到 {@link WorkingTreeAsyncStates} 上
 * （US-306 阶段 C、T110 与 T123，contracts/tri-framework-api.md §1/§4）。
 *
 * @remarks
 * 只有容器形态该由框架决定——Angular 是 `Signal`、React 是渲染快照、Vue 是 `ComputedRef`。
 * 「哪一步发 loading」「哪些结果算 empty」「一次成功的提交之后要不要重读 status」这三件事
 * 不是形态问题，是**语义**问题，而 §1 对语义的要求是三端共用同一份，不各自重定义。
 *
 * 写成三份的代价具体而不抽象：只要有一端忘了在 `discard()` 之后重读 status，那一端的用户
 * 就会在丢弃之后仍看到「3 条未提交变更」，而另外两端是对的——这种分歧只在用户那里暴露。
 *
 * 本文件**不持有状态**：它把每一次相位变化交给调用方给的 {@link WorkingTreeStatePatch}，
 * 由框架决定那一格写进 signal、`useState` 还是 `shallowRef`。
 */

import type { RxDB } from '@aiao/rxdb';
// 只为把 `RxDB.versionManager` 那条 `declare module` 拉进本文件的程序里：形状声明在
// `@aiao/rxdb-plugin-history` 的 `plugin.ts`，靠「本包别处正好 import 过它」间接生效的话，
// 那个别处哪天不 import 了，这里就会退化成 `any` 上的属性访问而没有任何一条用例会红。
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import type { CommitCapabilityInfo } from '../commit/commit-capability.js';
import type { CommitLogOptions, CommitLogPage } from '../commit/commit-log.js';
import {
  isCommitLogPageEmpty,
  isWorkingTreeDiffEmpty,
  isWorkingTreeRestoreSessionEmpty,
  isWorkingTreeStatusEmpty,
  trackWorkingTreeCommand,
  trackWorkingTreeQuery,
  type WorkingTreeAsyncStates
} from './async-state.js';
import type { CommitOptions, CommitResult } from './commit-command.js';
import type { WorkingTreeDiff, WorkingTreeDiffOptions } from './diff.js';
import type { WorkingTreeDiscardOptions, WorkingTreeDiscardResult } from './discard-command.js';
import type {
  WorkingTreeRestoreOptions,
  WorkingTreeRestoreResult,
  WorkingTreeRestoreSessionInfo,
  WorkingTreeRestoreTarget
} from './restore-command.js';
import type { WorkingTreeStatus } from './status.js';
import type { WorkingTreeSwitchBranchOptions } from './switch-branch-options.js';
import type { WorkingTreeManager } from './working-tree-facade.js';

/**
 * 往某一格状态里写一个新相位。
 *
 * @remarks
 * 按 key 分格而不是整份替换：`commit()` 进行中不该让 `statusState` 也变成 `loading`，
 * 而整份替换要么做到这一点，要么逼每个框架自己拼一次「保留其余六格」的展开。
 */
export type WorkingTreeStatePatch = <K extends keyof WorkingTreeAsyncStates>(
  key: K,
  state: WorkingTreeAsyncStates[K]
) => void;

/**
 * 三端入口对外暴露的十个命令；签名与 {@link WorkingTreeManager}
 * （以及 `switchBranch` 那一个 {@link VersionManager}）上的同名方法一致。
 *
 * @remarks
 * **签名不做框架化改写**：入参与返回值用的都是核心那一份类型（§1「共享同一份核心类型，
 * 不各自重定义」）。`commit()` 在这里同样是「两个位置参数、CAS 落败走返回值」，
 * 没有为了「好用」而省掉三个捕获位的重载——省掉它就等于让入口内部自己读一次 revision，
 * 而内部读到的恒等于当前值，CAS 永远命中（FR-031 当场失效）。
 *
 * @public
 */
export interface WorkingTreeCommands {
  /** 这个库启没启用提交能力；`boolean` 没有空形态，因此走命令状态 */
  readonly isEnabled: () => Promise<boolean>;
  /** 启用提交能力；成功后顺带重读一次 status */
  readonly enable: () => Promise<CommitCapabilityInfo>;
  /** 当前分支的工作树摘要；干净工作树是 `empty` 相位 */
  readonly status: () => Promise<WorkingTreeStatus>;
  /** 当前分支相对 HEAD 的未提交改动；零条目是 `empty` 相位 */
  readonly diff: (options?: WorkingTreeDiffOptions) => Promise<WorkingTreeDiff>;
  /** 当前分支的可达提交历史；空历史是 `empty` 相位 */
  readonly listCommits: (options?: CommitLogOptions) => Promise<CommitLogPage>;
  /** 提交工作树里的全部未提交单元；**没有「空成功」**，零变更时原样抛 `empty_commit` */
  readonly commit: (message: string, options: CommitOptions) => Promise<CommitResult>;
  /** 把工作树整体退回 HEAD；`discardedCount: 0` 是 no-op，不是 empty */
  readonly discard: (options: WorkingTreeDiscardOptions) => Promise<WorkingTreeDiscardResult>;
  /** 把一个可达历史 commit 的内容写回工作树；四个被拒成因走返回值，不是异常 */
  readonly restore: (
    target: WorkingTreeRestoreTarget,
    options: WorkingTreeRestoreOptions
  ) => Promise<WorkingTreeRestoreResult>;
  /** 当前分支那个未结束的恢复会话；没有就是 `null`，落在 `empty` 相位 */
  readonly restoreSession: () => Promise<WorkingTreeRestoreSessionInfo | null>;
  /** 切到另一条分支；成功后顺带重读一次 status。被 `requireClean` 拒掉时**抛** `WorkingTreeDirtyError` */
  readonly switchBranch: (branchId: string, options?: WorkingTreeSwitchBranchOptions) => Promise<void>;
}

/**
 * 把十个命令接到状态格子上。
 *
 * @param database - 宿主库；命令取的是它的 `workingTree` 与 `versionManager` 两个入口
 * @param patch - 每一次相位变化的落点；见 {@link WorkingTreeStatePatch}
 * @returns 见 {@link WorkingTreeCommands}
 *
 * @remarks
 * **命令把错误原样继续抛**（§1「抛同一组错误码」）。只记进状态、不抛，会让
 * `await entry.commit(msg, opts)` 在提交失败时静静地往下走——调用方拿到的是一个已经
 * resolve 的 promise，而工作树一个字节都没动。状态与异常在这里不是二选一：状态供模板
 * 直接绑，异常供调用方的控制流用。
 *
 * **`CommitConflict` 不翻译成异常**：`ok: false` 是一次成功调用的**结果**，§4 说它是
 * 「可重试的返回值，不是崩溃」。它落在 `success` 相位，界面读 `result.ok` 决定要不要
 * 提示重试。`restore()` 的四个被拒成因同理：脏工作树与不兼容要用户去处理，不可达是问错了
 * 节点，冲突要重来一次——四者都不是崩溃。
 *
 * **`restore()` 之后不顺手重读会话。** 它重读 status（工作树刚从 clean 变脏），但不发第二轮
 * `restoreSession()`：刚建的那个 `sessionId` 已经在返回值里，而「这个会话还成不成立」的唯一
 * 出口是 `status()` 的 `restoring` / `conflicted` 两位——那份摘要上一行已经重读过了。
 * 同理，`commit()` / `discard()` 也不重读会话，尽管两者都会结束它：三处各加一轮查询，换来的
 * 是一份没有任何判定依赖它的补充信息。
 *
 * **收整个库而不是只收 `workingTree`。** 清单第十项 `switchBranch` 挂在 `versionManager` 上
 * （contracts/core-api.md §6 把它钉在那里，判定才走系统贡献口子回到本插件）；只收工作树入口
 * 的话，这一项只能由三端各自去取 `versionManager` 再各自接一遍状态——而「切完要不要重读
 * status」这类判定正是本文件存在的理由，三份实现迟早有一份忘了重读。
 *
 * @public
 */
export const createWorkingTreeCommands = (database: RxDB, patch: WorkingTreeStatePatch): WorkingTreeCommands => {
  const workingTree: WorkingTreeManager = database.workingTree;
  // 现取而不是构造时存一份：`versionManager` 由历史插件在**连接纪元内**用
  // `defineProperty` 装上、释放时删掉（见 `rxdb-plugin-history/src/plugin.ts`），
  // 构造那一刻取一次等于把入口钉死在第一个纪元上。
  const versionManager = (): VersionManager => database.versionManager;
  const runStatus = (): Promise<WorkingTreeStatus> =>
    trackWorkingTreeQuery(
      state => patch('statusState', state),
      isWorkingTreeStatusEmpty,
      () => workingTree.status()
    );

  /**
   * 一次改动之后把 status 重读一遍。
   *
   * 工作树没有变更流：没有任何东西会在 `commit()` 落地之后主动推一份新的 status 过来
   * （核心侧至今没有这条流，不是这里偷懒）。不重读的话，用户刚提交完，面板上仍写着
   * 「3 条未提交变更」。
   *
   * 重读失败被**吞掉**，因为它已经落进 `statusState` 的 `error` 相位了——再抛一次会把
   * 一次成功的提交在调用方那里变成失败，而提交确实成功了。
   */
  const refreshStatus = (): Promise<void> =>
    runStatus().then(
      () => undefined,
      () => undefined
    );

  return {
    isEnabled: () =>
      trackWorkingTreeCommand(
        state => patch('isEnabledState', state),
        () => workingTree.isEnabled()
      ),

    enable: async () => {
      const info = await trackWorkingTreeCommand(
        state => patch('enableState', state),
        () => workingTree.enable()
      );
      await refreshStatus();
      return info;
    },

    status: runStatus,

    diff: options =>
      trackWorkingTreeQuery(
        state => patch('diffState', state),
        isWorkingTreeDiffEmpty,
        () => workingTree.diff(options)
      ),

    listCommits: options =>
      trackWorkingTreeQuery(
        state => patch('listCommitsState', state),
        isCommitLogPageEmpty,
        () => workingTree.listCommits(options)
      ),

    commit: async (message, options) => {
      // 抛出来的（`empty_commit` 之类）直接往上走，status 保持原样——什么都没提交，
      // 也就没有什么可重读的。走到下一行只可能是 `ok: true` 或 `ok: false` 的返回值，
      // 而两者都意味着别人或自己动过工作树。
      const result = await trackWorkingTreeCommand(
        state => patch('commitState', state),
        () => workingTree.commit(message, options)
      );
      await refreshStatus();
      return result;
    },

    discard: async options => {
      const result = await trackWorkingTreeCommand(
        state => patch('discardState', state),
        () => workingTree.discard(options)
      );
      await refreshStatus();
      return result;
    },

    restore: async (target, options) => {
      // 与 commit 同形：抛出来的（能力未启用、提交图损坏）意味着一个字节都没写进工作树，
      // 直接往上走，status 保持原样。走到下一行则无论 ok 与否都要重读——`ok: true` 是工作树
      // 刚多了一整个 commit 的条目，`ok: false` 的每一种成因都在说面板上那份摘要已经过期：
      // `dirty_working_tree` 是它显示的「没有未提交改动」不成立，`conflict` 是三个捕获位已经旧了。
      const result = await trackWorkingTreeCommand(
        state => patch('restoreState', state),
        () => workingTree.restore(target, options)
      );
      await refreshStatus();
      return result;
    },

    restoreSession: () =>
      trackWorkingTreeQuery(
        state => patch('restoreSessionState', state),
        isWorkingTreeRestoreSessionEmpty,
        () => workingTree.restoreSession()
      ),

    switchBranch: async (branchId, options) => {
      // 被拒（`requireClean` 撞上脏工作树、`expectedActivationRevision` 过期）与出错在这里是
      // 同一件事：两者都**抛**，与 `commit()` 的 CAS 落败不同——那一个是「调用成功、结果是
      // 冲突」，而这一个连切换都没发生。翻成返回值会让调用方以为自己已经在新分支上了。
      await trackWorkingTreeCommand(
        state => patch('switchBranchState', state),
        () => versionManager().switchBranch(branchId, options)
      );
      // 切过去之后那份摘要属于**另一条**分支：`branchId`、`entryCount`、三个 revision 全换了人。
      // 不重读的话面板上留着的是上一条分支的未提交计数，而用户正要按着它决定提不提交。
      await refreshStatus();
    }
  };
};
