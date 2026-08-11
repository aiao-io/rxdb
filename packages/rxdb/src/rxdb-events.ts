import { EntityStaticType, EntityType } from './entity/entity.interface.js';
import { Conflict } from './version/conflict.js';
import { PullResult, PushResult } from './version/VersionManager.interface.js';

export const ENTITY_LOCAL_NEW_EVENT = 'ENTITY_LOCAL_NEW' as const;
export const ENTITY_LOCAL_CREATE_EVENT = 'ENTITY_LOCAL_CREATE' as const;
export const ENTITY_LOCAL_UPDATE_EVENT = 'ENTITY_LOCAL_UPDATE' as const;
export const ENTITY_LOCAL_REMOVE_EVENT = 'ENTITY_LOCAL_REMOVE' as const;

export const ENTITY_REMOTE_CREATE_EVENT = 'ENTITY_REMOTE_CREATE' as const;
export const ENTITY_REMOTE_UPDATE_EVENT = 'ENTITY_REMOTE_UPDATE' as const;
export const ENTITY_REMOTE_REMOVE_EVENT = 'ENTITY_REMOTE_REMOVE' as const;

export const TRANSACTION_BEGIN = 'TRANSACTION_BEGIN' as const;
export const TRANSACTION_COMMIT = 'TRANSACTION_COMMIT' as const;
export const TRANSACTION_ROLLBACK = 'TRANSACTION_ROLLBACK' as const;

export const SWITCH_BRANCH_BEGIN = 'SWITCH_BRANCH_BEGIN' as const;
export const SWITCH_BRANCH_COMMIT = 'SWITCH_BRANCH_COMMIT' as const;
export const SWITCH_BRANCH_ROLLBACK = 'SWITCH_BRANCH_ROLLBACK' as const;

export const MERGE_BRANCH_BEGIN = 'MERGE_BRANCH_BEGIN' as const;
export const MERGE_BRANCH_COMMIT = 'MERGE_BRANCH_COMMIT' as const;
/**
 * 分支合并失败事件类型
 *
 * @remarks
 * **失败不等于回滚。** `merge_branch` 的 `normal` 策略逐条调用 `adapter.mergeChanges`，
 * 每次调用各自是一个事务，但整个循环没有边界：第 k 条失败时前 k-1 条已落库，
 * 且触发器已在目标分支生成对应的 `RxDBChange`。收到本事件只能推断「合并没走完」，
 * 不能推断「数据回到了合并前」。
 */
export const MERGE_BRANCH_FAILED = 'MERGE_BRANCH_FAILED' as const;

export const SYNC_BEGIN_EVENT = 'SYNC_BEGIN' as const;
export const SYNC_COMPLETE_EVENT = 'SYNC_COMPLETE' as const;
export const SYNC_ERROR_EVENT = 'SYNC_ERROR' as const;
export const REMOTE_CHANGES_PENDING_EVENT = 'REMOTE_CHANGES_PENDING' as const;
export const CONFLICT_DETECTED_EVENT = 'CONFLICT_DETECTED' as const;
export const CONFLICT_PENDING_EVENT = 'CONFLICT_PENDING' as const;

export const REPOSITORY_SYNC_BEGIN_EVENT = 'REPOSITORY_SYNC_BEGIN' as const;
export const REPOSITORY_SYNC_COMPLETE_EVENT = 'REPOSITORY_SYNC_COMPLETE' as const;
export const REPOSITORY_SYNC_ERROR_EVENT = 'REPOSITORY_SYNC_ERROR' as const;

/**
 * 事件来源标记
 * - `undefined` 或不存在：本地当前 tab 产生的原始事件
 * - `'cross-tab'`：从其他 tab 通过 BroadcastChannel 接收的事件
 */
export type EventOrigin = 'cross-tab';

/**
 * RxDB 实体事件数据基础接口
 */
interface RxDBEntityLocalEventDataBase<T extends EntityType = EntityType> {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'NEW';
  /** 命名空间 */
  namespace: string;
  /** 实体名称 */
  entity: string;
  /** 实体唯一标识符 */
  id: EntityStaticType<T, 'idType'>;
  /** 实体类型 */
  entityType?: T;
  /** 分支 ID（远程事件） */
  branchId?: string;
  /** 变更记录时间 */
  recordAt: Date;
  /** 事件来源：undefined = 本地当前 tab，'cross-tab' = 其他 tab 通过 BroadcastChannel 接收 */
  origin?: EventOrigin;
}

export interface RxDBEntityLocalNewEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  patch: Readonly<Partial<InstanceType<T>>>;
  inversePatch: null;
}

export interface RxDBEntityLocalCreatedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  patch: Readonly<InstanceType<T>>;
  inversePatch: null;
}

export interface RxDBEntityLocalUpdatedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  patch: Readonly<Partial<InstanceType<T>>>;
  inversePatch: Readonly<Partial<InstanceType<T>>>;
}

export interface RxDBEntityLocalRemovedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  patch: null;
  inversePatch: Readonly<Partial<InstanceType<T>>>;
}

/** RxDB 实体本地事件数据联合类型 */
export type RxDBEntityLocalEventData<T extends EntityType = EntityType> =
  | RxDBEntityLocalNewEventData<T>
  | RxDBEntityLocalCreatedEventData<T>
  | RxDBEntityLocalUpdatedEventData<T>
  | RxDBEntityLocalRemovedEventData<T>;

export interface RxDBEntityRemoteCreatedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  data: Readonly<InstanceType<T>>;
}

export interface RxDBEntityRemoteUpdatedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  data: Readonly<InstanceType<T>>;
}

export interface RxDBEntityRemoteRemovedEventData<
  T extends EntityType = EntityType
> extends RxDBEntityLocalEventDataBase<T> {
  data: Readonly<InstanceType<T>>;
}

/** RxDB 实体远程事件数据联合类型 */
export type RxDBEntityRemoteEventData<T extends EntityType = EntityType> =
  RxDBEntityRemoteCreatedEventData<T> | RxDBEntityRemoteUpdatedEventData<T> | RxDBEntityRemoteRemovedEventData<T>;

/**
 * 本地实体初始化事件
 *
 * 当实体通过构造函数被实例化(new)时触发。
 * 此时实体对象已创建但尚未持久化到数据库。
 */
export class EntityLocalNewEvent {
  type = ENTITY_LOCAL_NEW_EVENT;
  constructor(public readonly entities: RxDBEntityLocalNewEventData[]) {}
}

/**
 * 本地实体创建成功事件
 *
 * 当实体成功持久化到数据库时触发。
 */
export class EntityLocalCreatedEvent {
  type = ENTITY_LOCAL_CREATE_EVENT;
  constructor(public readonly entities: RxDBEntityLocalCreatedEventData[]) {}
}

/**
 * 本地实体更新成功事件
 *
 * 当实体数据被更新到数据库时触发。
 */
export class EntityLocalUpdatedEvent {
  type = ENTITY_LOCAL_UPDATE_EVENT;
  constructor(public readonly entities: RxDBEntityLocalUpdatedEventData[]) {}
}

/**
 * 本地实体删除成功事件
 *
 * 当实体从数据库中被成功删除时触发。
 */
export class EntityLocalRemovedEvent {
  type = ENTITY_LOCAL_REMOVE_EVENT;
  constructor(public readonly entities: RxDBEntityLocalRemovedEventData[]) {}
}

/** 远程实体创建事件 */
export class EntityRemoteCreatedEvent {
  type = ENTITY_REMOTE_CREATE_EVENT;
  constructor(public readonly entities: RxDBEntityRemoteCreatedEventData[]) {}
}

/** 远程实体更新事件 */
export class EntityRemoteUpdatedEvent {
  type = ENTITY_REMOTE_UPDATE_EVENT;
  constructor(public readonly entities: RxDBEntityRemoteUpdatedEventData[]) {}
}

/** 远程实体删除事件 */
export class EntityRemoteRemovedEvent {
  type = ENTITY_REMOTE_REMOVE_EVENT;
  constructor(public readonly entities: RxDBEntityRemoteRemovedEventData[]) {}
}

/** 事务开始事件 */
export class TransactionBeginEvent {
  type = TRANSACTION_BEGIN;

  /**
   * @param transactionId 本次事务的身份
   *
   * @remarks
   * 带身份时，只有**同一身份**的再次 BEGIN 才算 savepoint 嵌套，不同身份各自成队；
   * 省略时所有匿名事务共用一个上下文——这正是本 finding 描述的旧行为，保留它是为了
   * 让尚未升级的派发方（以及只有单个派发者的部署）行为不变。
   */
  constructor(public readonly transactionId?: string) {}
}

/** 事务提交事件 */
export class TransactionCommitEvent {
  type = TRANSACTION_COMMIT;

  /** @param transactionId 要提交的事务身份，须与对应的 {@link TransactionBeginEvent} 一致 */
  constructor(public readonly transactionId?: string) {}
}

/** 事务回滚事件 */
export class TransactionRollbackEvent {
  type = TRANSACTION_ROLLBACK;

  /** @param transactionId 要回滚的事务身份，须与对应的 {@link TransactionBeginEvent} 一致 */
  constructor(public readonly transactionId?: string) {}
}

export class SwitchBranchEventBase {
  constructor(
    /** 分支名称 */
    public readonly branchName: string
  ) {}
}

/** 分支切换开始事件 */
export class SwitchBranchBeginEvent extends SwitchBranchEventBase {
  type = SWITCH_BRANCH_BEGIN;
}

/** 分支切换提交事件 */
export class SwitchBranchCommitEvent extends SwitchBranchEventBase {
  type = SWITCH_BRANCH_COMMIT;
}

/** 分支切换回滚事件 */
export class SwitchBranchRollbackEvent extends SwitchBranchEventBase {
  type = SWITCH_BRANCH_ROLLBACK;
}

export class MergeBranchEventBase {
  constructor(
    /** 源分支名称 */
    public readonly sourceBranch: string,
    /** 目标分支名称 */
    public readonly targetBranch: string
  ) {}
}

/** 分支合并开始事件 */
export class MergeBranchBeginEvent extends MergeBranchEventBase {
  readonly type = MERGE_BRANCH_BEGIN;
}

/** 分支合并提交事件 */
export class MergeBranchCommitEvent extends MergeBranchEventBase {
  readonly type = MERGE_BRANCH_COMMIT;
}

/**
 * 分支合并失败事件
 *
 * @remarks
 * 语义见 {@link MERGE_BRANCH_FAILED}：合并没走完，但已应用的部分**不会**被撤销。
 */
export class MergeBranchFailedEvent extends MergeBranchEventBase {
  readonly type = MERGE_BRANCH_FAILED;
}

/**
 * 同步方向
 */
export type SyncDirection = 'pull' | 'push';

/**
 * 同步开始事件
 *
 * 当开始执行 pull() 或 push() 操作时触发
 */
export class SyncBeginEvent {
  readonly type = SYNC_BEGIN_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: SyncDirection
  ) {}
}

/**
 * 同步完成事件
 *
 * 当 pull() 或 push() 操作成功完成时触发
 */
export class SyncCompleteEvent {
  readonly type = SYNC_COMPLETE_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: SyncDirection,
    /** 同步结果 */
    public readonly result: PullResult | PushResult
  ) {}
}

/**
 * 同步错误事件
 *
 * 当 pull() 或 push() 操作失败时触发
 */
export class SyncErrorEvent {
  readonly type = SYNC_ERROR_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: SyncDirection,
    /** 错误信息 */
    public readonly error: Error
  ) {}
}

/**
 * 冲突检测事件
 *
 * 当 pull 时检测到本地未同步变更与远程变更冲突时触发
 */
export class ConflictDetectedEvent {
  readonly type = CONFLICT_DETECTED_EVENT;

  constructor(
    /** 发现的冲突列表 */
    public readonly conflicts: Conflict[],
    /** 已自动解决的数量 */
    public readonly resolved: number,
    /** 延迟处理的数量 */
    public readonly deferred: number
  ) {}
}

/**
 * 冲突待处理事件
 *
 * 当有冲突解决结果为 DEFER 时触发
 */
export class ConflictPendingEvent {
  readonly type = CONFLICT_PENDING_EVENT;

  constructor(
    /** 待处理的冲突列表 */
    public readonly conflicts: Conflict[]
  ) {}
}

/**
 * Repository 同步方向
 */
export type RepositorySyncDirection = 'pull' | 'push' | 'sync';

/**
 * Repository 同步开始事件
 *
 * 当开始执行 pullRepository(), pushRepository() 或 syncRepository() 时触发
 */
export class RepositorySyncBeginEvent {
  readonly type = REPOSITORY_SYNC_BEGIN_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: RepositorySyncDirection,
    /** 命名空间 */
    public readonly namespace: string,
    /** 实体名称 */
    public readonly entity: string,
    /** 是否包含关联实体 */
    public readonly includeRelated: boolean
  ) {}
}

/**
 * Repository 同步完成事件
 *
 * 当 repository 同步操作成功完成时触发
 */
export class RepositorySyncCompleteEvent {
  readonly type = REPOSITORY_SYNC_COMPLETE_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: RepositorySyncDirection,
    /** 命名空间 */
    public readonly namespace: string,
    /** 实体名称 */
    public readonly entity: string,
    /** 同步结果统计 */
    public readonly result: {
      pulled?: number;
      pushed?: number;
      compacted?: number;
      failed?: number;
      conflictsResolved?: number;
      conflictsDeferred?: number;
    }
  ) {}
}

/**
 * Repository 同步错误事件
 *
 * 当 repository 同步操作失败时触发
 */
export class RepositorySyncErrorEvent {
  readonly type = REPOSITORY_SYNC_ERROR_EVENT;

  constructor(
    /** 同步方向 */
    public readonly direction: RepositorySyncDirection,
    /** 命名空间 */
    public readonly namespace: string,
    /** 实体名称 */
    public readonly entity: string,
    /** 错误信息 */
    public readonly error: Error
  ) {}
}

/** RxDB 实体事件映射接口 */
export interface RxDBEntityEventMap {
  [ENTITY_LOCAL_NEW_EVENT]: EntityLocalNewEvent;
  [ENTITY_LOCAL_CREATE_EVENT]: EntityLocalCreatedEvent;
  [ENTITY_LOCAL_UPDATE_EVENT]: EntityLocalUpdatedEvent;
  [ENTITY_LOCAL_REMOVE_EVENT]: EntityLocalRemovedEvent;
  [ENTITY_REMOTE_CREATE_EVENT]: EntityRemoteCreatedEvent;
  [ENTITY_REMOTE_UPDATE_EVENT]: EntityRemoteUpdatedEvent;
  [ENTITY_REMOTE_REMOVE_EVENT]: EntityRemoteRemovedEvent;
}

/** RxDB 完整事件映射接口 */
export interface RxDBEventMap extends RxDBEntityEventMap {
  [TRANSACTION_BEGIN]: TransactionBeginEvent;
  [TRANSACTION_COMMIT]: TransactionCommitEvent;
  [TRANSACTION_ROLLBACK]: TransactionRollbackEvent;
  [SWITCH_BRANCH_BEGIN]: SwitchBranchBeginEvent;
  [SWITCH_BRANCH_COMMIT]: SwitchBranchCommitEvent;
  [SWITCH_BRANCH_ROLLBACK]: SwitchBranchRollbackEvent;
  [MERGE_BRANCH_BEGIN]: MergeBranchBeginEvent;
  [MERGE_BRANCH_COMMIT]: MergeBranchCommitEvent;
  [MERGE_BRANCH_FAILED]: MergeBranchFailedEvent;
  [SYNC_BEGIN_EVENT]: SyncBeginEvent;
  [SYNC_COMPLETE_EVENT]: SyncCompleteEvent;
  [SYNC_ERROR_EVENT]: SyncErrorEvent;
  [CONFLICT_DETECTED_EVENT]: ConflictDetectedEvent;
  [CONFLICT_PENDING_EVENT]: ConflictPendingEvent;
  [REPOSITORY_SYNC_BEGIN_EVENT]: RepositorySyncBeginEvent;
  [REPOSITORY_SYNC_COMPLETE_EVENT]: RepositorySyncCompleteEvent;
  [REPOSITORY_SYNC_ERROR_EVENT]: RepositorySyncErrorEvent;
}

/** RxDB 实体事件联合类型 */
export type RxDBEntityEvent = RxDBEntityEventMap[keyof RxDBEntityEventMap];

/** RxDB 事件联合类型 */
/**
 * RxDB 事件联合类型。
 *
 * @remarks
 * **判别方式的契约：只能用 `event.type`，不能用 `instanceof`。**
 * 跨 tab 事件经 BroadcastChannel 结构化克隆后 `constructor` 是 `Object`，网关按 `type` 字段
 * 展开重建（见 `RxDBTabsGateway.#markEventAsCrossTab`），不调用原始事件类的构造函数。
 * 因此同一逻辑事件在本 tab 与跨 tab 下的原型不同，`instanceof EntityLocalCreatedEvent`
 * 会在跨 tab 路径上返回 `false`。`type` 是唯一在两条路径上都稳定的判别依据。
 */
export type RxDBEvent = RxDBEventMap[keyof RxDBEventMap];

/**
 * 判定事件是否来自其他 tab。
 *
 * @param event - 待判定的事件
 * @returns 事件携带 `origin: 'cross-tab'` 标记的实体时为 `true`
 *
 * @remarks
 * 标记由网关的 `#markEventAsCrossTab` 写在实体上，会随事件对象一起穿过宿主的事务队列 ——
 * 而网关内的 `#processingRemoteEvent` 只是派发那一瞬间的标志。事务期间收到的远端事件要等
 * COMMIT 才重放监听器，那一刻标志早已复位，**事件自身的标记是识别来源的唯一线索**。
 *
 * 两个消费方：
 * - 网关：跨 tab 事件不再二次广播，防回声成环；
 * - {@link RxDB} 的事务回滚：只丢弃本地事件，他 tab 已提交的变更照常派发。
 */
export const isCrossTabEvent = (event: RxDBEvent): boolean => {
  if (!('entities' in event) || !Array.isArray(event.entities)) return false;
  const entities: readonly { origin?: unknown }[] = event.entities;
  return entities.some(entity => entity.origin === 'cross-tab');
};
