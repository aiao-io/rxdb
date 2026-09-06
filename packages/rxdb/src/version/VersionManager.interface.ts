import { Observable } from 'rxjs';
import { EntityType, RxDBEntityId, UUID } from '../entity/entity.interface.js';
import type { RuleGroup } from '../repository/query.interface.js';
import { RxDBChange } from '../system/change.js';
import { ConflictResolver } from './conflict.js';

/**
 * 同步进度信号
 *
 * 中断的同步（`RxDBPartialSyncError`）与「跑完但什么都没做」的同步，
 * 光看 `pulled` / `applied` 这些计数区分不出来：
 * - 只回填了自己推送变更的 `remoteId`、只推进了水位线的轮次，`applied` 也是 0，
 *   但写已经提交了，重试必须从新水位线继续；
 * - 远端变更被压缩全部抵消时 `pulled > 0` 却没有任何实体数据被改写，
 *   undo 历史仍然有效，不该被清空。
 *
 * 因此把两个语义拆成独立布尔信号，调用方按语义取用而不是猜计数。
 */
export interface SyncProgress {
  /**
   * 是否已有写入落库（水位线推进 / `remoteId` 回填 / 变更应用，任意一项）
   *
   * 为 true 表示本次同步的部分成果**不会**被回滚，重试要从当前水位线继续。
   */
  persistedProgress: boolean;

  /**
   * 是否有远端变更改写了本地实体数据
   *
   * 为 true 表示 undo/redo 的历史边界已经失效，必须清空撤销历史。
   */
  historyInvalidated: boolean;
}

/**
 * 单个仓库的同步失败记录
 */
export interface SyncFailure {
  /**
   * 失败的仓库标识（仓库级聚合场景下始终存在）
   */
  repository?: RepositoryIdentifier;

  /**
   * 失败的根因（嵌套的 `RxDBPartialSyncError` 已解包）
   */
  error: Error;
}

/**
 * Pull 操作结果
 */
export interface PullResult extends SyncProgress {
  /**
   * 从远程拉取的变更数量（压缩前）
   */
  pulled: number;

  /**
   * 被压缩/丢弃的变更数量
   * 例如：INSERT → DELETE 的变更会被丢弃
   */
  compacted: number;

  /**
   * 成功应用到本地的变更数量（压缩后）
   */
  applied: number;

  /**
   * 是否还有更多数据需要拉取
   */
  hasMore: boolean;

  /**
   * 自动解决的冲突数量
   */
  conflictsResolved: number;

  /**
   * 延后处理的冲突数量
   */
  conflictsDeferred: number;

  /**
   * 本次拉取中所有失败的仓库（按仓库顺序），没有失败时为空数组
   *
   * 多仓库聚合时不能只留第一个错误，否则后面几个仓库的失败无处可查。
   */
  failures: SyncFailure[];
}

/**
 * Push 操作结果
 */
export interface PushResult {
  /**
   * 成功推送到远程的变更数量（压缩后）
   */
  pushed: number;

  /**
   * 推送失败的变更数量
   */
  failed: number;

  /**
   * 被压缩/丢弃的变更数量
   * 例如：INSERT → DELETE 的变更会被丢弃
   */
  compacted: number;

  /**
   * 压缩前的原始变更数量
   * 关系：originalCount = pushed + failed + compacted
   */
  originalCount: number;

  /**
   * 本次推送中所有失败的仓库（按仓库顺序），没有失败时为空数组
   *
   * 与 {@link PullResult.failures} 同口径：多仓库聚合时不能只留第一个错误，
   * 也不能把「一个仓库失败」折算成 `failed += 1` —— `failed` 的单位是**变更条数**，
   * 混进仓库计数会直接破坏 `originalCount = pushed + failed + compacted`。
   */
  failures: SyncFailure[];
}

/**
 * Sync 操作结果（pull + push 组合）
 */
export interface SyncResult {
  /**
   * Pull 操作结果
   */
  pullResult: PullResult;

  /**
   * Push 操作结果
   */
  pushResult: PushResult;
}

/**
 * Pull 操作选项
 */
export interface PullOptions {
  /**
   * 单次拉取的最大数量
   * @default 1000
   */
  limit?: number;

  /**
   * 是否自动处理分页，拉取所有数据
   * @default false
   */
  fetchAll?: boolean;

  /**
   * 可选的实体过滤列表（用于 repository-level sync）
   * 只拉取指定实体的变更
   * @example ['Todo', 'User']
   * @example [{ namespace: 'public', entity: 'Todo' }]
   */
  repositoryFilter?: (string | RepositoryIdentifier)[];

  /**
   * 冲突解决器
   *
   * 拉取时检测到本地未同步变更与远端变更针对同一实体即调用。
   * 不传则用 {@link LWWConflictResolver}。
   *
   * @remarks
   * 批量路径与逐仓库路径都会透传，两条路径对同一份冲突给出同样的结果。
   * 运行时可自动应用的解决结果只有 `KEEP_LOCAL` 与 `KEEP_REMOTE`，
   * 详见 {@link ConflictResolution}。
   */
  conflictResolver?: ConflictResolver;
}

// 这里原本还有一份 `CheckRepositoryUpdatesResult`，字段与
// `VersionManager.checkRepositoryUpdates()` 的真实返回值**完全对不上**
// （只有 `hasUpdates` 一个名字重合），而 `index.ts` 导出的偏偏是这一份。
// 已删除，唯一定义在 `./check-repository-updates.ts`，由 `index.ts` 直接转出。

/**
 * Push 操作选项
 */
export interface PushOptions {
  /**
   * 单次推送的最大数量
   * @default 1000
   */
  batchSize?: number;

  /**
   * 可选的实体过滤列表（用于 repository-level sync）
   * 只推送指定实体的变更
   * @example ['Todo', 'User']
   * @example [{ namespace: 'public', entity: 'Todo' }]
   */
  repositoryFilter?: (string | RepositoryIdentifier)[];
}

/**
 * 历史记录作用域类型
 */
export type HistoryScopeType = 'database' | 'repository' | 'entity';

/**
 * 历史记录作用域配置
 */
export type HistoryScope =
  | { type: 'database' }
  | { type: 'repository'; namespace: string; entity: string }
  | { type: 'entity'; namespace: string; entity: string; entityId: RxDBEntityId };

/**
 * 历史记录作用域 API
 * 所有作用域返回统一的接口，消除特殊情况
 */
export interface HistoryScopeAPI {
  type: HistoryScopeType;
  /** 历史记录流 */
  histories$: Observable<HistoryItem[]>;
  /** 可撤销的历史记录流 */
  undoHistories$: Observable<HistoryItem[]>;
  /** 可重做的历史记录流 */
  redoHistories$: Observable<HistoryItem[]>;
  /** 历史记录总数 */
  count$: Observable<number>;
  /** 可撤销数量 */
  undoCount$: Observable<number>;
  /** 可重做数量 */
  redoCount$: Observable<number>;

  /** 撤销操作 */
  undo(step?: number): Promise<void>;
  /** 重做操作 */
  redo(step?: number): Promise<void>;
}

/**
 * 历史记录项
 * 表示一个可撤销/重做的操作单元
 */
export interface HistoryItem {
  changeId: number;

  /**
   * 唯一指纹，用于标识该历史项
   */
  fingerprint: string;

  /**
   * 命名空间
   */
  namespace: string;

  /**
   * 实体名称
   */
  entity: string;

  /**
   * 操作类型
   */
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRANSACTION';

  /**
   * 描述信息（用于 UI 展示）
   *
   * @example
   * - 单条变更：「创建 User」「更新 Todo」「删除 Post」
   * - 多条变更：「事务: 创建2条, 更新3条」
   */
  description: string;

  /**
   * 事务ID
   */
  transactionId: UUID | null;

  /**
   * 该历史项包含的所有变更
   */
  changes: RxDBChange[];

  /**
   * 变更数量
   */
  count: number;

  /**
   * 最新变更的时间戳
   */
  createdAt: Date;

  /**
   * 是否已撤销
   * true 表示该历史项已被撤销（任意一个 change 被撤销即为 true）
   */
  reverted: boolean;

  /**
   * Redo 是否失效
   * true 表示该历史项的 redo 操作已被废弃（任意一个 change 被废弃即为 true）
   */
  redoInvalidated: boolean;
}

export interface SwitchVersionChange<T extends EntityType = EntityType> {
  patch: Partial<InstanceType<T>> | null;
  inversePatch: Partial<InstanceType<T>> | null;
}

/**
 * 切换分支版本需要的操作
 */
export interface SwitchVersionActions<T extends EntityType = EntityType> {
  /**
   * 需要删除的实体键集合 key
   * key 格式：`${namespace}:${entityName}:${entityId}`
   */
  deletes: Map<string, SwitchVersionChange<T>>;

  /**
   * 需要更新的实体键集合 key
   * key 格式：`${namespace}:${entityName}:${entityId}`
   */
  updates: Map<string, SwitchVersionChange<T>>;

  /**
   * 需要插入的实体键集合 key
   * key 格式：`${namespace}:${entityName}:${entityId}`
   */
  inserts: Map<string, SwitchVersionChange<T>>;

  /**
   * 更新 RxDBChange 序列号
   * local only, 不会同步到远程
   */
  updateRxDBChangeSequence?: number;
}

/**
 * 仓库标识符
 * 唯一标识一个实体类型
 */
export interface RepositoryIdentifier {
  /**
   * 实体命名空间
   * @example "public"
   */
  namespace: string;

  /**
   * 实体名称
   * @example "Todo"
   */
  entity: string;
}

/**
 * 拉取仓库选项
 */
export interface PullRepositoryOptions {
  /**
   * 单次请求拉取的最大变更数
   * @default 1000
   */
  limit?: number;

  /**
   * 是否多次请求拉取所有变更
   * @default false
   */
  fetchAll?: boolean;

  /**
   * 是否包含关联实体（级联同步）
   *
   * 为 true 时：
   * - 自动拉取所有父实体（外键引用）
   * - 按拓扑顺序：父 -> 子
   * - 示例：拉取 Post 时会自动拉取 User
   *
   * 为 false 时：
   * - 仅同步指定的仓库
   * - 如果父实体未同步，可能导致外键约束错误
   *
   * @default true
   */
  includeRelated?: boolean;

  /**
   * 行级过滤条件（用于 SyncType.Filter）
   *
   * 设置后只拉取满足条件的实体对应的变更；条件作用在实体表而非 RxDBChange 表。
   *
   * @example
   * ```ts
   * // 只拉取最近 30 天的数据
   * filter: {
   *   combinator: 'and',
   *   rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
   * }
   * ```
   */
  filter?: RuleGroup;

  /**
   * Repository 级 pull 过程中使用的冲突解决器。
   *
   * 当前运行时仅支持自动的 KEEP_LOCAL 和 KEEP_REMOTE 解决策略。
   * MERGE 和 DEFER 作为待办项暂未实现。
   */
  conflictResolver?: ConflictResolver;
}

/**
 * 推送仓库选项
 */
export interface PushRepositoryOptions {
  /**
   * 单批次推送的最大变更数
   * @default 1000
   */
  batchSize?: number;

  /**
   * 是否包含关联实体（级联同步）
   *
   * 为 true 时：
   * - 自动推送所有子实体（引用当前实体的实体）
   * - 按反向拓扑顺序：子 -> 父
   * - 示例：推送 User 时会自动推送 Post
   *
   * 为 false 时：
   * - 仅同步指定的仓库
   * - 可能导致远程数据不完整
   *
   * @default true
   */
  includeRelated?: boolean;
}

/**
 * 同步仓库选项
 */
export interface SyncRepositoryOptions {
  direction?: 'pull' | 'push' | 'sync';
  pull?: PullRepositoryOptions;
  push?: PushRepositoryOptions;
}

/**
 * 拉取仓库结果
 */
export interface PullRepositoryResult extends SyncProgress {
  /**
   * 仓库标识符
   */
  repository: RepositoryIdentifier;

  /**
   * 仓库同步是否成功
   */
  success?: boolean;

  /**
   * 仓库同步失败时的错误信息
   */
  error?: Error;

  /**
   * 仓库被跳过的原因
   */
  skipped?: string;

  /**
   * 从远程拉取的变更数量（压缩前）
   */
  pulled: number;

  /**
   * 被压缩/丢弃的变更数量
   */
  compacted: number;

  /**
   * 成功应用到本地的变更数量（压缩后）
   */
  applied: number;

  /**
   * 是否还有更多变更需要拉取
   */
  hasMore: boolean;

  /**
   * 自动解决的冲突数量
   */
  conflictsResolved: number;

  /**
   * 延后手动处理的冲突数量
   */
  conflictsDeferred: number;

  /**
   * 关联仓库的结果（includeRelated=true 时）
   */
  relatedResults?: PullRepositoryResult[];

  /**
   * 本次调用中所有同步失败的仓库（含目标仓自身），按执行顺序排列
   *
   * @remarks
   * 必填而非可选：可选字段会让调用方写 `result.failures ?? []` 兜底，
   * 而「字段缺失」和「没有失败」是两件事。按策略跳过（`skipped`）不算失败，
   * 不进本清单。
   */
  failures: SyncFailure[];
}

/**
 * 推送仓库结果
 */
export interface PushRepositoryResult {
  /**
   * 仓库标识符
   */
  repository: RepositoryIdentifier;

  /**
   * 仓库同步是否成功
   */
  success?: boolean;

  /**
   * 仓库同步失败时的错误信息
   */
  error?: Error;

  /**
   * 仓库被跳过的原因
   */
  skipped?: string;

  /**
   * 成功推送到远程的变更数量（压缩后）
   */
  pushed: number;

  /**
   * 推送失败的变更数量
   */
  failed: number;

  /**
   * 被压缩/丢弃的变更数量
   */
  compacted: number;

  /**
   * 原始未推送变更数量（压缩前）
   */
  originalCount: number;

  /**
   * 关联仓库的结果（includeRelated=true 时）
   */
  relatedResults?: PushRepositoryResult[];

  /**
   * 本次调用中所有同步失败的仓库（含目标仓自身），按执行顺序排列
   *
   * @remarks
   * 必填而非可选：可选字段会让调用方写 `result.failures ?? []` 兜底，
   * 而「字段缺失」和「没有失败」是两件事。按策略跳过（`skipped`）不算失败，
   * 不进本清单。
   */
  failures: SyncFailure[];
}

/**
 * 同步仓库结果
 */
export interface SyncRepositoryResult extends SyncProgress {
  /**
   * 拉取结果
   */
  pullResult: PullRepositoryResult;

  /**
   * 推送结果
   */
  pushResult: PushRepositoryResult;
}

/**
 * 合并策略
 *
 * - `squash`（默认）：将源分支所有变更压缩为目标分支的一组事务记录
 * - `normal`：逐条复制源分支变更到目标分支
 */
export type MergeStrategy = 'squash' | 'normal';

/**
 * 分支合并选项
 */
export interface MergeBranchOptions {
  /**
   * 合并策略
   * @default 'squash'
   */
  strategy?: MergeStrategy;

  /**
   * 合并后是否删除源分支
   * @default false
   */
  deleteSource?: boolean;
}

/**
 * 分支合并结果
 */
export interface MergeBranchResult {
  /**
   * 合并的变更数量（应用到目标分支的实体操作数）
   */
  merged: number;

  /**
   * 使用的合并策略
   */
  strategy: MergeStrategy;

  /**
   * 源分支是否已删除
   */
  sourceDeleted: boolean;

  /**
   * 删除源分支失败的原因（仅当 `deleteSource: true` 且删除失败时存在）
   *
   * @remarks
   * 删源分支是合并落库之后的收尾动作，失败不会让合并回滚，也不会让 `mergeBranch()` 抛错 ——
   * 否则调用方会以为没合并而重试，normal 策略下就是二次合并。
   * 合并成果照常由 `merged` 反映，这里只如实报告收尾没做成及其原因。
   */
  sourceDeleteError?: Error;
}
