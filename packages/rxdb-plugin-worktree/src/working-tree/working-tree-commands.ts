/**
 * @fileoverview 三端入口共用的**命令实现**：把 {@link WorktreeManager} 的十五个方法与
 * `versionManager.switchBranch()` 接到 {@link WorktreeAsyncStates} 上
 * （US-306 阶段 C、T110、T123 与 US-310，contracts/tri-framework-api.md §1/§4）。
 *
 * @remarks
 * 只有容器形态该由框架决定——Angular 是 `Signal`、React 是渲染快照、Vue 是 `ComputedRef`。
 * 「哪一步发 loading」「哪些结果算 empty」「一次成功的提交之后要不要重读 status」这三件事
 * 不是形态问题，是**语义**问题，而 §1 对语义的要求是三端共用同一份，不各自重定义。
 *
 * 写成三份的代价具体而不抽象：只要有一端忘了在 `discard()` 之后重读 status，那一端的用户
 * 就会在丢弃之后仍看到「3 条未提交变更」，而另外两端是对的——这种分歧只在用户那里暴露。
 *
 * 本文件**不持有状态**：它把每一次相位变化交给调用方给的 {@link WorktreeStatePatch}，
 * 由框架决定那一格写进 signal、`useState` 还是 `shallowRef`。
 */

import {
  CAPABILITY_ENABLED_EVENT,
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  getEntityMetadata,
  RxDBBranch,
  RxDBError,
  type CapabilityEnabledEvent,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent,
  type EntityLocalUpdatedEvent,
  type RxDB
} from '@aiao/rxdb';
// 只为把 `RxDB.versionManager` 那条 `declare module` 拉进本文件的程序里：形状声明在
// `@aiao/rxdb-plugin-history` 的 `plugin.ts`，靠「本包别处正好 import 过它」间接生效的话，
// 那个别处哪天不 import 了，这里就会退化成 `any` 上的属性访问而没有任何一条用例会红。
import type { VersionManager } from '@aiao/rxdb-plugin-history';
import { WORKING_TREE_CAPABILITY } from '../capability-identity.js';
import type { CommitCapabilityInfo } from '../commit/commit-capability.js';
import { isCommitChangeSetPageEmpty, type CommitChangeSetPage } from '../commit/commit-changes.js';
import type { CommitLogOptions, CommitLogPage } from '../commit/commit-log.js';
import type { WorktreeInfo } from '../worktree/worktree-command.js';
import { Worktree } from '../worktree/worktree.entity.js';
import {
  isCommitLogPageEmpty,
  isWorktreeDiffEmpty,
  isWorktreeListEmpty,
  isWorktreeRestoreSessionEmpty,
  isWorktreeStatusEmpty,
  trackWorktreeCommand,
  trackWorktreeQuery,
  type WorktreeAsyncStates,
  type WorktreeStateSink
} from './async-state.js';
import type { CommitOptions, CommitResult } from './commit-command.js';
import type { WorktreeDiff, WorktreeDiffOptions } from './diff.js';
import type { WorktreeDiscardOptions, WorktreeDiscardResult } from './discard-command.js';
import { requireVersionManager } from './require-version-manager.js';
import type {
  WorktreeRestoreOptions,
  WorktreeRestoreResult,
  WorktreeRestoreSessionInfo,
  WorktreeRestoreTarget
} from './restore-command.js';
import type { WorktreeStatus } from './status.js';
import type { WorktreeSwitchBranchOptions } from './switch-branch-options.js';
import type { WorktreeEnableIfEmptyResult, WorktreeManager } from './working-tree-facade.js';

/**
 * 往某一格状态里写一个新相位。
 *
 * @remarks
 * 按 key 分格而不是整份替换：`commit()` 进行中不该让 `statusState` 也变成 `loading`，
 * 而整份替换要么做到这一点，要么逼每个框架自己拼一次「保留其余各格」的展开。
 */
export type WorktreeStatePatch = <K extends keyof WorktreeAsyncStates>(key: K, state: WorktreeAsyncStates[K]) => void;

/**
 * 三端入口对外暴露的十六个命令；签名与 {@link WorktreeManager}
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
export interface WorktreeCommands {
  /** 这个库启没启用提交能力；`boolean` 没有空形态，因此走命令状态 */
  readonly isEnabled: () => Promise<boolean>;
  /** 启用提交能力；成功后顺带重读一次 status，读过 worktree 列表的话也重读列表 */
  readonly enable: () => Promise<CommitCapabilityInfo>;
  /** 库为空时自动启用、有内容时跳过；三种结局后都顺带重读一次 status，读过 worktree 列表的话也重读列表 */
  readonly enableIfEmpty: () => Promise<WorktreeEnableIfEmptyResult>;
  /** 当前分支的工作树摘要；干净工作树是 `empty` 相位 */
  readonly status: () => Promise<WorktreeStatus>;
  /** 当前分支相对 HEAD 的未提交改动；零条目是 `empty` 相位 */
  readonly diff: (options?: WorktreeDiffOptions) => Promise<WorktreeDiff>;
  /** 当前分支的可达提交历史；空历史是 `empty` 相位 */
  readonly listCommits: (options?: CommitLogOptions) => Promise<CommitLogPage>;
  /** 一个 commit 的全部变更单元；基线节点的零单元是 `empty` 相位 */
  readonly commitChanges: (commitId: string) => Promise<CommitChangeSetPage>;
  /** 提交工作树里的全部未提交单元；**没有「空成功」**，零变更时原样抛 `empty_commit` */
  readonly commit: (message: string, options: CommitOptions) => Promise<CommitResult>;
  /** 把工作树整体退回 HEAD；`discardedCount: 0` 是 no-op，不是 empty */
  readonly discard: (options: WorktreeDiscardOptions) => Promise<WorktreeDiscardResult>;
  /** 把一个可达历史 commit 的内容写回工作树；四个被拒成因走返回值，不是异常 */
  readonly restore: (target: WorktreeRestoreTarget, options: WorktreeRestoreOptions) => Promise<WorktreeRestoreResult>;
  /** 当前分支那个未结束的恢复会话；没有就是 `null`，落在 `empty` 相位 */
  readonly restoreSession: () => Promise<WorktreeRestoreSessionInfo | null>;
  /** 切到另一条分支；成功后顺带重读一次 status。被 `requireClean` 拒掉时**抛** `WorktreeDirtyError` */
  readonly switchBranch: (branchId: string, options?: WorktreeSwitchBranchOptions) => Promise<void>;
  /**
   * 全部命名 worktree；零行是 `empty` 相位。第一次读过之后，列表跟随 worktree 行与 active 分支的变更
   * 自动重读（另一个标签页、devtools、分支菜单的切换与删除都算），直到 {@link disposeWorktreeCommands}
   */
  readonly listWorktrees: () => Promise<readonly WorktreeInfo[]>;
  /** 钉住一条分支并切过去；成功后重读 status，无论成败都重读 worktree 列表（切换阶段失败时行已落库） */
  readonly createWorktree: (branchId: string, label?: string) => Promise<WorktreeInfo>;
  /** 切到一个 worktree；成功后重读 status，无论成败都重读 worktree 列表（被拒多半是列表已过期） */
  readonly switchWorktree: (id: string, options?: WorktreeSwitchBranchOptions) => Promise<void>;
  /** 移除一个 worktree（只删那一行）；无论成败都重读 worktree 列表，status 不动 */
  readonly removeWorktree: (id: string) => Promise<void>;
}

/**
 * 一格一个的请求代次；只有最新那一次请求能往自己那一格写终态。
 *
 * @param patch - 调用方给的落点
 * @returns 取数器；在**发起**一次请求时调用，拿到那一次专属的相位落点
 *
 * @remarks
 * 同一格上的请求会并发：筛选器一改就重发一次 `diff()`，用户连点两下就重发两次
 * `status()`，而先发的那一次没有任何东西会取消它。哪一次先回来由后端与网络决定，
 * 于是「最后写进状态的」与「用户现在问的」是两回事——先发后到的结果会盖掉更晚的那份，
 * 而屏幕上没有任何迹象说明这一格已经旧了。
 *
 * 代次在**发起**时领（即本函数在实参位置求值的那一刻，恰在 `loading` 之前），
 * 而不是在结果回来时比对时间戳：时间戳只能告诉你两次谁更晚开始，领号能告诉你
 * 「我这一次还是不是最新的那一次」——后者才是判据。
 *
 * **按 key 分格**，不是一个全局计数器：一次 `diff()` 不该把正在飞的 `status()` 判成过期。
 *
 * 过期请求只是**不写状态**，异常照旧抛给它自己的调用方（§1：状态与异常不是二选一）。
 * 也不取消底层调用——`WorktreeManager` 上的每一个方法都是一整个事务，中途撤回
 * 会把「已经写了一半」变成一种新的、没人定义过的结果。
 */
const createLatestOnlyPatch = (
  patch: WorktreeStatePatch
): (<K extends keyof WorktreeAsyncStates>(key: K) => WorktreeStateSink<WorktreeAsyncStates[K]>) => {
  const generations = new Map<keyof WorktreeAsyncStates, number>();
  return <K extends keyof WorktreeAsyncStates>(key: K) => {
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    return (state: WorktreeAsyncStates[K]) => {
      if (generations.get(key) !== generation) return;
      patch(key, state);
    };
  };
};

/** worktree 列表跟随的事件：三类实体事件，加上能力启用通知。 */
type WorktreeListSourceEvent =
  EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent | CapabilityEnabledEvent;

/**
 * 这次事件会不会改变 worktree 列表。
 *
 * @remarks
 * 列表由两张表决定：`rxdb_worktree` 的行，以及 `active` 现算所依据的 `rxdb_branch.activated`。
 * 只认这两个实体——业务实体每写一次都触发一轮 `listWorktrees()` 是白读。`rxdb_branch` 的事件来自
 * 适配器的变更钩子，`rxdb_worktree` 的由本插件写行时自己补发（`worktree/worktree-events.ts`）。
 *
 * 本能力的启用通知也算：别的标签页启用之前，这里读到的是「能力未启用」的错误；启用不一定伴随任何
 * worktree 事件（新库建库时就钉好了主 worktree）。按 `type` 判别而不是 `instanceof`：别的标签页转发来的
 * 事件经过结构化克隆，已经不是本进程那个类的实例。
 */
const touchesWorktreeList = (event: WorktreeListSourceEvent): boolean => {
  if (event.type === CAPABILITY_ENABLED_EVENT) return event.capability === WORKING_TREE_CAPABILITY;
  const sources = [getEntityMetadata(RxDBBranch), getEntityMetadata(Worktree)];
  return event.entities.some(data =>
    sources.some(source => source.namespace === data.namespace && source.name === data.entity)
  );
};

/**
 * 命令对象 → 停止跟随的函数。
 *
 * @remarks
 * 不挂在命令对象上：三端绑定把命令 `...commands` 展开进公开资源，挂上去就成了第十七个「命令」。
 */
const stopFollowingOf = new WeakMap<WorktreeCommands, () => void>();

/**
 * 停止跟随 worktree 列表；三端绑定在组件 / 作用域销毁时调用。
 *
 * @param commands - {@link createWorktreeCommands} 建出来的那一份
 * @throws {@link RxDBError} 传入的不是 {@link createWorktreeCommands} 建出来的命令时
 *
 * @remarks
 * 停的只是事件监听：在途的读照常落地（只写自己那一格，latest-only 照旧）。停止之后再读一次列表会
 * 重新开始跟随——React StrictMode 会先卸载、再重挂同一份命令，重挂时页面那一次首读把跟随接回来。
 *
 * @public
 */
export const disposeWorktreeCommands = (commands: WorktreeCommands): void => {
  const stopFollowing = stopFollowingOf.get(commands);
  if (!stopFollowing) throw new RxDBError('传入的命令不是 createWorktreeCommands() 建的，没有可停的跟随。');
  stopFollowing();
};

/**
 * 取库上的工作树入口，没挂上就抛。
 *
 * @param database - 宿主库
 * @returns 已挂载的工作树入口
 * @throws {@link RxDBError} 库上没有 `worktree` 入口时抛出
 *
 * @remarks
 * 类型这一层拦不住：`plugin.ts` 的 `declare module` 故意把 `worktree` 声明成**非可选**，
 * 而模块增强是**全局**的——程序里任何一个包 import 过本插件，整个程序里的 `RxDB.worktree`
 * 就都成了非可选，包括那些从没 `use(rxDBPluginWorktree)` 过的库；而入口真正挂上是在插件
 * **构造器**里（`plugin.ts` 的 `defineProperty`）。两件事错位的那段缝里，编译期一声不吭，
 * 运行时给出 `undefined`。
 *
 * **在建入口这一步抛，而不是留给第一次 `status()`**：晚抛的那一版，异常从命令层内部冒出来，
 * 堆栈顶端写着「读 status 失败」，而成因在更早的接线那一步，读的人要一路回溯。三端 hook 的
 * TSDoc 对这件事的承诺也是「数据库取不到时**抛错而不是**返回一份『一切干净』的默认值」——
 * 把「入口没接上」伪装成「没有未提交变更」，恰好是最需要出声的时候不出声。
 *
 * 与 `versionManager` 的「现取」形态不同步是有意的：那一个由历史插件在**连接纪元内**装卸，
 * 这一个从 `use()` 那一刻起就不再变（见 {@link WorktreeManager} 的类注释），取一次即可。
 */
const assertWorkingTreeEntry = (database: RxDB): WorktreeManager => {
  // 显式写出 `| undefined`：`declare module` 给的静态类型是非可选的，不放宽的话下面这句
  // 守卫会被 lint 判成恒真而删掉——把唯一拦得住它的那道检查删在「类型说它不可能」的理由上。
  const worktree: WorktreeManager | undefined = database.worktree;
  if (!worktree) {
    throw new RxDBError(
      '这个数据库上没有 worktree 入口：它由 use(rxDBPluginWorktree) 在插件构造时挂上。' +
        '先装插件，再建工作树命令入口。'
    );
  }
  return worktree;
};

/**
 * 把十六个命令接到状态格子上。
 *
 * @param database - 宿主库；命令取的是它的 `worktree` 与 `versionManager` 两个入口
 * @param patch - 每一次相位变化的落点；见 {@link WorktreeStatePatch}
 * @returns 见 {@link WorktreeCommands}
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
 * **收整个库而不是只收 `worktree`。** 清单里的 `switchBranch` 挂在 `versionManager` 上
 * （contracts/core-api.md §6 把它钉在那里，判定才走系统贡献口子回到本插件）；只收工作树入口
 * 的话，这一项只能由三端各自去取 `versionManager` 再各自接一遍状态——而「切完要不要重读
 * status」这类判定正是本文件存在的理由，三份实现迟早有一份忘了重读。
 *
 * @public
 */
export const createWorktreeCommands = (database: RxDB, patch: WorktreeStatePatch): WorktreeCommands => {
  const worktree = assertWorkingTreeEntry(database);
  // 现取而不是构造时存一份：`versionManager` 由历史插件在**连接纪元内**用
  // `defineProperty` 装上、释放时删掉（见 `rxdb-plugin-history/src/plugin.ts`），
  // 构造那一刻取一次等于把入口钉死在第一个纪元上。没装历史插件时抛明确的错，不让它炸成裸 TypeError。
  const versionManager = (): VersionManager => requireVersionManager(database);
  const sinkFor = createLatestOnlyPatch(patch);
  const runStatus = (): Promise<WorktreeStatus> =>
    trackWorktreeQuery(sinkFor('statusState'), isWorktreeStatusEmpty, () => worktree.status());

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
  const queryWorktrees = (): Promise<readonly WorktreeInfo[]> =>
    trackWorktreeQuery(sinkFor('listWorktreesState'), isWorktreeListEmpty, () => worktree.listWorktrees());
  // 吞错口径同 {@link refreshStatus}：重读失败已经落进 `listWorktreesState` 的 `error` 相位。
  const requeryWorktrees = (): Promise<void> =>
    queryWorktrees().then(
      () => undefined,
      () => undefined
    );

  // 实时列表：第一次读列表之后才开始跟随，创建入口本身一次 IO、一个监听都不发（`idle` 契约）。
  // 从不显示 worktree 列表的应用于是一轮重读都不付——它从没读过列表。
  let following = false;
  let requeryScheduled = false;
  const onWorktreeListSource = (event: WorktreeListSourceEvent): void => {
    if (requeryScheduled || !touchesWorktreeList(event)) return;
    requeryScheduled = true;
    // 一笔事务提交时一起放行的那串事件，合并成一次重读。
    queueMicrotask(() => {
      requeryScheduled = false;
      if (following) void requeryWorktrees();
    });
  };
  const followWorktrees = (): void => {
    if (following) return;
    following = true;
    database.addEventListener(ENTITY_LOCAL_CREATE_EVENT, onWorktreeListSource);
    database.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, onWorktreeListSource);
    database.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, onWorktreeListSource);
    database.addEventListener(CAPABILITY_ENABLED_EVENT, onWorktreeListSource);
  };
  const stopFollowing = (): void => {
    if (!following) return;
    following = false;
    database.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, onWorktreeListSource);
    database.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, onWorktreeListSource);
    database.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, onWorktreeListSource);
    database.removeEventListener(CAPABILITY_ENABLED_EVENT, onWorktreeListSource);
  };
  const runWorktrees = (): Promise<readonly WorktreeInfo[]> => {
    followWorktrees();
    return queryWorktrees();
  };

  /**
   * 一次 worktree 命令之后把列表重读一遍，并从此开始跟随。
   *
   * 命令自己重读而不全等跟随：自家命令的结果要在命令的 promise 兑现之前就落进列表，调用方
   * `await createWorktree()` 之后读到的必须已经是新列表。`switchBranch()` 不调它——那条路上列表的变化
   * （active 勾选挪位）由跟随接住，从没读过列表的应用也就不为它白发一轮查询。
   */
  const refreshWorktrees = (): Promise<void> => {
    followWorktrees();
    return requeryWorktrees();
  };

  const commands: WorktreeCommands = {
    isEnabled: () => trackWorktreeCommand(sinkFor('isEnabledState'), () => worktree.isEnabled()),

    enable: async () => {
      const info = await trackWorktreeCommand(sinkFor('enableState'), () => worktree.enable());
      await refreshStatus();
      // 启用之前读过列表的话，那一次落的是「能力未启用」的 error，而启用不一定伴随任何 worktree 事件；
      // 没读过列表就不读——从不显示列表的应用不为它付一轮查询。
      if (following) await requeryWorktrees();
      return info;
    },

    enableIfEmpty: async () => {
      const result = await trackWorktreeCommand(sinkFor('enableIfEmptyState'), () => worktree.enableIfEmpty());
      await refreshStatus();
      // 理由同 `enable()`。
      if (following) await requeryWorktrees();
      return result;
    },

    status: runStatus,

    diff: options => trackWorktreeQuery(sinkFor('diffState'), isWorktreeDiffEmpty, () => worktree.diff(options)),

    listCommits: options =>
      trackWorktreeQuery(sinkFor('listCommitsState'), isCommitLogPageEmpty, () => worktree.listCommits(options)),

    commitChanges: commitId =>
      trackWorktreeQuery(sinkFor('commitChangesState'), isCommitChangeSetPageEmpty, () =>
        worktree.commitChanges(commitId)
      ),

    commit: async (message, options) => {
      // 抛出来的（`empty_commit` 之类）直接往上走，status 保持原样——什么都没提交，
      // 也就没有什么可重读的。走到下一行只可能是 `ok: true` 或 `ok: false` 的返回值，
      // 而两者都意味着别人或自己动过工作树。
      const result = await trackWorktreeCommand(sinkFor('commitState'), () => worktree.commit(message, options));
      await refreshStatus();
      return result;
    },

    discard: async options => {
      const result = await trackWorktreeCommand(sinkFor('discardState'), () => worktree.discard(options));
      await refreshStatus();
      return result;
    },

    restore: async (target, options) => {
      // 与 commit 同形：抛出来的（能力未启用、提交图损坏）意味着一个字节都没写进工作树，
      // 直接往上走，status 保持原样。走到下一行则无论 ok 与否都要重读——`ok: true` 是工作树
      // 刚多了一整个 commit 的条目，`ok: false` 的每一种成因都在说面板上那份摘要已经过期：
      // `dirty_working_tree` 是它显示的「没有未提交改动」不成立，`conflict` 是三个捕获位已经旧了。
      const result = await trackWorktreeCommand(sinkFor('restoreState'), () => worktree.restore(target, options));
      await refreshStatus();
      return result;
    },

    restoreSession: () =>
      trackWorktreeQuery(sinkFor('restoreSessionState'), isWorktreeRestoreSessionEmpty, () =>
        worktree.restoreSession()
      ),

    switchBranch: async (branchId, options) => {
      // 被拒（`requireClean` 撞上脏工作树、`expectedActivationRevision` 过期）与出错在这里是
      // 同一件事：两者都**抛**，与 `commit()` 的 CAS 落败不同——那一个是「调用成功、结果是
      // 冲突」，而这一个连切换都没发生。翻成返回值会让调用方以为自己已经在新分支上了。
      await trackWorktreeCommand(sinkFor('switchBranchState'), () => versionManager().switchBranch(branchId, options));
      // 切过去之后那份摘要属于**另一条**分支：`branchId`、`entryCount`、三个 revision 全换了人。
      // 不重读的话面板上留着的是上一条分支的未提交计数，而用户正要按着它决定提不提交。
      await refreshStatus();
    },

    listWorktrees: runWorktrees,

    createWorktree: async (branchId, label) => {
      // 列表无论成败都重读：`createWorktree()` 是两阶段的，切换阶段失败时行已经落了库（见它的 TSDoc）；
      // 第一阶段就被拒（已钉住、分支不存在）多半意味着手上的列表已经过期。
      // status 只在成功后重读：失败时要么一行没写，要么切换整笔回滚，当前分支的摘要都没变。
      try {
        const created = await trackWorktreeCommand(sinkFor('createWorktreeState'), () =>
          worktree.createWorktree(branchId, label)
        );
        await refreshStatus();
        return created;
      } finally {
        await refreshWorktrees();
      }
    },

    switchWorktree: async (id, options) => {
      // 被拒（`WorktreeNotFoundError` 等）多半意味着列表已经过期——它在别处被删了、或别处换了 checkout，
      // 所以列表无论成败都重读；status 只在真的切过去之后重读（摘要换了分支，同 `switchBranch()`）。
      try {
        await trackWorktreeCommand(sinkFor('switchWorktreeState'), () => worktree.switchWorktree(id, options));
        await refreshStatus();
      } finally {
        await refreshWorktrees();
      }
    },

    removeWorktree: async id => {
      // 只删 worktree 那一行：当前分支、它的未提交改动都没动，status 不必重读。
      // 被拒（不存在、恰是当前所在）同样多半是列表过期，列表照样重读。
      try {
        await trackWorktreeCommand(sinkFor('removeWorktreeState'), () => worktree.removeWorktree(id));
      } finally {
        await refreshWorktrees();
      }
    }
  };
  stopFollowingOf.set(commands, stopFollowing);
  return commands;
};
