/**
 * @fileoverview restore 的兼容性预检：先选定重放路径，再逐节点校验（FR-033、FR-050）
 *
 * @remarks
 * 本文件**只读**。它回答的是一个问题：「把工作树恢复到 X，这条路上每一个会被读取并应用的
 * ChangeSet，本客户端是不是都认得？」——在任何持久写入发生之前。
 *
 * ## 为什么必须有这一道，而不能让 codec 自己报错
 *
 * `working-tree-patch-codec.ts` 的两个方向是**不对称**的：`encodeWorkingTreePatch()` 解析不到
 * 目标实体时抛 {@link UnknownWorkingTreePatchEntityError}，而 `decodeWorkingTreePatch()`
 * 解析不到时**原样返回**。restore 走的恰好是后者。于是没有预检时，一个引用了本客户端已经
 * 不认识的实体的历史 commit 会静默地被物化成工作树条目，`status()` 照常把它算进 dirty，
 * `commit()` 照常把它写进新的 ChangeSet——整条链上没有任何一步报错。
 *
 * 那个不对称本身不是缺陷：decode 的入参来自数据库，原样返回是读端对脏数据的容错。要堵的是
 * **restore 这一条路径**，堵法是先检查、后写入。
 *
 * ## 三件这里刻意不做的事
 *
 * 1. **不只检查目标节点。** 被读取并应用的是 HEAD 到目标之间**每一个**节点的 inverse patch；
 *    中间任何一个引用了不认识的实体，物化结果就已经错了，而目标节点自己可以干干净净。
 * 2. **不边写边检查。** FR-033 的措辞是「拒绝时所有持久状态 MUST 零变化」，而「写了再回滚」
 *    在 revision 与自增序列上留下的痕迹与从未写过不同。
 * 3. **不解码。** 判据只需要「`namespace.entity` 在本进程解析得到吗」，解码要等到真的物化
 *    时才做；提前解一遍既慢，又会把 FR-050 那句「检查期间不得解码后续 ChangeSet」变成空话。
 */

import type { EntityMetadata, TransactionExecutor } from '@aiao/rxdb';
import { RXDB_CHANGE_CODEC_VERSION, RxDBError } from '@aiao/rxdb';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { loadCommitsByIds, readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken } from './capture-runtime.js';
import type { WorkingTreePatchCodecContext } from './working-tree-patch-codec.js';

/**
 * 恢复目标：要把工作树恢复到哪一个 commit、其中的哪些单元。
 *
 * @remarks
 * 收成一个对象而不是裸 `commitId: string`：`restore()` 的入参迟早要长出「恢复到某个时间点」
 * 之类的第二种寻址方式，而那时把 `string` 改成联合会牵动每一个调用点。
 *
 * `entities` 与硬裁决 1 不冲突，方向恰好相反：硬裁决 1 禁的是 **`commit()` / `discard()`
 * 挑一部分未提交变更**——工作树里躺着什么，就整棵一起落盘或整棵一起丢。这里挑的是
 * **要往工作树里写什么**，写完之后它们和手写变更一样是整棵工作树的一部分，下一次
 * `commit()` 照样全量提交（FR-015 末句）。
 */
export interface WorkingTreeRestoreTarget {
  /** 目标 commit 的 id；必须在当前分支 HEAD 的可达父链上（FR-033） */
  readonly commitId: string;

  /**
   * 只恢复目标 commit 里点名的这些单元；缺省 = 整个 commit 的全部单元
   *
   * @remarks
   * 三段全给而不是只给 `entityId`：同一个 id 在两个 namespace 下是两行，
   * 只按 id 过滤会把另一张表里恰好同 id 的那一行也带进来。
   */
  readonly entities?: readonly WorkingTreeRestoreEntityRef[];
}

/**
 * 一行的三段身份：命名空间、实体名、实体主键。
 *
 * @remarks
 * 具名而不是就地写个匿名对象：它是 {@link WorkingTreeRestoreTarget.entities} 的元素类型，
 * 而调用方要构造这个数组就得能叫出它的名字——只能靠 `WorkingTreeRestoreTarget['entities']`
 * 索引出来的类型，在 IDE 里既没有文档也没法单独 import。
 */
export interface WorkingTreeRestoreEntityRef {
  /** 目标实体所在的命名空间 */
  readonly namespace: string;

  /** 目标实体名 */
  readonly entity: string;

  /** 目标行的主键值 */
  readonly entityId: string;
}

/**
 * 重放方向。
 *
 * @remarks
 * v1 只允许恢复 HEAD 沿父链可达的 commit（FR-033），所以它恒为 `'reverse'`——恢复祖先 =
 * 从 HEAD 往回逐个应用 `inversePatch`。它仍然是诊断里的一个**字段**而不是一句写死的文案：
 * 拿到 {@link RestoreIncompatibility} 的人（日志、上报、用户）据此知道该去翻那个 commit 的
 * `inversePatch` 而不是 `patch`，不需要先知道「v1 只能往回走」这条背景。
 */
export type RestoreReplayDirection = 'reverse';

/**
 * 版本 manifest：用户比对「我这边是多少」的那两个值。
 *
 * @remarks
 * 两项都取自**当前进程**，不从数据里读回来。版本不匹配时，数据里那个值正是不可信的那一个；
 * 把它报出来只会让用户拿两个来源不明的数字互相印证。
 */
export interface RestoreVersionManifest {
  /** 当前客户端的 change codec 版本；等于 `RXDB_CHANGE_CODEC_VERSION` */
  readonly codecVersion: number;

  /** 该 ChangeSet 的目标实体在当前客户端解析得到吗 */
  readonly entityResolved: boolean;
}

/**
 * 首个不兼容节点的稳定描述（FR-050）。
 *
 * @remarks
 * 四样缺一不可：没有 `commitId` 用户不知道查哪个节点；没有 `direction` 不知道该看 `patch`
 * 还是 `inversePatch`；没有 `namespace` / `entity` 不知道是哪张表；没有 `manifest` 不知道
 * 该升客户端还是该降数据。
 *
 * **不带 patch 内容。** 这个对象会进日志与上报，而 patch 里可能躺着加密列的密文（FR-043）。
 */
export interface RestoreIncompatibility {
  /** 重放顺序上**第一个**不兼容的 commit id */
  readonly commitId: string;

  /** 这一步的重放方向，见 {@link RestoreReplayDirection} */
  readonly direction: RestoreReplayDirection;

  /** 该 ChangeSet 的目标实体命名空间 */
  readonly namespace: string;

  /** 该 ChangeSet 的目标实体名 */
  readonly entity: string;

  /** 版本 manifest，见 {@link RestoreVersionManifest} */
  readonly manifest: RestoreVersionManifest;
}

/**
 * 预检结论。
 *
 * @remarks
 * 判别式联合而不是「两个可选字段」：后者拼出来的对象有四种取值，其中「既 ok 又带
 * incompatible」与「既不 ok 又什么都没带」两种没有意义，而调用点的 `if` 只会覆盖其中一种。
 * 判别之后，那两种在编译期就不可表达。
 */
export type RestoreCompatibility =
  | {
      /** 整条路径都兼容 */
      readonly ok: true;
      /** 选定的重放路径，按重放顺序（HEAD 在前），**不含**目标节点自身 */
      readonly path: readonly string[];
    }
  | {
      /** 路径上有节点不兼容 */
      readonly ok: false;
      /** 首个不兼容节点，见 {@link RestoreIncompatibility} */
      readonly incompatible: RestoreIncompatibility;
    };

/**
 * 从某个节点出发、沿**全部**父链可达的 commit id，按逐层回溯的顺序。
 *
 * @param executor - 当前事务执行器
 * @param rootId - 起点；它自己排在第一个
 * @returns 可达节点 id，最新在前
 *
 * @remarks
 * 走全部父链而不只走第一父：合并节点有两个父，只沿第一父走会漏掉整条被合并进来的历史，
 * 于是那条历史上的不兼容节点在预检里看不见，却在物化时被真的应用。
 *
 * `seen` 既去重也断环——提交图理论上无环，但被篡改过的库可以有环，逐父递归会栈溢出。
 * 逐层取而不是逐个取：100 个 commit 的线性历史逐个取就是 100 次往返。
 */
const collectReachableCommitIds = async (executor: TransactionExecutor, rootId: string): Promise<string[]> => {
  const collected: string[] = [];
  const seen = new Set<string>([rootId]);
  let frontier: string[] = [rootId];

  while (frontier.length > 0) {
    const level = await loadCommitsByIds(executor, frontier);
    const next: string[] = [];
    for (const commit of level) {
      collected.push(commit.id);
      for (const parentId of commit.parentIds) {
        if (seen.has(parentId)) continue;
        seen.add(parentId);
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return collected;
};

/**
 * 选定「恢复到目标节点」要回退的那条确定性路径。
 *
 * @param executor - 当前事务执行器
 * @param headCommitId - 当前分支 HEAD；空分支为 `null`
 * @param targetCommitId - 目标 commit id
 * @returns 要逐个应用 `inversePatch` 的节点，按重放顺序（HEAD 在前）；
 *   目标不在 HEAD 的可达父链上时返回 `undefined`
 *
 * @remarks
 * 路径 = **HEAD 可达集减去目标可达集**，而不是「从 HEAD 往回走到目标为止」。两者在线性历史
 * 上一样，在菱形历史上不一样：目标自己的祖先也在 HEAD 的可达集里，从另一条边绕过去就会把
 * 它们一并算进要回退的节点，于是恢复动作把目标**之前**的历史也退掉了。
 *
 * 顺序取 HEAD 侧的逐层回溯序，所以它是确定性的：同一张图每次给出同一条路径，
 * 「首个不兼容节点」才可能稳定（FR-050）。
 *
 * 返回 `undefined` 而不是抛错：「这个 commit 不在当前分支的历史里」是调用方要转成失败出口的
 * 一种**判定结果**（FR-033 只允许恢复可达节点），不是库坏了。
 */
export const selectRestoreReplayPath = async (
  executor: TransactionExecutor,
  headCommitId: string | null,
  targetCommitId: string
): Promise<readonly string[] | undefined> => {
  if (headCommitId === null) return undefined;
  const fromHead = await collectReachableCommitIds(executor, headCommitId);
  if (!fromHead.includes(targetCommitId)) return undefined;
  const kept = new Set(await collectReachableCommitIds(executor, targetCommitId));
  return fromHead.filter(commitId => !kept.has(commitId));
};

/** 一个节点里第一条解析不到目标实体的 ChangeSet；全都解析得到则 `undefined`。 */
const firstUnresolvedChangeSet = (
  rows: readonly CommitChangeSet[],
  resolve: (entity: string, namespace: string) => EntityMetadata | undefined
): CommitChangeSet | undefined => rows.find(row => resolve(row.entity, row.namespace) === undefined);

/**
 * 读一个节点的全部 ChangeSet，按 `sequence` 升序。
 *
 * @remarks
 * 排序在 JS 侧做、不依赖后端默认返回顺序：`sequence` 决定重放次序，而「首个不兼容」里的
 * 「首个」在同一个 commit 内部也要稳定——否则同一张图两次预检可能报出不同的实体名。
 */
const readChangeSetsOf = async (executor: TransactionExecutor, commitId: string): Promise<CommitChangeSet[]> => {
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  return [...rows].sort((left, right) => left.sequence - right.sequence);
};

/**
 * 沿一条**已选定**的路径找首个不兼容节点。
 *
 * @param executor - 当前事务执行器
 * @param codec - 元数据解析上下文；这里只用到 `resolveTargetMetadata`
 * @param path - 重放路径，按重放顺序
 * @returns 首个不兼容节点，全兼容则 `undefined`
 *
 * @remarks
 * 命中即返回，**不继续读后面的节点**——FR-050 那句「检查期间不得解码或写入后续 ChangeSet」
 * 在这里的物理含义就是这个 `return`。
 *
 * 单独导出是给 `restore-command.ts` 用的：它已经为「目标可不可达」调过一次
 * {@link selectRestoreReplayPath}，再走一遍 {@link checkRestoreCompatibility} 会把整条父链
 * 重新遍历一次，而那两次遍历之间没有任何东西能变（同一个事务）。
 */
export const findFirstReplayIncompatibility = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  path: readonly string[]
): Promise<RestoreIncompatibility | undefined> => {
  for (const commitId of path) {
    const rows = await readChangeSetsOf(executor, commitId);
    const unresolved = firstUnresolvedChangeSet(rows, codec.resolveTargetMetadata);
    if (!unresolved) continue;
    return {
      commitId,
      direction: 'reverse',
      namespace: unresolved.namespace,
      entity: unresolved.entity,
      manifest: { codecVersion: RXDB_CHANGE_CODEC_VERSION, entityResolved: false }
    };
  }
  return undefined;
};

/**
 * 判断「把工作树恢复到目标 commit」在当前客户端是否可行。
 *
 * @param executor - 当前事务执行器
 * @param codec - 元数据解析上下文，见 {@link WorkingTreePatchCodecContext}
 * @param target - 恢复目标，见 {@link WorkingTreeRestoreTarget}
 * @returns 见 {@link RestoreCompatibility}
 * @throws {@link RxDBError} 目标不在当前分支 HEAD 的可达父链上
 *
 * @remarks
 * **本函数一个字节都不写。** 「检查」这个词本身就是只读的承诺；顺手写一行状态的话，它就没法
 * 被 restore 之外的入口（比如 UI 的「这个版本能不能恢复」预览）安全复用，而那个预览正是
 * 把这一段拆成独立函数的理由。
 *
 * 目标不可达时**抛**而不是返回失败出口：那是调用方的前置条件。`restore-command.ts` 先用
 * {@link selectRestoreReplayPath} 判可达性并把它转成自己的失败 `reason`，走到这里时
 * 「可达」已经成立；这条 throw 只会在有人跳过那一步时触发，而那是代码缺陷，不是用户输入。
 */
export const checkRestoreCompatibility = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  target: WorkingTreeRestoreTarget
): Promise<RestoreCompatibility> => {
  const token = await readActiveBranchToken(executor);
  const ref = await readCommitBranchRef(executor, token.branchId);
  const path = await selectRestoreReplayPath(executor, ref.headCommitId, target.commitId);
  if (!path) {
    throw new RxDBError(
      `Commit '${target.commitId}' is not reachable from branch '${token.branchId}' HEAD; ` +
        'callers must reject unreachable targets before running the restore precheck.'
    );
  }

  const incompatible = await findFirstReplayIncompatibility(executor, codec, path);
  return incompatible ? { ok: false, incompatible } : { ok: true, path };
};
