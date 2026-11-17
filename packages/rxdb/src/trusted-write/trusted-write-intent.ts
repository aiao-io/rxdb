/**
 * @fileoverview 受信写意图与 15 行调用点登记表（epic-006「受信调用点登记表」）。
 *
 * @remarks
 * 意图是「我知道我在重写业务投影，并且我会自己维护工作树」
 * 这句话的可判定形式。做成公开参数的话，任何调用方都能给自己发一张豁免票——而这张票决定的是写入口
 * 语义矩阵取哪一行：同一个 `switchBranch`，分支物化必须**不**产生工作树单元，undo/redo 必须产生。
 *
 * **它不是 raw 通道的豁免票；那一步已经不存在了。** raw 的 bypass 判定曾有过「携带受信 `intent`
 * → 放行」的一步，2026-09-23 连同上下文槽位一起删除：本表的条目全部走**带类型的**写原语
 * （`switchBranch` / `mergeChanges` / `transaction`），一个 raw 调用点都没有，于是那一步在生产里
 * 永远取不到真值——却是整条防线上唯一无条件放行的一步
 * （`git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §3）。
 *
 * **登记键是「文件 + 符号 + 意图」，不是行号。** 行号每次格式化都在变，登记表会在第一次 prettier
 * 之后全面失配；而符号取的是**实际发起那次批量重写的最内层具名函数**，不是委托门面——门面会被重构
 * 成另一个门面，发起写的那个函数不会。
 *
 * **同文件里语义不同的两个策略分支各占一行**（#5 逐条合并 / #6 压缩合并）。合成一行会让其中一条策略
 * 失去登记：漂移扫描看到「`merge-branch.ts·merge_branch` 已登记」就不再追问是哪条分支在写。
 *
 * **登记表跨两个写原语。** `switchBranch` 与 `mergeChanges` 各占一部分——只在 `mergeChanges` 上挂门禁
 * 会整体漏掉撤销与分支物化面。metadata-only 接管路径两边各占一行：#10 是它发起的那次
 * `switchBranch`，#11 是屏障在那次切换的 `prepare` 里落投影的 `mergeChanges`；漏掉任何一行，
 * 那一半物化面就会被挂载点按 `crud` 或拒绝处理。
 *
 * **`writePrimitive` 一列里 `mergeChanges` 的 11 行全是 `executor.`，没有 `adapter.`。** 声明的作用域
 * 每次只存一条，而 `mergeChanges` 的取用发生在排队拿到事务之后，绑适配器实例就留下一个并发覆盖
 * 窗口（见 {@link declareTrustedWrite} 所在文件的头注）。这一列因此也是一条不变量，不只是说明。
 *
 * **调用点全部住在插件里**：#1~#6 自 US-025 起在 `@aiao/rxdb-plugin-history/src/`，
 * #7~#9 与 #12 在 `@aiao/rxdb-plugin-sync/src/`，#10 / #11 / #13 / #14 / #15 在 `@aiao/rxdb-plugin-working-tree/src/`。
 * 登记的是**文件基名**，不带包名也不带目录——键要跨 US-025 那次搬迁存活，而它确实跨过来了：
 * 搬迁只换了目录，没换文件名、符号名与意图。
 *
 * **但本模块仍然留在核心，而且只能留在核心。** 登记表是 `declareTrustedWrite()` 的准入名单，
 * 而那个函数在核心；两个插件互不依赖，谁都没资格持有一张另一个也必须满足的表。
 * 把表搬给其中一个，另一个就得反向依赖它，或者各存一份——各存一份的两张表迟早有一张是旧的。
 *
 * **代价是核心的 chromium 测试从此扫不到这 15 处声明**（`import.meta.glob` 进不了兄弟包）。
 * 那一半核对交给 `scripts/audit/working-tree-callsite-drift.mjs`（T066）：它跑在 node 里，
 * 扫整个 `packages/`，双向比对登记键、自报符号与存档行号。核心那份
 * （`__tests__/trusted-write/trusted-callsite-registry.spec.ts`）改守两件核心自己看得见的事——
 * 这张表与 epic-006「受信调用点登记表」逐格一致，以及**核心自身一处受信写、一处批量写都没有**。
 *
 * 「这一行会不会产生工作树单元」是插件的问题，那个函数（`producesWorkingTreeEntry`）留在插件侧。
 */

import type { WriteEntrance } from './write-entrance.js';

/**
 * 受信路径声明的写意图
 *
 * @remarks
 * 与 {@link WriteEntrance} 是两个维度，不能合并：意图是**调用点自报的身份**（登记表的一列），
 * 入口是**矩阵给出的分类**。两者多对一——#7/#8/#9/#12 四行都报 `remote_sync`，却分别落 `remote_entity_apply`
 * 与 `cleanup_expired` 两个入口。压成一个枚举之后，登记表就没法表达「同一个意图在两个地方」，
 * 而那正是漂移扫描要比对的东西。
 */
export const TrustedWriteIntent = {
  /** 切分支时把目标分支的状态物化到业务表（#1 普通切换 / #10 #11 metadata-only 接管）；投影重写，不产生单元 */
  branch_materialization: 'branch_materialization',
  /** 把某个实体恢复到历史状态（#2）；用户发起，必须产生单元 */
  restore_entity: 'restore_entity',
  /** 新写入使 redo 栈失效时的标记重写（#3）；投影重写，不产生单元 */
  redo_invalidation: 'redo_invalidation',
  /** 应用 undo / redo 历史（#4）；用户发起，必须产生单元 */
  undo_redo: 'undo_redo',
  /** 合并分支的逐条策略（#5） */
  merge_per_change: 'merge_per_change',
  /** 合并分支的压缩策略（#6）；与逐条策略各占一行 */
  merge_squash: 'merge_squash',
  /** 同步机制写入本地业务投影（#7/#8/#9/#12）；产生 `origin='remote_sync'` 的单元 */
  remote_sync: 'remote_sync',
  /**
   * 工作树命令改完逻辑工作树之后，把业务投影对齐成 HEAD + 条目（#13 discard 退回 HEAD / #14 restore 写成目标提交的
   * 数据，US-317）；投影重写，不产生单元
   *
   * @remarks
   * 一个意图两行，与 `branch_materialization` 横跨 #1 / #10 / #11 同理：意图回答「为什么写」——命令自己维护条目、
   * 业务表跟着条目走——「在哪写」由文件与符号两列回答。拆成 `discard` / `restore` 两个意图，等于把文件名再抄进意图一列。
   *
   * 它与 `restore_entity`（#2）不是一回事：那一条是用户发起的一次领域重算，回写本身**就是**那次编辑，必须落成单元；
   * 这里的条目由命令自己算好写下，回写再被捕获一次就是同一批改动记两遍。
   *
   * 触发器开着写（`mergeChanges(…, false)`）：回写是当前分支上的一次新写入，变更日志要跟着它走，切分支、同步与撤销栈
   * 才与业务表一致。分支物化（#1 / #11）关触发器，是因为它重放的是日志里已有的变更——两者入口相同、触发器相反。
   */
  working_tree_projection: 'working_tree_projection',
  /**
   * 导入远端提交：把第一父链上新到的每个提交的 ChangeSet 依次叠到业务表上，分支头随之快进（#15，US-316）；投影重写，不产生单元
   *
   * @remarks
   * 与 `remote_sync`（#7~#9 / #12）不是同一个意图，虽然写进来的都是远端数据：同步拉取写的是**不进提交历史**的远端状态，
   * 产生 `origin='remote_sync'` 的工作树单元、关着触发器写以免回推；导入写的是**已经是提交**的远端历史——HEAD 随之前移，
   * 业务表等于新 HEAD，工作树保持 clean，所以不产生单元，入口是投影重写。
   *
   * 与 `working_tree_projection`（#13 / #14）入口相同、意图不同：那两行是命令改完逻辑工作树之后让业务表跟上条目，
   * 这一行是让业务表跟上新的 HEAD，工作树一条都不动。合成一个意图，登记表就说不清「HEAD 会不会动」。
   *
   * 触发器开着写（`mergeChanges(…, false)`），与 #13 / #14 同一条理由：导入是当前分支上的一次新写入，切分支按变更日志撤投影、
   * 按日志重放，分支对比与合并预览读的也是日志——关掉的话，切走再切回来，导入的数据不会跟着分支走。代价是这些日志行
   * 对通用实体同步而言就是待推送的本地变更：导入命令因此拒绝写任何走 changelog 推送的实体（`needsPush()` 为真的那些），
   * 「导入与通用实体同步同时用在同一批实体上」不受支持。
   */
  remote_commit_import: 'remote_commit_import'
} as const;

/** {@link TrustedWriteIntent} 的值联合 */
export type TrustedWriteIntent = (typeof TrustedWriteIntent)[keyof typeof TrustedWriteIntent];

/**
 * 受信调用点实际调用的写原语
 *
 * @remarks
 * `adapter.` 与 `executor.` 前缀不是噪音：同一个 `mergeChanges` 经两个宿主到达，挂载点只挂在
 * adapter 上，走 executor 的那几行必须被单独登记才不会在漂移扫描里显示为「未登记的批量重写」。
 *
 * `adapter.transaction` 与另外三项不同：没有声明的 `transaction()` 是普通 CRUD，不是未知入口，
 * 所以它只在**自报了意图**时才进登记表。声明挂在这笔事务交出来的执行器上，挂载点 1 在
 * 事务体返回之后才取——声明因此要写在事务体的**末尾**，写在开头会被体内嵌套的受信原语先取走。
 * 今天没有一行用它（原 #10 于 2026-09-26 改走 `switchBranch`），仍留在联合里：挂载点 1 的取用
 * 语义还在，漂移扫描的词表也从这个联合解析。
 */
export type TrustedWritePrimitive =
  'adapter.switchBranch' | 'adapter.mergeChanges' | 'executor.mergeChanges' | 'adapter.transaction';

/**
 * 登记表的一行
 *
 * @remarks
 * 刻意**不带**「产生工作树单元」字段：那一列是矩阵的结论，抄在这里就成了第二份真相，而两份真相
 * 里迟早有一份是旧的。要这个答案就调插件侧的 `producesWorkingTreeEntry()`。
 */
export interface TrustedCallsite {
  /**
   * 文件**基名**，不带目录也不带包名
   *
   * @remarks
   * 刻意只存基名：#1~#6 在 `@aiao/rxdb-plugin-history/src/`、#7~#9 在 `@aiao/rxdb-plugin-sync/src/`，
   * 而 US-025 的抽包正是把它们从核心 `version/` 挪过去的那一次——存了目录，这张表就会在那一次
   * 全面失配，而失配的九行里没有一行是真的漂了。基名与符号名一起唯一定位一处调用点，
   * 重名由 T066 在全仓扫描时兜住（同名文件里出现同键声明会被报成重复登记）。
   */
  readonly file: string;

  /** 实际发起该次批量重写的最内层具名函数 */
  readonly symbol: string;

  /** 这一行调的是哪个写原语 */
  readonly writePrimitive: TrustedWritePrimitive;

  /** 调用点自报的意图 */
  readonly intent: TrustedWriteIntent;

  /** 该意图在写入口语义矩阵里的行 */
  readonly entrance: WriteEntrance;

  /** 本次核对时的行号；**仅供存档**，不参与登记键 */
  readonly verifiedAtLine: number;
}

/**
 * 与真实代码核对过的 15 行受信调用点（整表核对日期 2026-09-16）
 *
 * @remarks
 * 顺序与 epic-006「受信调用点登记表」的表格逐行一致，便于漂移扫描双向比对。
 *
 * 2026-09-16 这次核对是跟着 US-025 抽包做的：9 处声明整体从核心 `version/` 搬进了
 * history / sync 两个插件，键（文件基名 + 符号 + 意图）一个没变，`verifiedAtLine` 九行全变了。
 *
 * 2026-09-24 只刷新了 #7 / #8 两行：`pull-batch.ts` 与 `pull-repository.ts` 抽出了共用的
 * `pull-round.ts`（拆分自推变更、回填 `remoteId`），两处声明各自上移。**其余七行没有重新核对**，
 * 表头那个日期仍然只为 2026-09-16 那次整表核对背书——把日期一起改掉，等于替另外七行做了没做过的担保。
 *
 * 2026-09-25 新增 #10：评审发现 metadata-only 接管路径的物化屏障没有自报意图，挂载点 1 按 `crud`
 * 把整份快照记成一批未提交变更（真实后端回归在 `capture.suite.ts` 的 switchBranch 挂载点一节）。
 * 同样只核对了新增的这一行，表头日期照旧。
 *
 * 2026-09-26 重写 #10、新增 #11：接管路径不再自己开事务切 active，而是发起一次 `adapter.switchBranch()`
 * 把屏障放进 `prepare`（物化与切 active 同一个事务）。#10 因此换成那次 `switchBranch` 的声明
 * （符号 `switchWithMaterialization`），屏障里落投影的每一批 `executor.mergeChanges` 另占 #11
 * （符号 `applyMaterializedActions`）。只核对了这两行，表头日期照旧。
 *
 * 2026-10-05 新增 #12（US-218 阶段 B）：推送回执里被远端拒绝的实体，要在同一个事务里把本地业务行
 * 对齐到远端现状（远端有行就覆盖，远端无行就删除），走的是 `executor.mergeChanges(…, true)`。
 * 同样只核对了新增的这一行，表头日期照旧。
 *
 * 2026-11-17 新增 #13 / #14（US-317）：discard 与 restore 改完逻辑工作树之后，在同一个事务里把业务表对齐成
 * HEAD + 条目，各走一次 `executor.mergeChanges(…, false)`（触发器开着，理由见 {@link TrustedWriteIntent.working_tree_projection}）。
 * 只核对了新增的这两行，表头日期照旧。
 *
 * 2026-11-17 新增 #15（US-316）：导入远端提交时，第一父链上新到的每个提交各走一次 `executor.mergeChanges(…, false)`，
 * 把它的 ChangeSet 叠到业务表上（理由见 {@link TrustedWriteIntent.remote_commit_import}）。只核对了新增的这一行，表头日期照旧。
 */
export const TRUSTED_CALLSITE_REGISTRY: readonly TrustedCallsite[] = [
  {
    file: 'VersionManager.ts',
    symbol: 'switchBranch',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.branch_materialization,
    entrance: 'projection_rewrite',
    verifiedAtLine: 331
  },
  {
    file: 'restore-entity.ts',
    symbol: 'restore_entity',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.restore_entity,
    entrance: 'domain_recompute',
    verifiedAtLine: 94
  },
  {
    file: 'HistoryManager.ts',
    symbol: 'invalidateRedoStack',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.redo_invalidation,
    entrance: 'projection_rewrite',
    verifiedAtLine: 661
  },
  {
    file: 'undo-redo-apply.ts',
    symbol: 'applyUndoRedoHistories',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.undo_redo,
    entrance: 'domain_recompute',
    verifiedAtLine: 262
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.merge_per_change,
    entrance: 'domain_recompute',
    verifiedAtLine: 239
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.merge_squash,
    entrance: 'domain_recompute',
    verifiedAtLine: 280
  },
  {
    file: 'pull-batch.ts',
    symbol: 'pullBatchOnce',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 349
  },
  {
    file: 'pull-repository.ts',
    symbol: 'pullSingleRepository',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 627
  },
  {
    file: 'cleanup-expired.ts',
    symbol: 'cleanupExpired',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'cleanup_expired',
    verifiedAtLine: 208
  },
  {
    file: 'materialize-branch.ts',
    symbol: 'switchWithMaterialization',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.branch_materialization,
    entrance: 'projection_rewrite',
    verifiedAtLine: 313
  },
  {
    file: 'materialize-branch.ts',
    symbol: 'applyMaterializedActions',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.branch_materialization,
    entrance: 'projection_rewrite',
    verifiedAtLine: 360
  },
  {
    file: 'push-repository.ts',
    symbol: 'alignRejectedEntities',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 1392
  },
  {
    file: 'discard-command.ts',
    symbol: 'rewriteProjectionToHead',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.working_tree_projection,
    entrance: 'projection_rewrite',
    verifiedAtLine: 139
  },
  {
    file: 'restore-command.ts',
    symbol: 'rewriteProjectionToTarget',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.working_tree_projection,
    entrance: 'projection_rewrite',
    verifiedAtLine: 395
  },
  {
    file: 'import-command.ts',
    symbol: 'applyImportedCommit',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_commit_import,
    entrance: 'projection_rewrite',
    verifiedAtLine: 620
  }
];

/**
 * 登记键：文件 + 符号 + 意图
 *
 * @param callsite - 登记表的一行，或任何自报了这三段的声明
 * @returns 三段以 `·` 连接的稳定键
 *
 * @remarks
 * 形参刻意只要三段而不是整行：受信调用点自报意图时手上还没有 `entrance`（那是登记表的答案，
 * 不是调用点的输入），要求它凑齐一整行就等于让它把答案抄一遍，抄错也没人发现。
 *
 * 行号不在键里——它每次格式化都在变，而登记表要能跨格式化存活。写原语也不在键里：#5 与 #6 靠意图
 * 就已经分开了，把原语加进去只会让「同一条策略换个宿主调用」被误报成新增调用点。
 */
export function trustedCallsiteKey(callsite: Pick<TrustedCallsite, 'file' | 'symbol' | 'intent'>): string {
  return `${callsite.file}·${callsite.symbol}·${callsite.intent}`;
}
