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
 * **本模块留在核心，不随提交能力走进插件。** 登记表描述的是核心 `version/` 下 8 个文件里的调用点，
 * 漂移扫描扫的也是核心调用点——搬进插件之后，核心新增一条批量重写路径就再也不会被扫到。
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
  /** 相对 `packages/rxdb/src/version/` 的文件名 */
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
 * 与真实代码核对过的 9 行受信调用点（核对日期 2026-09-12）
 *
 * @remarks
 * 顺序与 adapter-contract.md §3 的表格逐行一致，便于漂移扫描双向比对。
 */
export const TRUSTED_CALLSITE_REGISTRY: readonly TrustedCallsite[] = [
  {
    file: 'VersionManager.ts',
    symbol: 'switchBranch',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.branch_materialization,
    entrance: 'projection_rewrite',
    verifiedAtLine: 751
  },
  {
    file: 'restore-entity.ts',
    symbol: 'restore_entity',
    writePrimitive: 'adapter.mergeChanges',
    intent: TrustedWriteIntent.restore_entity,
    entrance: 'domain_recompute',
    verifiedAtLine: 81
  },
  {
    file: 'HistoryManager.ts',
    symbol: 'invalidateRedoStack',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.redo_invalidation,
    entrance: 'projection_rewrite',
    verifiedAtLine: 519
  },
  {
    file: 'undo-redo-apply.ts',
    symbol: 'applyUndoRedoHistories',
    writePrimitive: 'adapter.switchBranch',
    intent: TrustedWriteIntent.undo_redo,
    entrance: 'domain_recompute',
    verifiedAtLine: 166
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.merge_per_change,
    entrance: 'domain_recompute',
    verifiedAtLine: 127
  },
  {
    file: 'merge-branch.ts',
    symbol: 'merge_branch',
    writePrimitive: 'adapter.mergeChanges',
    intent: TrustedWriteIntent.merge_squash,
    entrance: 'domain_recompute',
    verifiedAtLine: 151
  },
  {
    file: 'pull-batch.ts',
    symbol: 'pullBatchOnce',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 373
  },
  {
    file: 'pull-repository.ts',
    symbol: 'pullSingleRepository',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'remote_entity_apply',
    verifiedAtLine: 636
  },
  {
    file: 'cleanup-expired.ts',
    symbol: 'cleanupExpired',
    writePrimitive: 'executor.mergeChanges',
    intent: TrustedWriteIntent.remote_sync,
    entrance: 'cleanup_expired',
    verifiedAtLine: 201
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
