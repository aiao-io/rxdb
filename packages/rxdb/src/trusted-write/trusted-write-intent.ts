/**
 * @fileoverview 受信写意图与 9 行调用点登记表（spec.md「受信路径登记键」、adapter-contract.md §3）。
 *
 * @remarks
 * 意图是「我知道我在重写业务投影，并且我会自己维护工作树」
 * 这句话的可判定形式。做成公开参数的话，任何调用方都能给自己发一张豁免票，而 5 步判定的第 2 步
 * 恰恰是整条防线上唯一无条件放行的一步。
 *
 * **登记键是「文件 + 符号 + 意图」，不是行号。** 行号每次格式化都在变，登记表会在第一次 prettier
 * 之后全面失配；而符号取的是**实际发起那次批量重写的最内层具名函数**，不是委托门面——门面会被重构
 * 成另一个门面，发起写的那个函数不会。
 *
 * **同文件里语义不同的两个策略分支各占一行**（#5 逐条合并 / #6 压缩合并）。合成一行会让其中一条策略
 * 失去登记：漂移扫描看到「`merge-branch.ts·merge_branch` 已登记」就不再追问是哪条分支在写。
 *
 * **登记表跨两个写原语。** `switchBranch` 与 `mergeChanges` 各占一部分——只在 `mergeChanges` 上挂门禁
 * 会整体漏掉撤销与分支物化面。
 *
 * **9 个调用点自 US-025 起住在两个插件里**：#1~#6 在 `@aiao/rxdb-plugin-history/src/`，
 * #7~#9 在 `@aiao/rxdb-plugin-sync/src/`。登记的是**文件基名**，不带包名也不带目录——
 * 键要跨这次搬迁存活，而它确实跨过来了：搬迁只换了目录，没换文件名、符号名与意图。
 *
 * **但本模块仍然留在核心，而且只能留在核心。** 登记表是 `declareTrustedWrite()` 的准入名单，
 * 而那个函数与它守的 5 步判定都在核心；两个插件互不依赖，谁都没资格持有一张另一个也必须满足的表。
 * 把表搬给其中一个，另一个就得反向依赖它，或者各存一份——各存一份的两张表迟早有一张是旧的。
 *
 * **代价是核心的 chromium 测试从此扫不到这 9 处声明**（`import.meta.glob` 进不了兄弟包）。
 * 那一半核对交给 `scripts/audit/working-tree-callsite-drift.mjs`（T066）：它跑在 node 里，
 * 扫整个 `packages/`，双向比对登记键、自报符号与存档行号。核心那份
 * （`__tests__/trusted-write/trusted-callsite-registry.spec.ts`）改守两件核心自己看得见的事——
 * 这张表与 adapter-contract.md §3 逐格一致，以及**核心自身一处受信写、一处批量写都没有**。
 *
 * 「这一行会不会产生工作树单元」是插件的问题，那个函数（`producesWorkingTreeEntry`）留在插件侧。
 */

import type { WriteEntrance } from './write-entrance.js';

/**
 * 受信路径声明的写意图
 *
 * @remarks
 * 与 {@link WriteEntrance} 是两个维度，不能合并：意图是**调用点自报的身份**（登记表的一列），
 * 入口是**矩阵给出的分类**。两者多对一——#7/#8/#9 三行都报 `remote_sync`，却分别落 `remote_entity_apply`
 * 与 `cleanup_expired` 两个入口。压成一个枚举之后，登记表就没法表达「同一个意图在两个地方」，
 * 而那正是漂移扫描要比对的东西。
 */
export const TrustedWriteIntent = {
  /** 切分支时把目标分支的状态物化到业务表（#1）；投影重写，不产生单元 */
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
  /** 同步机制写入本地业务投影（#7/#8/#9）；产生 `origin='remote_sync'` 的单元 */
  remote_sync: 'remote_sync'
} as const;

/** {@link TrustedWriteIntent} 的值联合 */
export type TrustedWriteIntent = (typeof TrustedWriteIntent)[keyof typeof TrustedWriteIntent];

/**
 * 受信调用点实际调用的写原语
 *
 * @remarks
 * `adapter.` 与 `executor.` 前缀不是噪音：同一个 `mergeChanges` 经两个宿主到达，挂载点只挂在
 * adapter 上，走 executor 的那几行必须被单独登记才不会在漂移扫描里显示为「未登记的批量重写」。
 */
export type TrustedWritePrimitive = 'adapter.switchBranch' | 'adapter.mergeChanges' | 'executor.mergeChanges';

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
 * 与真实代码核对过的 9 行受信调用点（核对日期 2026-09-16）
 *
 * @remarks
 * 顺序与 adapter-contract.md §3 的表格逐行一致，便于漂移扫描双向比对。
 *
 * 2026-09-16 这次核对是跟着 US-025 抽包做的：9 处声明整体从核心 `version/` 搬进了
 * history / sync 两个插件，键（文件基名 + 符号 + 意图）一个没变，`verifiedAtLine` 九行全变了。
 */
export const TRUSTED_CALLSITE_REGISTRY: readonly TrustedCallsite[] = [
  {
    file: 'VersionManager.ts',
    symbol: 'switchBranch',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.branch_materialization,
    entrance: 'projection_rewrite',
    verifiedAtLine: 280
  },
  {
    file: 'restore-entity.ts',
    symbol: 'restore_entity',
    writePrimitive: 'adapter.mergeChanges',
    intent: TrustedWriteIntent.restore_entity,
    entrance: 'domain_recompute',
    verifiedAtLine: 86
  },
  {
    file: 'HistoryManager.ts',
    symbol: 'invalidateRedoStack',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.redo_invalidation,
    entrance: 'projection_rewrite',
    verifiedAtLine: 537
  },
  {
    file: 'undo-redo-apply.ts',
    symbol: 'applyUndoRedoHistories',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.undo_redo,
    entrance: 'domain_recompute',
    verifiedAtLine: 171
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.merge_per_change,
    entrance: 'domain_recompute',
    verifiedAtLine: 134
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'adapter.mergeChanges',
    intent: TrustedWriteIntent.merge_squash,
    entrance: 'domain_recompute',
    verifiedAtLine: 165
  },
  {
    file: 'pull-batch.ts',
    symbol: 'pullBatchOnce',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 382
  },
  {
    file: 'pull-repository.ts',
    symbol: 'pullSingleRepository',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 646
  },
  {
    file: 'cleanup-expired.ts',
    symbol: 'cleanupExpired',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'cleanup_expired',
    verifiedAtLine: 208
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
