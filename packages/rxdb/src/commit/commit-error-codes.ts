/**
 * @fileoverview 跨故事共享的提交错误码（contracts/core-api.md §7）
 *
 * @remarks
 * epic-006 的八个稳定错误码集中在这里，因为它们**跨故事**：US-305 的迁移、
 * US-306 的写入口门禁、US-307 的恢复、US-308 的分支物化各自会抛其中几条，
 * 而判别这些码的调用方分散在六个适配器与三个框架绑定里。散着写字面量的代价不是
 * 编译错误，是某一处拼写漂了之后，另一端的 `catch` 分支安静地不再命中。
 *
 * **为什么不用 `enum`**：`RxDBMixedVersionedCacheTransactionError.code` 早就在用
 * 裸字符串字面量，既有测试与适配器都写着 `code === 'mixed_versioned_cache_transaction'`。
 * 字符串 enum 的成员类型是**标称**的，与字符串字面量比较会被 TS 判成「无重叠」直接报错——
 * 换 enum 等于要求所有既有调用方同步改写。const 对象 + 派生联合类型给出同样的
 * `CommitErrorCode.xxx` 书写手感，而值的静态类型仍是普通字符串字面量。
 *
 * **`benchmark_environment_mismatch` 不在这里**：它与本组码同列于 core-api.md §7 的
 * 那张表，但它是 benchmark 跑分器在 `runnerProfileHash` 不匹配却被要求走绝对门禁时的结论
 * （见 contracts/benchmark-report.md），不是数据库命令的错误。把它放进运行时库的公开面，
 * 等于声称某个 `commit()` 可能因为跑分环境不对而失败。
 *
 * **`CommitConflict` 不在这里**：core-api.md §7 明确它是**返回值不是异常**。CAS 失败时
 * 命令返回一个诊断值，不抛、也不落第二张会与真实 revision 漂移的冲突表（FR-035）。
 *
 * **`stale_active_branch` 尚未登记**：它由 US-308 的 activation 维度定义（FR-020）。
 * 落地时应追加到本模块并补测试，**不要**在写路径里直接写字面量——那正是本模块要消除的形态。
 */

/**
 * 提交能力的稳定错误码
 *
 * @remarks
 * 值即对外可见的码字符串：它会进日志、错误上报与跨 realm 的判别分支，**不得改名**。
 * 键与值逐字相同，由 `__tests__/commit/commit-error-codes.spec.ts` 钉死。
 */
export const CommitErrorCode = {
  /**
   * 未启用提交能力的数据库上调用了 `enable()` / `isEnabled()` 以外的成员。
   *
   * @remarks
   * 与「静默降级成空实现」相对：未启用时库的行为必须与 v3 完全一致（FR-046），
   * 所以这些成员既不能假装成功、也不能返回空结果，只能在入口拒绝。
   */
  commit_capability_disabled: 'commit_capability_disabled',

  /**
   * 写入绕过了工作树捕获——raw 写路径或批量写方法命中了版本化业务实体表。
   *
   * @remarks
   * 三处共用本码：
   * - adapter 五步 bypass 判定的第 4 步（写目标表 ∩ 版本化业务实体表 ≠ ∅ **且**
   *   被写列集 ⊄ untracked 字段域），见 contracts/adapter-contract.md；
   * - `upsertMany()` / `deleteByIds()` 这两个够不到 `rawQuery` 的公开批量写方法；
   * - `EntityManager.notifyExternalUpdate()` 对版本化实体。
   *
   * 拒绝发生在**语句执行前**，业务表零变化——不是写完再回滚。目标表或列集无法确定时
   * 按拒绝处理（fail-closed），宁可误伤。
   *
   * 同一个码也用于「已启用的库遇到未声明该能力或协议版本不匹配的 writer」（FR-037）：
   * 两者是同一件事——有人正在裸写版本化业务表。
   */
  commit_capability_mismatch: 'commit_capability_mismatch',

  /**
   * 提交图上命中了**可达**损坏——`commit()` / `restore()` / switch-to 三条入口各自返回它。
   *
   * @remarks
   * 「可达」指从该分支 ref 沿完整父链能走到的损坏。孤立损坏（不在任何 ref 的可达链上）
   * 单独隔离，其他分支照常可用，**不抛本码**。
   *
   * 可达损坏使该分支 `corrupted_read_only`：仍可读取不依赖重放的当前投影、导出诊断、
   * 切离该分支；但 MUST NOT 自动回退到较早 commit、空工作树或内存模式——那会把
   * 「数据损坏」伪装成「数据就是这样」。判定由 FR-051 要求的**共享 guard** 实现，
   * 三条入口在各自写事务内调用同一份，不各写一份。
   */
  commit_graph_corrupted: 'commit_graph_corrupted',

  /**
   * 发现 `RxDBBranch.activated` 有多行为真。
   *
   * @remarks
   * 首次启用迁移命中即整条迁移回滚，**不按查询顺序猜一个**（FR-048）。「按顺序取第一条」
   * 不是容错而是掷骰子：两行 active 时，用户的未提交条目挂在哪条分支上没有答案，
   * 而猜错的那一半会被当成「另一条分支的历史」写进提交图。
   *
   * 零行 active 不走本码，走 {@link CommitErrorCode.no_active_branch}。
   *
   * `activationRevision` 只防并发切换，**替代不了**这条基数不变量：它能告诉你「切换过了」，
   * 不能告诉你「现在有两个 active」。
   */
  ambiguous_active_branch: 'ambiguous_active_branch',

  /**
   * 运行期发现一行 active 分支都没有。
   *
   * @remarks
   * 与 {@link CommitErrorCode.ambiguous_active_branch} 是同一条基数不变量的两侧，但只有
   * 这一侧非它不可：「至多一个」由 `rxdb_branch.activeKey` 的唯一约束在 schema 层拦住，
   * 「至少一个」是一张**空表**也满足的条件，任何列约束都表达不了。
   *
   * 只有**运行期**入口抛本码。迁移期不抛：那一侧沿用既有 `resolve_current_branch` 语义
   * 修复（优先激活 `main`，没有则创建）。两者的差别不是严格程度，是时点——迁移是唯一
   * 一个「库里还没有 active 分支」属于正常状态的时刻。
   *
   * 运行期 MUST NOT 顺手修复：「有 `main` 就当没事」会把用户从 `feature-x` 静默挪到
   * `main`，未提交条目还挂在 `feature-x` 上，界面却显示一个干净的空工作树。
   */
  no_active_branch: 'no_active_branch',

  /**
   * 首次启用迁移时，某个**本地**分支无法沿 `RxDBChange` 链无缺口物化。
   *
   * @remarks
   * 迁移**整体失败**，不留下部分启用状态（FR-049）。断链的成因包括已被清理的 change、
   * 被压缩掉的区间、无法配平的回滚标记。判定复用既有分支物化路径，MUST NOT 为迁移
   * 另写第二套重放引擎。
   *
   * 唯一例外是 metadata-only 远端分支：它此时**不**创建 baseline 或 `CommitBranchRef`，
   * 也不因此判失败——它的首次物化归 US-308，失败码是
   * {@link CommitErrorCode.branch_not_materialized}。
   */
  branch_not_materializable: 'branch_not_materializable',

  /**
   * metadata-only 远端分支**首次切换**时物化依据不足。
   *
   * @remarks
   * 与 {@link CommitErrorCode.branch_not_materializable} 是两个时点、两种主体，不可互换：
   * 前者是迁移期对既有**本地**分支的可物化性判定，后者是运行期对**远端** metadata-only
   * 分支的一次物化尝试。
   *
   * 全量回滚，来源分支保持 active，**不留下部分目标投影**；只留可安全重试 / 按 attempt
   * 清理的 durable staging（FR-044）。成因包括网络失败、sync scope 漂移、配额不足、不收敛。
   */
  branch_not_materialized: 'branch_not_materialized',

  /**
   * tracked 与 untracked 实体混进了同一个事务单元。
   *
   * @remarks
   * 抛出即**回滚整个事务**（FR-046）。两者写语义不可调和：版本化实体写本地并进 changelog，
   * QueryCache 实体先写远端再落可丢弃缓存；同批只会得到「一半进了变更历史、一半没有」。
   *
   * 承载者是既有的 `RxDBMixedVersionedCacheTransactionError`，它先于本模块存在。
   * `origin='remote_sync'` **不是** untracked——来源不改变是否被捕获。
   */
  mixed_versioned_cache_transaction: 'mixed_versioned_cache_transaction'
} as const;

/**
 * {@link CommitErrorCode} 的值联合
 *
 * @remarks
 * 与同名常量声明合并，`CommitErrorCode` 因此既可当值用（`CommitErrorCode.xxx`）
 * 也可当类型用，书写手感与 enum 一致，但成员类型是普通字符串字面量而非标称类型。
 */
export type CommitErrorCode = (typeof CommitErrorCode)[keyof typeof CommitErrorCode];

/**
 * 全部提交错误码，顺序即 {@link CommitErrorCode} 的声明顺序
 *
 * @remarks
 * 从常量派生而不是另抄一份数组：手抄的清单漏一条不会有任何一处编译失败。
 */
export const COMMIT_ERROR_CODES: readonly CommitErrorCode[] = Object.values(CommitErrorCode);

/** {@link COMMIT_ERROR_CODES} 的查表形态，供 {@link isCommitErrorCode} 用。 */
const COMMIT_ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(COMMIT_ERROR_CODES);

/**
 * 判定一个值是否为已登记的提交错误码
 *
 * @param value - 待判定的值，通常取自 `catch` 到的对象上的 `code`
 * @returns 命中 {@link COMMIT_ERROR_CODES} 时为 `true`
 *
 * @remarks
 * 收窄到 {@link CommitErrorCode}，让调用方能在 `switch` 里拿到穷尽性检查。
 * 未登记的字符串（如尚未落地的 `stale_active_branch`）与非字符串一律为 `false`。
 *
 * @example
 * ```ts
 * try {
 *   await database.commit('保存草稿');
 * } catch (error) {
 *   const code: unknown = (error as { code?: unknown }).code;
 *   if (isCommitErrorCode(code) && code === CommitErrorCode.commit_graph_corrupted) {
 *     // 该分支 corrupted_read_only：只能读当前投影与导出诊断
 *   }
 *   throw error;
 * }
 * ```
 */
export const isCommitErrorCode = (value: unknown): value is CommitErrorCode =>
  typeof value === 'string' && COMMIT_ERROR_CODE_SET.has(value);
