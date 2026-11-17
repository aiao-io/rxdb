/**
 * @fileoverview `restore(target, options)` —— 把业务表恢复成一个**可达**历史 commit 的数据，与 HEAD 的差异
 * 作为新的未提交变更写进当前工作树；HEAD 不动、历史不改、产物就是普通条目
 * （FR-013/014/015/033/034/042/043/050/051、US-317，contracts/core-api.md §5）。
 *
 * @remarks
 * 七件事在这里被钉死，每一件都对应一种会安静退化的写法：
 *
 * 1. **不移动 HEAD，也不删目标之后的节点。** 「恢复到某个历史版本」在 git 的肌肉记忆里是移动
 *    HEAD，而硬裁决 5 把这条路封死：HEAD 一旦能停在历史节点上，`status()` 的「相对 HEAD」与
 *    `commit()` 的父节点选择就各自要回答「相对哪个 HEAD」，而 v1 的调用方捕获型 CAS 全部建立在
 *    「工作树只与当前 HEAD 比」之上。把后续节点删掉同样能让物化状态等于目标——代价是用户唯一
 *    一份不可变记录没了（FR-013）。
 * 2. **dirty 工作树上直接拒绝，没有 `force`。** 放行等于把用户手写的那批变更与恢复出来的那批
 *    混进同一棵工作树，而 `commit()` 提交的是**全部**未提交单元，没有任何入参能把两批再分开
 *    （FR-014、FR-015 末句）。「显式处理」指的是先 commit 或先 discard。clean 还是回写成立的前提：
 *    此刻业务表等于 HEAD，叠上「HEAD → 目标」的差异才等于目标。
 * 3. **判空发生在写之前。** 重放路径为空（目标就是 HEAD）、或者路径撤销完之后与 HEAD 一模一样（改过又改回、
 *    新建又删掉），整条写路径都不跑：照写再回滚在行数上看不出区别，但 revision 与自增序列留下的痕迹不同，
 *    而 FR-042 的措辞是「不递增」，不是「递增后回滚」。凭空多出来的那行 active 会话还会占住 `activeKey`
 *    的唯一索引，让 `status().restoring` 从此恒为 true。
 * 4. **兼容性预检覆盖物化真正读的那些节点：重放路径。** 预检导出的 `path` 不含目标节点，物化也不读它——
 *    目标的数据就是「路径撤销完」之后的状态（见第 6 条）。v1 物化读的是目标节点自己的 ChangeSet，于是
 *    把它也算进预检；照旧检查它，等于拿一个用不到的节点拒掉一次合法的恢复。与提交视图
 *    （`checkout/worktree-commit-view.ts` 的 `planCommitView`）同一口径。
 * 5. **CAS 的那条 UPDATE 排在任何写之前。** 反过来的话，`rowsAffected = 0` 时业务表、条目与会话已经落库，
 *    而「那就回滚」只在一个真的会回滚的事务里成立——此处的顺序本身就是保证（conformance-suites.md §2.4、FR-034）。
 * 6. **业务表与工作树写的是同一份差异（US-317）。** v1 只把目标节点自己的单元抄进工作树、业务表一行不动：
 *    列表读到的仍是 HEAD，而那批条目既不是「HEAD → 目标」的差异（`inversePatch` 不是 HEAD 上的值，恢复之后
 *    再 discard 会退到别处），也重放不回目标——恢复到 `HEAD~2` 时 `HEAD~1` 改过的行根本不在里面。现在从 HEAD
 *    沿路径逐个撤销单元，按捕获同一份折叠规则折成差异（`projection-actions.ts` 的 `foldRestoreDelta`），条目落
 *    这一份，业务表回写也由这一份推出来（登记表 #14，{@link rewriteProjectionToTarget}）：两份各算的话，迟早在
 *    「删了又重建」这种边角上一份对、一份错，而 discard 读的是条目那一份。
 * 7. **诊断里不出现内容。** 失败出口只带 `reason` 与身份/枚举值，会话行只记「来自哪个 commit、
 *    当时两个 revision 是多少」。多一个承载 patch 的字段就等于把加密列的密文复制进一张没人拿它
 *    当机密对待的表（FR-043）。
 *
 * 回写的入口与触发器与 discard 同一个裁决（理由写在 `discard-command.ts` 的「回写的三个裁决」）：投影重写、
 * 不被捕获成单元；触发器开着——恢复是当前分支上的一次新写入，日志要跟着它，切走再切回来读到的才仍是目标的数据。
 * 可写检出位上同一条路径，落在那套影子表上。
 *
 * 损坏守卫复用 `commit/commit-graph-guard.ts` 的那一份（T038），**不在这里另写判定**：两份判定
 * 迟早分岔，而分岔的表现是同一条损坏链在 `commit()` 与 `restore()` 里得到两种结论（FR-051）。
 * 解码同理，走 `commit/commit-codec.ts` 的 {@link decodeCommitChangeSetUnit}。
 */

import type { SwitchVersionActions, TransactionExecutor } from '@aiao/rxdb';
import { declareTrustedWrite, TrustedWriteIntent, uuid } from '@aiao/rxdb';
import { resolveFirstParentReplayPath } from '../commit/commit-ancestry.js';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import type { CommitWriteContext } from '../commit/commit-context.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import {
  decodeWorkingTreeEntryUnit,
  foldRestoreDelta,
  projectionActionsOf,
  type WorkingTreeProjectionUnit
} from './projection-actions.js';
import {
  findFirstReplayIncompatibility,
  type RestoreIncompatibility,
  type WorkingTreeRestoreTarget
} from './restore-precheck.js';
import { readActiveRestoreSessionRow } from './restore-session-transitions.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { encodeWorkingTreePatch } from './working-tree-patch-codec.js';
import { WorkingTreeRestoreSession } from './working-tree-restore-session.entity.js';
import { buildWorkingTreeRestoreTransitionSql } from './working-tree-state-sql.js';
import { WorkingTreeState } from './working-tree-state.entity.js';
import type { WorkingTreeEntryRow } from './write-entry.js';

export type { WorkingTreeRestoreTarget } from './restore-precheck.js';

/**
 * 一次 `restore()` 的入参：三个捕获位，没有第四个。
 *
 * @remarks
 * 与 {@link WorkingTreeCredentials} **恒等**，而不是在它之上再加一层：任何第四个键都是在问
 * 「脏的时候怎么办」或「冲突时听谁的」，而 FR-014 / FR-034 对这两个问题的答案分别是「拒绝」与
 * 「两份都留着，交给正在看屏幕的那个人」——它们因此没有入参可以承载。
 *
 * 取别名而不是 `extends` 一个空接口：空接口在这里只会给未来的人留一个「往里加一个字段」的空位，
 * 而这个位置正是要空着的那个。
 */
export type WorkingTreeRestoreOptions = WorkingTreeCredentials;

/**
 * 一次 `restore()` 被拒的成因。
 *
 * @remarks
 * 判别位做成 `reason` 而不是「哪个字段在」：restore 的失败出口不止一种，靠字段判别的话，每加一个
 * 新原因，所有旧调用点的 `else` 分支都会静默地把新原因当成旧原因处理。
 */
export type WorkingTreeRestoreFailureReason =
  /** 三个捕获位中有一个对不上，或那条带 `WHERE revision = ?` 的 UPDATE 一行都没命中 */
  | 'conflict'
  /** 工作树里还有未提交条目；先 commit 或先 discard（FR-014，**没有** force） */
  | 'dirty_working_tree'
  /** 重放路径上有 ChangeSet 的目标实体在本客户端解析不到（FR-050） */
  | 'incompatible_schema'
  /** 目标不在当前分支 HEAD 的可达父链上（FR-033） */
  | 'unreachable_target'
  /**
   * 目标在历史里，但只经由某个合并提交的**非第一父**可达（US-316）
   *
   * @remarks
   * 与 `unreachable_target` 分开：这个提交在 `listCommits()` 里看得见、点得到，只是从这条分支的数据退不到它——
   * 每个提交的 ChangeSet 是相对第一父的增量，侧枝上的提交从没直接落到这条分支的业务表上，沿第一父链撤销到不了它，
   * 而 restore 只会撤销。要那份数据，从它建一条分支（`createBranchFromCommit()`，它有分叉点时）或在服务端处理。
   */
  | 'side_branch_target';

/**
 * 一次 `restore()` 的结果。
 *
 * @remarks
 * 成功出口恰好四个字段，**一个都不多**：调用方想看看「恢复了什么」时，最顺手的实现是把 patch
 * 抄一份挂上来，而那份 patch 里可能躺着加密列的密文（FR-043）。要看内容走 `diff()`，恢复出来的
 * 条目在那里与手写变更同形。
 *
 * `restoredCount: 0` 加 `sessionId: null` 就是 no-op 的全部含义，不另立一个 `noop` 布尔位——多一位
 * 就多一个会与 `restoredCount` 对不上的地方（FR-042）。
 */
export type WorkingTreeRestoreResult =
  | {
      /** 本次恢复已落库：业务表是目标的数据；`restoredCount: 0` 时是一次什么都没写的 no-op */
      readonly ok: true;
      /** 写进工作树的条目数，即业务表上与 HEAD 不同的行数 */
      readonly restoredCount: number;
      /** 本次建立的恢复会话 id；no-op 时为 `null`（没建会话） */
      readonly sessionId: string | null;
      /** 本次调用之后的工作树 revision；no-op 时等于调用前的值 */
      readonly workingTreeRevision: number;
    }
  | {
      /** 三个捕获位对不上，或 CAS 未命中；一个字节都没落地 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'conflict';
      /** 诊断值；**不入库**，也没有「清除冲突」的 API */
      readonly conflict: CommitConflict;
    }
  | {
      /** 工作树不干净，本次恢复被拒；持久状态零变化 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'dirty_working_tree';
    }
  | {
      /** 重放路径上有本客户端认不出的实体；持久状态零变化 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'incompatible_schema';
      /** 首个不兼容节点的稳定描述，**不含 patch 内容**（FR-050、FR-043） */
      readonly incompatible: RestoreIncompatibility;
    }
  | {
      /** 目标 commit 从当前 HEAD 够不到；持久状态零变化 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'unreachable_target';
    }
  | {
      /** 目标只在合并提交带进来的侧枝上，沿第一父链退不到；持久状态零变化（US-316） */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'side_branch_target';
    };

/**
 * 读一个 commit 的全部 ChangeSet，按 `sequence` 升序。
 *
 * @remarks
 * 与 `restore-precheck.ts` 里那份同形而**各自一份**：那一份是私有的，把它导出来给这里用等于让
 * 预检的内部实现变成两个模块之间的契约。排序在 JS 侧做、不依赖后端默认返回顺序：`sequence`
 * 决定重放次序，撤销要倒着走它。
 */
const readChangeSetsOf = async (executor: TransactionExecutor, commitId: string): Promise<CommitChangeSet[]> => {
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  return [...rows].sort((left, right) => left.sequence - right.sequence);
};

/** 三段身份拼成的比较键；空格不会出现在任何一段里，所以拼接不歧义。 */
const identityKeyOf = (row: { namespace: string; entity: string; entityId: string }): string =>
  `${row.namespace} ${row.entity} ${row.entityId}`;

/**
 * 按 `target.entities` 挑出要恢复的那些行；缺省即全部。
 *
 * @remarks
 * 这里的「挑」与硬裁决 1 方向相反：硬裁决 1 禁的是 `commit()` / `discard()` 挑一部分**未提交
 * 变更**，而这里挑的是**要把哪些行恢复到目标时的状态**——写完之后它们和手写变更一样是整棵工作树的一部分，
 * 下一次 `commit()` 照样全量提交（FR-015 末句）。没点名的行留在 HEAD。
 *
 * 在折叠之前按身份筛单元，与折叠之后再筛差异等价：每个身份的差异只取决于它自己那几条单元。
 */
const selectTargetUnits = <T extends { namespace: string; entity: string; entityId: string }>(
  units: readonly T[],
  entities: WorkingTreeRestoreTarget['entities']
): T[] => {
  if (!entities) return [...units];
  const wanted = new Set(entities.map(identityKeyOf));
  return units.filter(unit => wanted.has(identityKeyOf(unit)));
};

/**
 * 把一行历史 ChangeSet 还原成**本客户端的落库形态**的单元。
 *
 * @remarks
 * **decode 再 encode 走一个来回**，而不是把落库形态原样拿来折。两者在等值断言下看起来一样，区别在
 * codec 版本：抄一份原值等于赌「历史行的形态恰好就是本客户端现在要的形态」，而这个赌注在 codec 版本
 * 变过一次之后就不成立了（FR-043）。加密列两步都被 codec 跳过，信封原样穿过。
 */
const restoreUnitOf = (context: CommitWriteContext, row: CommitChangeSet): WorkingTreeProjectionUnit => {
  const unit = decodeCommitChangeSetUnit(context.codec, row);
  const target = { namespace: unit.namespace, entity: unit.entity };
  return {
    namespace: unit.namespace,
    entity: unit.entity,
    entityId: unit.entityId,
    operation: unit.operation,
    patch: encodeWorkingTreePatch(context.codec, target, unit.patch),
    inversePatch: encodeWorkingTreePatch(context.codec, target, unit.inversePatch)
  };
};

/**
 * 读重放路径上的全部单元，按**撤销顺序**排好：HEAD 那个提交在前，提交内按 `sequence` 倒序。
 *
 * @remarks
 * 路径是 HEAD 沿**第一父链**回溯到目标之前的那些提交（`resolveFirstParentReplayPath()`，US-316），它的次序就是撤销次序：
 * 每个提交的 ChangeSet 是相对第一父的增量，撤掉 HEAD 那一份业务表就等于第一父的数据，再撤下一份，依此类推。
 * 合并提交在这条路上与普通提交没有区别——撤掉它就回到它的第一父；它带进来的侧枝不在路上，侧枝的 ChangeSet
 * 从没直接落到本分支的业务表上，撤它们就是把合并那份增量里已经撤过的东西再撤一遍。US-317 那条「引入多父提交后
 * 要重看」的顺延到这里落地：顺序问题不存在了，因为这条路上每个节点恰好一个前驱。
 *
 * 提交内今天每个身份至多一条单元（本地提交取的是工作树条目），倒着走 `sequence` 让「一个提交里同一行写了
 * 两次」也撤得对——导入的提交不保证这一点，服务端的合并结果可以对同一行写两条。
 */
const readUnitsToUndo = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  path: readonly string[]
): Promise<WorkingTreeProjectionUnit[]> => {
  const units: WorkingTreeProjectionUnit[] = [];
  for (const commitId of path) {
    const rows = await readChangeSetsOf(executor, commitId);
    for (const row of rows.reverse()) units.push(restoreUnitOf(context, row));
  }
  return units;
};

/** {@link toRestoredEntry} 里那两个与行无关的值，单列成型只为把参数表压短。 */
interface RestoredEntryIdentity {
  /** 落点分支 */
  readonly branchId: string;
  /** 本次恢复的变更单元 id；整次恢复共享一个 */
  readonly unitId: string;
}

/**
 * 把一行差异落成一条**普通**工作树条目。
 *
 * @remarks
 * **`origin` 写死 `'local'`。** 恢复是此刻这个用户做的一次本地改动，不是一次同步下行；记成远端来源的话，
 * 一棵由恢复产生的工作树会在 `status().byOrigin` 里显示成「远端同步来的」，而硬裁决 6 已经说明这两个桶
 * 都不豁免 dirty 判定——分不清来源只会让用户更难解释眼前这批变更是哪来的。
 *
 * **`sourceChangeId` 恒为 `null`。** 它是指向 `rxdb_change` 的诊断线索，而这批条目的数据源是历史 ChangeSet；
 * 随手填一个 id 进去等于造一条指向别的表、别的语义的假线索。`transactionId` 同理。
 *
 * 补丁不与历史行共享引用：编码是一次浅拷贝，折叠与净差异又各拷一次。条目在 `commit()` 之后会被清理，
 * 与历史行共享同一个对象的话，清理会顺手改掉已经不可变的历史（data-model.md §2.4）。
 */
const toRestoredEntry = (
  context: CommitWriteContext,
  identity: RestoredEntryIdentity,
  row: WorkingTreeEntryRow
): WorkingTreeEntry => {
  const entry = context.entityManager.instantiate(WorkingTreeEntry);
  entry.id = uuid();
  entry.branchId = identity.branchId;
  entry.unitId = identity.unitId;
  entry.transactionId = null;
  entry.namespace = row.namespace;
  entry.entity = row.entity;
  entry.entityId = row.entityId;
  entry.operation = row.operation;
  entry.patch = row.patch === null ? null : { ...row.patch };
  entry.inversePatch = row.inversePatch === null ? null : { ...row.inversePatch };
  entry.fingerprint = row.fingerprint;
  entry.origin = 'local';
  entry.sourceChangeId = null;
  return entry;
};

/** 一次恢复要落的两样东西：同一份差异的两种形态。 */
interface RestorePlan {
  /** 写进工作树的条目（落库形态） */
  readonly entries: readonly WorkingTreeEntry[];
  /** 回写业务表的增删改（解码形态），由 {@link RestorePlan.entries} 推出 */
  readonly actions: SwitchVersionActions;
}

/**
 * 算出这次恢复：HEAD → 目标的差异，落成条目，再由条目推出业务表回写。
 *
 * @remarks
 * 整次恢复共享**一个** `unitId`：它就是一次事务（adapter-contract.md §5）。逐行各发一个的话，提交时
 * 这批条目会摊成多个互不相干的单元，而它们本属同一次操作；沿用历史行的 `unitId` 则会让新条目与
 * 一段已经不可变的历史共用标识。
 *
 * 回写由条目推出来，而不是另跑一遍逆向折叠：业务表叠上的必须**恰好**是工作树里记下的那份差异，
 * 冷重放（`HEAD + 条目 = 业务表`）才在恢复之后成立。
 */
const planRestore = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  branchId: string,
  path: readonly string[],
  entities: WorkingTreeRestoreTarget['entities']
): Promise<RestorePlan> => {
  const units = selectTargetUnits(await readUnitsToUndo(executor, context, path), entities);
  const identity: RestoredEntryIdentity = { branchId, unitId: uuid() };
  const entries = foldRestoreDelta(units, identity).map(row => toRestoredEntry(context, identity, row));
  const actions = projectionActionsOf(
    entries.map(entry => decodeWorkingTreeEntryUnit(context.codec, entry)),
    'apply'
  );
  return { entries, actions };
};

/**
 * 把 CAS 未命中翻译成 {@link CommitConflict}。
 *
 * @remarks
 * 走到这里意味着我们自己那三次比较全过了、带 `WHERE revision = ?` 的那条 UPDATE 却没命中。重读
 * 一次只为把**真实的**当前值报出去：把 `expected` 原样当成 `actual` 回填的话，调用方拿到一个
 * `expected === actual` 的冲突，除了「失败了」什么也看不出来。这是一次诊断读，不是重试——这条
 * 路径上不会再打第二条 CAS。
 */
const toWorkingTreeConflict = async (
  executor: TransactionExecutor,
  branchId: string,
  expected: number
): Promise<CommitConflict> => {
  const state = await readWorkingTreeStateRow(executor, branchId);
  return { kind: 'working_tree_revision', expected, actual: state.workingTreeRevision, branchId };
};

/** {@link writeRestore} 的入参；单列成型只为把主函数的嵌套压在 3 层以内。 */
interface RestoreWriteInput {
  /** 落点分支 */
  readonly branchId: string;
  /** 事务内读出的状态行；落库后就地同步 */
  readonly state: WorkingTreeState;
  /** 当前 HEAD revision；恢复不动它，只把它抄进会话 */
  readonly headRevision: number;
  /** 恢复来源 commit */
  readonly targetCommitId: string;
  /** 这次恢复的条目与回写 */
  readonly plan: RestorePlan;
}

/**
 * 造这次恢复的会话行。
 *
 * @remarks
 * 捕获的是**本次恢复落盘之后**的两个 revision：`status.ts` 的 `readRestoreBits` 拿这两个数与当前值
 * 比，相等即 `restoring`、不等即 `conflicted`。捕获恢复前的值等于让会话一出生就与当前值不等——那与
 * 「另一个 Tab 写了一次」逐字节相同，于是 `conflicted` 恒为 true。HEAD 不动，所以它抄的就是当前值；
 * 工作树 revision 恰好加一。
 *
 * `activeKey` 取 `branchId` 而不是 `true` 一类的常量：唯一索引要的是「一分支至多一行」，而常量给出的
 * 是「全库至多一行」。终态时它置 `null`（`NULL` 不参与唯一比较），于是已结束的会话可以无限多行——
 * 那一步属于 T107。
 */
const newRestoreSession = (
  context: CommitWriteContext,
  input: RestoreWriteInput,
  workingTreeRevision: number
): WorkingTreeRestoreSession => {
  const session = context.entityManager.instantiate(WorkingTreeRestoreSession);
  session.id = uuid();
  session.branchId = input.branchId;
  session.targetCommitId = input.targetCommitId;
  session.expectedHeadRevision = input.headRevision;
  session.expectedWorkingTreeRevision = workingTreeRevision;
  session.status = 'active';
  session.activeKey = input.branchId;
  return session;
};

/**
 * 把业务表回写成目标的数据：受信调用点登记表 #14。
 *
 * @param executor - 调用方那个写事务的执行器；声明挂在它上面，由挂载点 2 当场取走
 * @param actions - {@link planRestore} 由条目推出的增删改
 *
 * @remarks
 * 声明绑执行器、入口是投影重写、触发器开着，三条理由与 discard 那一处（登记表 #13）相同，写在
 * `discard-command.ts` 的「回写的三个裁决」里。不判空：条目非空时增删改必然非空（每条 UPDATE 差异
 * 至少留着一个 tracked 字段），判了也是一条走不到的分支。
 */
const rewriteProjectionToTarget = async (
  executor: TransactionExecutor,
  actions: SwitchVersionActions
): Promise<void> => {
  declareTrustedWrite(executor, {
    file: 'restore-command.ts',
    symbol: 'rewriteProjectionToTarget',
    intent: TrustedWriteIntent.working_tree_projection
  });
  await executor.mergeChanges(actions, undefined, false);
};

/**
 * 落盘：先打 CAS，命中了才回写业务表、写条目与会话。
 *
 * @remarks
 * **顺序就是保证。** 反过来先写再 CAS 的话，`rowsAffected = 0` 时业务表、条目与会话已经落库，而「那就回滚」
 * 只在一个真的会回滚的事务里成立——恢复的整条路径同样要在没有回滚的观测下表现为零变化（FR-034）。
 *
 * 回写排在条目之前：它是这一步里唯一可能因为业务数据本身失败的写（存储约束、外键），先跑它，抛错时
 * 一条条目都还没落。条目与会话分两次 `saveMany` 而不是拼成一批：条目先落、会话后落，中途失败留下的是
 * 「多了一批条目、没有会话」——那是一棵 dirty 工作树，用户 discard 得掉；反过来留下的是一个指向从未发生过
 * 的恢复的 active 会话，它占住唯一索引，而没有任何入口能结束它。三步都在调用方那一个事务里，真实后端上
 * 任何一步抛错都是整笔回滚（AC4）。
 */
const writeRestore = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  input: RestoreWriteInput
): Promise<WorkingTreeRestoreResult> => {
  const { plan, state } = input;
  const workingTreeRevision = state.workingTreeRevision + 1;
  const outcome = await executor.query(
    buildWorkingTreeRestoreTransitionSql(executor.tableRef(WorkingTreeState), {
      branchId: input.branchId,
      expectedWorkingTreeRevision: state.workingTreeRevision,
      workingTreeRevision,
      entryCount: plan.entries.length
    })
  );
  if (outcome.rowsAffected === 0) {
    return {
      ok: false,
      reason: 'conflict',
      conflict: await toWorkingTreeConflict(executor, input.branchId, state.workingTreeRevision)
    };
  }

  await rewriteProjectionToTarget(executor, plan.actions);
  const session = newRestoreSession(context, input, workingTreeRevision);
  await executor.saveMany([...plan.entries]);
  await executor.saveMany([session]);
  state.workingTreeRevision = workingTreeRevision;
  state.entryCount = plan.entries.length;
  return { ok: true, restoredCount: plan.entries.length, sessionId: session.id, workingTreeRevision };
};

/** 什么都没写的那个成功出口（FR-042）。 */
const noopRestore = (state: WorkingTreeState): WorkingTreeRestoreResult => ({
  ok: true,
  restoredCount: 0,
  sessionId: null,
  workingTreeRevision: state.workingTreeRevision
});

/**
 * 把业务表恢复成目标 commit 的数据，与 HEAD 的差异作为新的未提交变更写进工作树（FR-013、US-317）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param context - 见 {@link CommitWriteContext}：造条目行的实体管理器与 codec 解析上下文
 * @param target - 见 {@link WorkingTreeRestoreTarget}；`entities` 缺省即全部行
 * @param options - 见 {@link WorkingTreeRestoreOptions}；三个捕获位全部必填
 * @returns 见 {@link WorkingTreeRestoreResult}
 * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏时（FR-051）
 * @throws {@link TypeError} 历史行的 `patch` 列里存的不是普通对象
 *
 * @remarks
 * 步骤顺序全是有理由的：
 *
 * 1. **先读 active 分支令牌**，此后一切都打在它身上。事务中途再查一次并把恢复写过去，等于用户在
 *    A 分支上点的恢复落进了 B 分支的工作树。
 * 2. **损坏守卫先于一切。** 反过来的话，一条已损坏的链上、凭据又恰好对得上的恢复会直接落库，
 *    把历史里一段自己都校验不过的内容物化进工作树（FR-051）。
 * 3. **三次比较、dirty 守卫、可达性、兼容性预检、判空**，全部先于任何写入。任一不过即返回失败
 *    出口，此时没有任何东西需要回滚——这正是它们做成返回值而非异常的原因（FR-033 的「零变化」
 *    在这里的物理含义就是这个顺序）。
 * 4. **CAS、回写业务表、写条目、写会话**，全在调用方那一个事务里（见 {@link writeRestore}）。
 *
 * dirty 判据读的是 `state.entryCount`——与 `status().clean` **同一个表达式**。分头实现的话两者迟早在
 * 某次改动里分岔，而分岔的症状是「界面显示干净，恢复却说脏」，用户没有任何手段能查出差在哪
 * （FR-014）。
 *
 * 差异为空（路径撤销完与 HEAD 一模一样，或 `entities` 点名的行都没变过）与重放路径为空走**同一个**
 * no-op 出口：两者要写的东西都是零，而为一次零写入建一行 active 会话，正是 FR-042 点名的那个死角。
 */
export const restoreWorkingTree = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  target: WorkingTreeRestoreTarget,
  options: WorkingTreeRestoreOptions
): Promise<WorkingTreeRestoreResult> => {
  const token = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, token.branchId);

  const ref = await readCommitBranchRef(executor, token.branchId);
  const state = await readWorkingTreeStateRow(executor, token.branchId);
  const conflict = findCommitConflict(options, {
    token,
    headRevision: ref.headRevision,
    workingTreeRevision: state.workingTreeRevision
  });
  if (conflict) return { ok: false, reason: 'conflict', conflict };
  if (state.entryCount !== 0) return { ok: false, reason: 'dirty_working_tree' };

  const resolved = await resolveFirstParentReplayPath(executor, ref.headCommitId, target.commitId);
  if (resolved.kind === 'unreachable') return { ok: false, reason: 'unreachable_target' };
  if (resolved.kind === 'side_branch') return { ok: false, reason: 'side_branch_target' };
  const { path } = resolved;
  if (path.length === 0) return noopRestore(state);

  const incompatible = await findFirstReplayIncompatibility(executor, context.codec, path);
  if (incompatible) return { ok: false, reason: 'incompatible_schema', incompatible };

  const plan = await planRestore(executor, context, token.branchId, path, target.entities);
  if (plan.entries.length === 0) return noopRestore(state);
  return writeRestore(executor, context, {
    branchId: token.branchId,
    state,
    headRevision: ref.headRevision,
    targetCommitId: target.commitId,
    plan
  });
};

/**
 * 当前分支那个尚未结束的恢复会话（contracts/core-api.md §5）。
 *
 * @remarks
 * 恰好四个字段，**不带那两个 revision**。它们是 `status()` 判 `restoring` / `conflicted` 的内部依据，
 * 交出去只会多一种算法：调用方拿两个数自己比一遍，而那份比较与 `status.ts` 的那份迟早分岔。
 * 要知道会话还成不成立就读 `status()`，那里的 `restoring` / `conflicted` 是同一份判定的唯一出口。
 */
export interface WorkingTreeRestoreSessionInfo {
  /** 会话行主键 */
  readonly id: string;
  /** 会话所属分支 */
  readonly branchId: string;
  /** 这次恢复的来源 commit */
  readonly targetCommitId: string;
  /** 会话状态 */
  readonly status: WorkingTreeRestoreSession['status'];
}

/**
 * 读当前分支那个未结束的恢复会话，没有就是 `null`。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 目标分支
 * @returns 见 {@link WorkingTreeRestoreSessionInfo}；无未结束会话时为 `null`
 *
 * @remarks
 * 查询本身走 {@link readActiveRestoreSessionRow}，与 `status.ts` 的 `readRestoreBits`
 * **同一份**：判据是 `activeKey IS NOT NULL` 而不是 `status = 'active'`，两者看着等价，
 * 区别在 `conflicted`——那种会话的 `activeKey` 仍然占着索引、仍然要被用户处理掉，按状态筛
 * 会让它在这个入口上凭空消失，而唯一索引那边它还在。
 *
 * 本函数只做一件额外的事：把行**收窄**成 {@link WorkingTreeRestoreSessionInfo} 再出包。
 * 直接把实体行交出去的话，调用方就能改它的 `status` / `activeKey`——而终态转换只允许经由
 * `restore-session-transitions.ts`，那里 SQL 与内存行是一起改的。
 */
export const readActiveRestoreSession = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<WorkingTreeRestoreSessionInfo | null> => {
  const session = await readActiveRestoreSessionRow(executor, branchId);
  if (!session) return null;
  return {
    id: session.id,
    branchId: session.branchId,
    targetCommitId: session.targetCommitId,
    status: session.status
  };
};
