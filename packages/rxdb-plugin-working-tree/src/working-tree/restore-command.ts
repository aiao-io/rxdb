/**
 * @fileoverview `restore(target, options)` —— 把一个**可达**历史 commit 的内容作为新的未提交
 * 变更写回当前工作树；HEAD 不动、历史不改、产物就是普通条目
 * （FR-013/014/015/033/034/042/043/050/051，contracts/core-api.md §5）。
 *
 * @remarks
 * 六件事在这里被钉死，每一件都对应一种会安静退化的写法：
 *
 * 1. **不移动 HEAD，也不删目标之后的节点。** 「恢复到某个历史版本」在 git 的肌肉记忆里是移动
 *    HEAD，而硬裁决 5 把这条路封死：HEAD 一旦能停在历史节点上，`status()` 的「相对 HEAD」与
 *    `commit()` 的父节点选择就各自要回答「相对哪个 HEAD」，而 v1 的调用方捕获型 CAS 全部建立在
 *    「工作树只与当前 HEAD 比」之上。把后续节点删掉同样能让物化状态等于目标——代价是用户唯一
 *    一份不可变记录没了（FR-013）。
 * 2. **dirty 工作树上直接拒绝，没有 `force`。** 放行等于把用户手写的那批变更与恢复出来的那批
 *    混进同一棵工作树，而 `commit()` 提交的是**全部**未提交单元，没有任何入参能把两批再分开
 *    （FR-014、FR-015 末句）。「显式处理」指的是先 commit 或先 discard。
 * 3. **判空发生在写之前。** 重放路径为空（目标就在 HEAD 的保留集里）时整条写路径都不跑：照写再
 *    回滚在行数上看不出区别，但 revision 与自增序列留下的痕迹不同，而 FR-042 的措辞是「不递增」，
 *    不是「递增后回滚」。凭空多出来的那行 active 会话还会占住 `activeKey` 的唯一索引，让
 *    `status().restoring` 从此恒为 true。
 * 4. **兼容性预检覆盖整条重放路径，外加目标节点自己。** 预检导出的 `path` 按定义不含目标（见
 *    `restore-precheck.ts`），而**物化读的恰好是目标自己的 ChangeSet**——漏掉它的话，一个引用了
 *    本客户端不认识的实体的目标会让 `encodeWorkingTreePatch()` 抛出来，而 FR-033 要的是一个
 *    失败**出口**，不是异常。
 * 5. **CAS 的那条 UPDATE 排在任何 `saveMany()` 之前。** 反过来的话，`rowsAffected = 0` 时条目与
 *    会话已经落库，而「那就回滚」只在一个真的会回滚的事务里成立——此处的顺序本身就是保证
 *    （conformance-suites.md §2.4、FR-034）。
 * 6. **诊断里不出现内容。** 失败出口只带 `reason` 与身份/枚举值，会话行只记「来自哪个 commit、
 *    当时两个 revision 是多少」。多一个承载 patch 的字段就等于把加密列的密文复制进一张没人拿它
 *    当机密对待的表（FR-043）。
 *
 * 损坏守卫复用 `commit/commit-graph-guard.ts` 的那一份（T038），**不在这里另写判定**：两份判定
 * 迟早分岔，而分岔的表现是同一条损坏链在 `commit()` 与 `restore()` 里得到两种结论（FR-051）。
 * 解码同理，走 `commit/commit-codec.ts` 的 {@link decodeCommitChangeSetUnit}。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { uuid } from '@aiao/rxdb';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import type { CommitWriteContext } from '../commit/commit-context.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { fingerprintOf, readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import {
  findFirstReplayIncompatibility,
  selectRestoreReplayPath,
  type RestoreIncompatibility,
  type WorkingTreeRestoreTarget
} from './restore-precheck.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { encodeWorkingTreePatch } from './working-tree-patch-codec.js';
import { WorkingTreeRestoreSession } from './working-tree-restore-session.entity.js';
import { buildWorkingTreeRestoreTransitionSql } from './working-tree-state-sql.js';
import { WorkingTreeState } from './working-tree-state.entity.js';

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
  /** 重放路径上（含目标节点自身）有 ChangeSet 的目标实体在本客户端解析不到（FR-050） */
  | 'incompatible_schema'
  /** 目标不在当前分支 HEAD 的可达父链上（FR-033） */
  | 'unreachable_target';

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
      /** 本次恢复已落库；`restoredCount: 0` 时是一次什么都没写的 no-op */
      readonly ok: true;
      /** 写进工作树的条目数 */
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
    };

/**
 * 读一个 commit 的全部 ChangeSet，按 `sequence` 升序。
 *
 * @remarks
 * 与 `restore-precheck.ts` 里那份同形而**各自一份**：那一份是私有的，把它导出来给这里用等于让
 * 预检的内部实现变成两个模块之间的契约。排序在 JS 侧做、不依赖后端默认返回顺序：`sequence`
 * 决定物化次序，而条目的落库顺序与指纹都吃这个顺序。
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
 * 按 `target.entities` 挑出要物化的那些单元；缺省即全部。
 *
 * @remarks
 * 这里的「挑」与硬裁决 1 方向相反：硬裁决 1 禁的是 `commit()` / `discard()` 挑一部分**未提交
 * 变更**，而这里挑的是**要往工作树里写什么**——写完之后它们和手写变更一样是整棵工作树的一部分，
 * 下一次 `commit()` 照样全量提交（FR-015 末句）。
 */
const selectTargetUnits = (
  rows: readonly CommitChangeSet[],
  entities: WorkingTreeRestoreTarget['entities']
): CommitChangeSet[] => {
  if (!entities) return [...rows];
  const wanted = new Set(entities.map(identityKeyOf));
  return rows.filter(row => wanted.has(identityKeyOf(row)));
};

/** {@link toRestoredEntry} 里那两个与行无关的值，单列成型只为把参数表压短。 */
interface RestoredEntryIdentity {
  /** 落点分支 */
  readonly branchId: string;
  /** 本次恢复的变更单元 id；整次恢复共享一个 */
  readonly unitId: string;
}

/**
 * 把一行历史 ChangeSet 物化成一条**普通**工作树条目。
 *
 * @remarks
 * **decode 再 encode 走一个来回**，而不是把落库形态抄一份过去。两者在等值断言下看起来一样，
 * 区别在加密列：codec 对 `encrypted === true` 的列一律跳过，对同类型但不加密的列则包
 * `$rxdbChangeValue` 信封。抄一份原值等于赌「历史行的形态恰好就是本客户端现在要的形态」，而这个
 * 赌注在 codec 版本变过一次之后就不成立了（FR-043）。它同时顺带保证了**不共享引用**：条目在
 * `commit()` 之后会被清理，与历史行共享同一个对象的话，清理会顺手改掉已经不可变的历史
 * （data-model.md §2.4）。
 *
 * **`origin` 写死 `'local'`，不抄历史行的那一列。** 恢复是此刻这个用户做的一次本地改动，不是一次
 * 同步下行；抄过来的话，一棵由恢复产生的工作树会在 `status().byOrigin` 里显示成「远端同步来的」，
 * 而硬裁决 6 已经说明这两个桶都不豁免 dirty 判定——分不清来源只会让用户更难解释眼前这批变更
 * 是哪来的。
 *
 * **`sourceChangeId` 恒为 `null`。** 它是指向 `rxdb_change` 的诊断线索，而这条路径的数据源是历史
 * ChangeSet，压根没有对应的变更日志行；随手填一个历史 id 进去等于造一条指向别的表、别的语义的
 * 假线索。`transactionId` 同理：恢复不是从某次业务事务折出来的。
 */
const toRestoredEntry = (
  context: CommitWriteContext,
  identity: RestoredEntryIdentity,
  row: CommitChangeSet
): WorkingTreeEntry => {
  const unit = decodeCommitChangeSetUnit(context.codec, row);
  const target = { namespace: unit.namespace, entity: unit.entity };
  const patch = encodeWorkingTreePatch(context.codec, target, unit.patch);
  const entry = context.entityManager.instantiate(WorkingTreeEntry);
  entry.id = uuid();
  entry.branchId = identity.branchId;
  entry.unitId = identity.unitId;
  entry.transactionId = null;
  entry.namespace = unit.namespace;
  entry.entity = unit.entity;
  entry.entityId = unit.entityId;
  entry.operation = unit.operation;
  entry.patch = patch;
  entry.inversePatch = encodeWorkingTreePatch(context.codec, target, unit.inversePatch);
  entry.fingerprint = fingerprintOf(unit.operation, patch);
  entry.origin = 'local';
  entry.sourceChangeId = null;
  return entry;
};

/**
 * 读目标 commit 自己的单元并物化成条目行（尚未落库）。
 *
 * @remarks
 * 数据源是**目标节点自己的** ChangeSet，不是重放路径上那些节点的 `inversePatch`。后者算出的是
 * 「把工作树退回目标状态所需的增量」，而 FR-013 要的是「把目标 commit 的**内容**作为新的未提交
 * 变更写回」——两者在目标是基线节点（没有父节点、路径上的节点与它内容无关）时结论完全不同，
 * 而那正是最常见的「恢复到最初那一版」。
 *
 * 整次恢复共享**一个** `unitId`：它就是一次事务（adapter-contract.md §5）。逐行各发一个的话，提交时
 * 这批条目会摊成多个互不相干的单元，而它们本属同一次操作；沿用历史行的 `unitId` 则会让新条目与
 * 一段已经不可变的历史共用标识。
 */
const materializeTarget = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  branchId: string,
  target: WorkingTreeRestoreTarget
): Promise<WorkingTreeEntry[]> => {
  const rows = selectTargetUnits(await readChangeSetsOf(executor, target.commitId), target.entities);
  const identity: RestoredEntryIdentity = { branchId, unitId: uuid() };
  return rows.map(row => toRestoredEntry(context, identity, row));
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
  /** 待落库的条目行 */
  readonly entries: readonly WorkingTreeEntry[];
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
 * 落盘：先打 CAS，命中了才写条目与会话。
 *
 * @remarks
 * **顺序就是保证。** 反过来先写再 CAS 的话，`rowsAffected = 0` 时条目与会话已经落库，而「那就回滚」
 * 只在一个真的会回滚的事务里成立——恢复的整条路径同样要在没有回滚的观测下表现为零变化（FR-034）。
 *
 * 条目与会话分两次 `saveMany` 而不是拼成一批：两张表的写入顺序在这里是有意义的。条目先落、会话
 * 后落，中途失败留下的是「多了一批条目、没有会话」——那是一棵 dirty 工作树，用户 discard 得掉；
 * 反过来留下的是一个指向从未发生过的恢复的 active 会话，它占住唯一索引，而没有任何入口能结束它。
 */
const writeRestore = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  input: RestoreWriteInput
): Promise<WorkingTreeRestoreResult> => {
  const { entries, state } = input;
  const workingTreeRevision = state.workingTreeRevision + 1;
  const outcome = await executor.query(
    buildWorkingTreeRestoreTransitionSql(executor.tableRef(WorkingTreeState), {
      branchId: input.branchId,
      expectedWorkingTreeRevision: state.workingTreeRevision,
      workingTreeRevision,
      entryCount: entries.length
    })
  );
  if (outcome.rowsAffected === 0) {
    return {
      ok: false,
      reason: 'conflict',
      conflict: await toWorkingTreeConflict(executor, input.branchId, state.workingTreeRevision)
    };
  }

  const session = newRestoreSession(context, input, workingTreeRevision);
  await executor.saveMany([...entries]);
  await executor.saveMany([session]);
  state.workingTreeRevision = workingTreeRevision;
  state.entryCount = entries.length;
  return { ok: true, restoredCount: entries.length, sessionId: session.id, workingTreeRevision };
};

/** 什么都没写的那个成功出口（FR-042）。 */
const noopRestore = (state: WorkingTreeState): WorkingTreeRestoreResult => ({
  ok: true,
  restoredCount: 0,
  sessionId: null,
  workingTreeRevision: state.workingTreeRevision
});

/**
 * 把目标 commit 的内容作为新的未提交变更写回当前工作树（FR-013）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param context - 见 {@link CommitWriteContext}：造条目行的实体管理器与 codec 解析上下文
 * @param target - 见 {@link WorkingTreeRestoreTarget}；`entities` 缺省即整个 commit
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
 * 3. **三次比较、dirty 守卫、可达性、判空、兼容性预检**，全部先于任何写入。任一不过即返回失败
 *    出口，此时没有任何东西需要回滚——这正是它们做成返回值而非异常的原因（FR-033 的「零变化」
 *    在这里的物理含义就是这个顺序）。
 * 4. **CAS、写条目、写会话**，全在调用方那一个事务里（见 {@link writeRestore}）。
 *
 * dirty 判据读的是 `state.entryCount`——与 `status().clean` **同一个表达式**。分头实现的话两者迟早在
 * 某次改动里分岔，而分岔的症状是「界面显示干净，恢复却说脏」，用户没有任何手段能查出差在哪
 * （FR-014）。
 *
 * 物化结果为空（`entities` 一个都没命中）与重放路径为空走**同一个** no-op 出口：两者要写的东西都是
 * 零，而为一次零写入建一行 active 会话，正是 FR-042 点名的那个死角。
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

  const path = await selectRestoreReplayPath(executor, ref.headCommitId, target.commitId);
  if (!path) return { ok: false, reason: 'unreachable_target' };
  if (path.length === 0) return noopRestore(state);

  // 预检的 `path` 按定义不含目标节点，而物化读的恰好是目标自己的 ChangeSet——补上这一个，
  // 「认不出的实体」才在两处都是失败出口，而不是一次 encode 抛错。
  const incompatible = await findFirstReplayIncompatibility(executor, context.codec, [...path, target.commitId]);
  if (incompatible) return { ok: false, reason: 'incompatible_schema', incompatible };

  const entries = await materializeTarget(executor, context, token.branchId, target);
  if (entries.length === 0) return noopRestore(state);
  return writeRestore(executor, context, {
    branchId: token.branchId,
    state,
    headRevision: ref.headRevision,
    targetCommitId: target.commitId,
    entries
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
 * 判据是 `activeKey IS NOT NULL`，与 `status.ts` 的 `readRestoreBits` **同一个**：改判成
 * `status = 'active'` 看着等价，区别在 `conflicted` —— 那种会话的 `activeKey` 仍然占着索引、仍然
 * 要被用户处理掉，按状态筛会让它在这个入口上凭空消失，而唯一索引那边它还在。
 *
 * 「至多一行」由 `activeKey` 的可空唯一索引保证，`limit: 1` 只是把这条不变量写进查询本身：
 * 真出现第二行时，这里安静地取第一行，而不是让调用方拿到一个它无法解释的数组。
 */
export const readActiveRestoreSession = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<WorkingTreeRestoreSessionInfo | null> => {
  const [session] = await executor.getRepository(WorkingTreeRestoreSession).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: branchId },
        { field: 'activeKey', operator: 'notNull' }
      ]
    },
    limit: 1
  });
  if (!session) return null;
  return {
    id: session.id,
    branchId: session.branchId,
    targetCommitId: session.targetCommitId,
    status: session.status
  };
};
