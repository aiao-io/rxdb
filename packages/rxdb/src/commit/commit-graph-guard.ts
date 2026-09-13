/**
 * @fileoverview 共享的提交图损坏守卫（FR-022/051、SC-013，契约见 contracts/core-api.md §7）
 *
 * @remarks
 * **这是唯一一份。** US-306 阶段 B 的 `commit()`、US-307 的 `restore()`、US-308 的
 * switch-to 各自在自己的写事务内调用 {@link assertCommitGraphIntact}（R10）。各写一份的
 * 代价不是重复代码，是三处对「什么算损坏」给出三种答案：`commit()` 放行的图，
 * `restore()` 拒绝，用户拿到的是「刚提交成功的东西恢复不回来」。
 *
 * **可达性是判定的全部依据。** 表里有一条坏记录 ≠ 这个分支坏了。CAS 输掉的那次提交、
 * 被删分支留下的节点，行都还在却没有任何 ref 指向它们；把它们算进去，一条谁都够不到的
 * 坏记录会让整个库停摆，而它对任何一次重放都没有影响。反过来，孤立损坏也**不删**——
 * 「顺手清掉坏记录」会让事后诊断失去唯一的证据。
 *
 * **沿完整父链走，不只走 `firstParentId`。** 后者是带索引的冗余列，遍历它更快，
 * 代价是 merge 节点的第二父整棵子树没被看过——那恰好是最可能出问题的那部分历史。
 *
 * **校验只读；落标记是另一个符号、另一个事务。** 守卫跑在调用方的写事务里，而调用方
 * 命中损坏后一定回滚：标记写在这里会跟着一起消失，用户看到操作失败，库里却什么记录
 * 都没留，下一次调用重新走一遍全链，永远诊断不出来。所以 {@link markBranchCorrupted}
 * 独立成一个符号，由调用方在**回滚之后**另起一个事务调用。
 *
 * **fail-closed，不自动挑一个「还能用」的状态。** 回退到上一个校验通过的 commit、清空
 * 工作树、或退化成内存模式，都能让界面继续转——代价是用户的数据在他不知情的时候被换掉了。
 * 保留原 ref、不删记录、拒绝操作，是唯一诚实的处理。
 */

import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { computeCommitContentFingerprint } from './change-unit.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import { CommitErrorCode } from './commit-error-codes.js';
import type { Commit } from './commit.entity.js';
import { loadCommitsByIds, readCommitBranchRef } from './list-commits.js';

/** 一次损坏命中的成因。 */
export type CommitGraphCorruptionReason =
  /** 该分支此前已被 {@link markBranchCorrupted} 标记；不再重新遍历，直接继续拒绝 */
  | 'branch_marked_corrupted'
  /** 可达父链指向一个读不回来的 commit */
  | 'missing_commit'
  /** 按落库内容重算的指纹与 `contentFingerprint` 对不上 */
  | 'fingerprint_mismatch'
  /** `changeSetCount` 与实际 ChangeSet 行数对不上 */
  | 'change_set_count_mismatch';

/**
 * 提交图上命中了**可达**损坏。
 *
 * @remarks
 * 携带的三个值都是身份或枚举：分支 id、命中处的 commit id、成因。**不带** message /
 * author / patch——`errorSurfaceOf` 会把错误的自有属性整体序列化，patch 是明文，
 * 进日志等于把加密列的明文写进了日志（FR-038）。
 */
export class CommitGraphCorruptedError extends RxDBError {
  /**
   * 稳定错误码，恒为 {@link CommitErrorCode.commit_graph_corrupted}
   *
   * @remarks
   * 三条入口抛的是同一个码，因为对调用方而言它们是同一件事：这个分支现在只读。
   */
  readonly code: CommitErrorCode = CommitErrorCode.commit_graph_corrupted;

  constructor(
    /** 命中损坏的分支 */
    readonly branchId: string,
    /** 命中处的 commit；分支已被标记而未重新遍历时是该分支的 HEAD，空分支为 `null` */
    readonly commitId: string | null,
    /** 见 {@link CommitGraphCorruptionReason} */
    readonly reason: CommitGraphCorruptionReason
  ) {
    super(`Commit graph of branch '${branchId}' is corrupted at commit '${commitId ?? '<none>'}' (${reason}).`);
    this.name = 'CommitGraphCorruptedError';
    Object.setPrototypeOf(this, CommitGraphCorruptedError.prototype);
  }
}

/** 把一行 ChangeSet 还原成进摘要的那九列。 */
const toUnitContent = (row: CommitChangeSet): CommitChangeUnitContent => ({
  unitId: row.unitId,
  transactionId: row.transactionId,
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId,
  operation: row.operation,
  patch: row.patch,
  inversePatch: row.inversePatch,
  origin: row.origin
});

/**
 * 校验单个 commit 的内容自洽性。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 发起校验的分支，只用于组装错误
 * @param commit - 待校验的节点
 * @throws {@link CommitGraphCorruptedError} 指纹或 ChangeSet 行数对不上时
 *
 * @remarks
 * 两项检查的顺序不可换：行数少一行时指纹仍然对得上（重算用的就是实际这几行），
 * 所以先比指纹能把「内容被改过」与「行数被改过」分成两个可区分的成因；反过来，
 * 先比行数会让一次内容篡改在行数也恰好被动过时报出错误的成因。
 *
 * `sequence` 升序排在 JS 侧做，不依赖后端返回顺序：摘要按 `sequence` 发放的顺序合成，
 * 顺序错了，一个完全健康的 commit 会被判成损坏。
 */
const assertCommitIntact = async (executor: TransactionExecutor, branchId: string, commit: Commit): Promise<void> => {
  const changeSets = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commit.id }] }
  });
  const units = [...changeSets].sort((left, right) => left.sequence - right.sequence).map(toUnitContent);
  const fingerprint = computeCommitContentFingerprint({
    kind: commit.kind,
    parentIds: commit.parentIds,
    message: commit.message,
    author: commit.author,
    units
  });
  if (fingerprint !== commit.contentFingerprint) {
    throw new CommitGraphCorruptedError(branchId, commit.id, 'fingerprint_mismatch');
  }
  if (changeSets.length !== commit.changeSetCount) {
    throw new CommitGraphCorruptedError(branchId, commit.id, 'change_set_count_mismatch');
  }
};

/**
 * 取本层节点，一个都不许少。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 发起校验的分支，只用于组装错误
 * @param ids - 本层要取的 id
 * @returns 本层节点，顺序与 `ids` 一致
 * @throws {@link CommitGraphCorruptedError} 任一 id 读不回来时
 *
 * @remarks
 * 与读路径共用 {@link loadCommitsByIds}，但结论相反：那里把读不回来的 id 丢掉继续走
 * （一次历史浏览不该因为别处的损坏而失败），这里少一行就是断链——重放到这里会停，
 * 而更早的历史再也拼不出来。
 */
const loadLevelStrict = async (
  executor: TransactionExecutor,
  branchId: string,
  ids: readonly string[]
): Promise<Commit[]> => {
  const level = await loadCommitsByIds(executor, ids);
  if (level.length === ids.length) return level;
  const found = new Set(level.map(commit => commit.id));
  const missing = ids.find(id => !found.has(id));
  throw new CommitGraphCorruptedError(branchId, missing ?? null, 'missing_commit');
};

/**
 * 由本层节点算出下一层要取的 id。
 *
 * @param level - 本层已取回的节点
 * @param seen - 已入队过的 id；本函数就地登记
 * @returns 下一层的 id
 *
 * @remarks
 * `seen` 是这轮遍历唯一的终止条件。提交图理论上无环，但一个被篡改过的库可以有环，
 * 而守卫恰好是唯一会在这种库上跑的东西——没有 visited 集合，它就从「拒绝操作」
 * 变成「挂起」，调用方连错误都拿不到。环本身不判成损坏：它不影响任何一次可达性重放
 * 的结论，判它等于多造一种只有守卫自己认得的损坏。
 */
const nextParents = (level: readonly Commit[], seen: Set<string>): string[] => {
  const next: string[] = [];
  for (const commit of level) {
    for (const parentId of commit.parentIds) {
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      next.push(parentId);
    }
  }
  return next;
};

/**
 * 校验一个分支的提交图完整可用；**只读，不写任何东西**。
 *
 * @param executor - 调用方**自己那个写事务**的执行器
 * @param branchId - 待校验的分支
 * @throws {@link CommitGraphCorruptedError} 可达父链上命中损坏时
 * @throws {@link RxDBError} 分支 ref 缺失时（那是迁移没跑完，不是损坏）
 *
 * @remarks
 * 调用点是 `commit()` / `restore()` / switch-to 三处，各自在写事务内、真正落盘之前调用；
 * 命中即回滚整个事务，业务表零变化。回滚之后若要留下持久诊断，另起事务调用
 * {@link markBranchCorrupted}。
 *
 * 已被标记为 `corrupted_read_only` 的分支直接继续拒绝，不重新遍历：标记是一个闩，
 * 不是一次缓存。重新遍历意味着有人把坏节点删掉之后这个分支会自己「痊愈」，
 * 而那时历史已经少了一截，没有任何记录说明少的是什么。
 *
 * 空分支（`headCommitId === null`）通过：刚跑完 `0004`、一次都没提交过的库就是这个状态。
 */
export const assertCommitGraphIntact = async (executor: TransactionExecutor, branchId: string): Promise<void> => {
  const ref = await readCommitBranchRef(executor, branchId);
  if (ref.status !== 'ok') {
    throw new CommitGraphCorruptedError(branchId, ref.headCommitId, 'branch_marked_corrupted');
  }
  if (ref.headCommitId === null) return;

  const seen = new Set<string>([ref.headCommitId]);
  let frontier: string[] = [ref.headCommitId];
  while (frontier.length > 0) {
    const level = await loadLevelStrict(executor, branchId, frontier);
    for (const commit of level) await assertCommitIntact(executor, branchId, commit);
    frontier = nextParents(level, seen);
  }
};

/**
 * 把命中损坏的分支置为 `corrupted_read_only`，留下持久诊断。
 *
 * @param executor - **另一个**事务的执行器，不是命中损坏那个事务的
 * @param error - {@link assertCommitGraphIntact} 抛出的那个错误
 *
 * @remarks
 * 只动 `status` 与 `corruptedAt` 两列。**不动 HEAD、不删记录**：自动回退到较早 commit
 * 或清空历史都能让界面继续转，代价是用户的数据在他不知情时被换掉（FR-022）。
 *
 * `corruptedAt` 是「什么时候开始坏的」，因此只在第一次落标记时写。已是
 * `corrupted_read_only` 就直接返回——每次拒绝都刷新会把它变成「最后一次尝试时间」，
 * 事后再也回答不了「坏了多久」。判据取自库里刚读到的那一行而不是进程里的缓存：
 * 这是事务内读改写，不是调用方捕获型 CAS（FR-032）。
 */
export const markBranchCorrupted = async (
  executor: TransactionExecutor,
  error: CommitGraphCorruptedError
): Promise<void> => {
  const ref = await readCommitBranchRef(executor, error.branchId);
  if (ref.status !== 'ok') return;
  await executor.getRepository(CommitBranchRef).update(ref, {
    status: 'corrupted_read_only',
    corruptedAt: new Date()
  });
};
