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
 * **逐层查，不逐个查。** 节点与它的 ChangeSet 都按 BFS 的一层合成一次 `in`：守卫要在
 * `commit()` / `restore()` / switch-to 三条写路径上各跑一遍全图，逐个查的往返数等于节点数，
 * 而那个数字随历史长度无上限地涨。
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

import type { LocalRxDBAdapter, TransactionExecutor } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import type { CommitChangeUnitContent } from './change-unit.js';
import { computeCommitContentFingerprint } from './change-unit.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import { CommitErrorCode } from './commit-error-codes.js';
import type { Commit } from './commit.entity.js';
import { loadCommitsByIds, nextFrontier, readCommitBranchRef } from './list-commits.js';

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
 * 本层 ChangeSet 的分组；键集合恒等于本层的 commit id 集合。
 */
type LevelChangeSets = ReadonlyMap<string, CommitChangeSet[]>;

/**
 * 取整层的 ChangeSet，按 `commitId` 分回各自的桶。
 *
 * @param executor - 当前事务执行器
 * @param level - 本层已取回的节点
 * @returns 本层的分组，键集合恒等于 `level` 的 id 集合
 *
 * @remarks
 * 逐个 commit 一次 `=` 查询在 100 个节点的线性历史上就是 100 次往返，而守卫在
 * `commit()` / `restore()` / switch-to 三条写路径上都要跑一遍全图——这个代价直接乘到
 * 每一次提交上。合成一次 `in` 之后，查询数从「每节点一次」降到「每层一次」。
 *
 * **空桶先铺好。** `changeSetCount` 为 0 的节点是合法的（启用提交能力时写下的基线根就是
 * 这个形状），它在批量查的结果里一行都没有。取的时候必须能拿到「空」，而不是「没有这个键」
 * ——后者只能在调用点补一个 `?? []`，那样「这个 commit 根本不在本层」这种真正的编程错误
 * 也被一并兜掉了。
 */
const loadLevelChangeSets = async (
  executor: TransactionExecutor,
  level: readonly Commit[]
): Promise<LevelChangeSets> => {
  const grouped = new Map<string, CommitChangeSet[]>(level.map(commit => [commit.id, []]));
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: 'in', value: level.map(commit => commit.id) }] }
  });
  for (const row of rows) bucketOf(grouped, row.commitId).push(row);
  return grouped;
};

/**
 * 取某个 commit 的桶；没有这个键就是分组与本层脱了节。
 *
 * @param grouped - {@link loadLevelChangeSets} 的产物
 * @param commitId - 本层的某个 commit id
 * @returns 该 commit 的 ChangeSet 行；一行都没有时是空数组
 * @throws {@link RxDBError} 分组里没有这个键时
 *
 * @remarks
 * 键集合恒等于本层的 id 集合，所以这一支正常跑不到；它挡的是 `in` 的条件被改坏之后
 * 批量查带回了本层之外的行——那时「多出来的行进了谁的桶」决定了一个健康的 commit
 * 会不会被判成损坏，安静地丢掉它等于让一条写错的 where 继续伪装成正确的。
 */
const bucketOf = (grouped: LevelChangeSets, commitId: string): CommitChangeSet[] => {
  const bucket = grouped.get(commitId);
  if (!bucket) {
    throw new RxDBError(`Level change-set grouping has no bucket for commit '${commitId}'.`);
  }
  return bucket;
};

/**
 * 校验单个 commit 的内容自洽性。
 *
 * @param branchId - 发起校验的分支，只用于组装错误
 * @param commit - 待校验的节点
 * @param changeSets - 该 commit 的 ChangeSet 行，来自 {@link loadLevelChangeSets}
 * @throws {@link CommitGraphCorruptedError} 指纹或 ChangeSet 行数对不上时
 *
 * @remarks
 * **两项检查的顺序不可换，而且是行数在前。** 摘要把 `u${units.length}:` 也折了进去
 * （见 {@link computeCommitContentFingerprint}），所以少一行时**两项同时不成立**——重算的指纹
 * 用的是实际剩下的这几行，与落库的那个值必然对不上。先比指纹的那一版里，
 * `change_set_count_mismatch` 这一支根本走不到：每一次丢行都被报成 `fingerprint_mismatch`，
 * 两个成因塌成一个。而两者的处置并不相同——「行数被改过」要去查谁删的行（重放会静默少还原
 * 一个单元），「内容被改过」要去查谁改的值。行数排前面，是因为它是**更窄**的那个判据：
 * 它成立时指纹必然也不成立，反之不然，于是它一成立就是确定的成因。
 *
 * `sequence` 升序排在 JS 侧做，不依赖后端返回顺序：摘要按 `sequence` 发放的顺序合成，
 * 顺序错了，一个完全健康的 commit 会被判成损坏。批量查回来的整层行更是没有任何顺序可言。
 */
const assertCommitIntact = (branchId: string, commit: Commit, changeSets: readonly CommitChangeSet[]): void => {
  const units = [...changeSets].sort((left, right) => left.sequence - right.sequence).map(toUnitContent);
  const fingerprint = computeCommitContentFingerprint({
    kind: commit.kind,
    parentIds: commit.parentIds,
    message: commit.message,
    author: commit.author,
    units
  });
  if (changeSets.length !== commit.changeSetCount) {
    throw new CommitGraphCorruptedError(branchId, commit.id, 'change_set_count_mismatch');
  }
  if (fingerprint !== commit.contentFingerprint) {
    throw new CommitGraphCorruptedError(branchId, commit.id, 'fingerprint_mismatch');
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
 *
 * **每次调用都走完整可达父链，代价是 O(N)——这不是没优化，是 FR-051 的字面要求。**
 * 四个调用点（`commit()` / `discard()` / `restore()` / switch-to）都无条件跑一遍全图，
 * 于是每一次保存都要把整条历史的全部变更单元重哈希一遍；一万次提交的库，每次保存都付这个价。
 * 想降量级只有一条路：在 ref 上持久化一个「最后已验证 HEAD」水位，BFS 走到水位就剪掉。
 * 剪枝在模型内是**可靠**的（提交不可变、只追加，已验证祖先不会再变），但它剪掉的恰恰是
 * FR-051 写明的那件事——「MUST 从每个 branch ref 遍历**完整**可达父链」——而 SC-013 要求
 * 「HEAD 或**可达祖先**损坏时三条入口各自返回 `commit_graph_corrupted`」：水位之下的祖先
 * 被存储层损坏（OPFS 部分写、页损坏、IDB 驱逐）之后，`commit()` 不再报它，而冷重放会把那段
 * 坏历史照样放出来。所以这是一次**规格变更**（要同时改 FR-051 的 MUST 与 SC-013 的验收），
 * 不是一次性能重构，不能在清理轮里顺手落地——判据与顺延记录见
 * `requirements/roadmap.md` 的「epic-006 评审顺延的架构项」。
 *
 * 同一份水位也是 `list-commits.ts` 那边「BFS 每层一次往返」的前提：`Commit` 上没有
 * `branchId` 列，一次查回整条分支无从查起，要省掉往返得先有一份按分支存的派生结构——
 * 与水位是同一份状态，两条必须一起改，否则状态机要扩张两遍。
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
    const grouped = await loadLevelChangeSets(executor, level);
    for (const commit of level) assertCommitIntact(branchId, commit, bucketOf(grouped, commit.id));
    frontier = nextFrontier(level, seen);
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
 *
 * **`new Date()` 用的是客户端时钟，这是有意的，不是漏改。** 本仓的时钟口径按「谁能给这一列
 * 赋值」分成三档，`corruptedAt` 落在第三档：
 *
 * 1. **不可变历史列走库默认值**：`Commit.createdAt` 声明成 `default: 'CURRENT_TIMESTAMP'` +
 *    `readonly`，构造期一个字都不写（FR-010，见 `write-commit.ts` 的 `buildCommitRows`）。
 *    客户端时钟漂移不该被写进永远改不了的历史。
 * 2. **raw CAS 里的时刻走 `sqlTimestampLiteral(new Date())`**：`commit-capability.ts` 的
 *    `enabledAt` 与 `branch-materialization.ts` 的 `updatedAt` 都是这个形状。`CURRENT_TIMESTAMP`
 *    在 SQLite 上求值成 `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上
 *    （`branch-materialization.ts` 的 `buildActiveBranchSwitchStatements` 写明了这条）。
 * 3. **仓储层的读改写只能给 JS 值**：这里走的是 `getRepository().update()`，而仓储层没有
 *    「这一列填一段 SQL 表达式」的口子。`corruptedAt` 又是「首次损坏时刻」，没有列默认值
 *    可用——默认值只在 INSERT 时求值，而这一行早在建库迁移里就插进去了。
 *
 * 代价是这个时刻的偏差上限等于客户端时钟漂移。可接受：它是**诊断值**，不参与指纹、不参与
 * 任何比较，也没有第二个时刻要和它排序。统一到数据库时钟要先给仓储层加写 SQL 表达式的能力，
 * 那是架构项，不在本函数的范围内。
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

/**
 * 在**另一笔事务**里把损坏标记落住；不是 {@link CommitGraphCorruptedError} 就什么都不做。
 *
 * @param adapter - 本纪元的本地适配器；本函数自己开事务
 * @param error - 刚把某次操作打回去的那个错误；类型是 `unknown`，由本函数认
 *
 * @remarks
 * 存在的理由是一条时序：{@link assertCommitGraphIntact} 跑在调用方那笔**注定回滚**的事务里，
 * 而 {@link markBranchCorrupted} 要写的两列必须留得住。写在同一笔事务里的标记会跟着回滚一起
 * 消失，于是每一次重试都重新扫一遍全图（`branch_marked_corrupted` 这条捷径永远走不到），
 * 而「什么时候开始坏的」这个诊断永远缺席。
 *
 * **绝不抛出。** 两个调用点——{@link WorkingTreeManager.runEnabled} 的 catch 与
 * `RxDBSystemContribution.settleBranchSwitchFailure`——都紧接着要把原始错误重新抛出去；
 * 从这里抛出的任何东西都会顶替掉它，于是用户拿到的是「落标记时数据库忙」，而不是
 * 「这条分支的历史重放不出来」。落标记是**附加**的，落不下来不改变那次操作已经失败这件事。
 *
 * 类型判定用 `instanceof` 而不是比 `code`：同一个码另有两条入口（见
 * {@link CommitGraphCorruptedError} 的 @remarks），而这里要取的是 `branchId` 这个**自有属性**
 * ——只有类型判定能把它带出来。
 */
export const latchBranchCorruption = async (adapter: LocalRxDBAdapter, error: unknown): Promise<void> => {
  if (!(error instanceof CommitGraphCorruptedError)) return;
  try {
    await adapter.transaction(executor => markBranchCorrupted(executor, error));
  } catch {
    /* 见 @remarks：这一笔失败了也不能顶替掉调用方手上那个真正的错误 */
  }
};
