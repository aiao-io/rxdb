import type { ContentSource } from '../derive.js';
import type { Commit, CommitMeta, Records, Workspace } from '../model.js';
import type { RecordKey } from '../schema.js';
import type { Effects } from './plan.js';
import type { WorkspaceChanges } from './state-changes.js';

export type { Lineage, Link, Path } from '../derive.js';
/** 键索引里的一行：哪条共享记录持有这个键。 */
export type IndexedKey = RecordKey & { recordId: string };
/**
 * 合并对共享记录的改动：要写入（新增或覆盖）的整行、要删除的记录标识，以及写入的记录按清单算出的全部键。
 * 存储先删掉这些记录（写入与删除的）原有的键，再写入 `keys`，键索引因此总与共享记录一致。
 */
export interface SharedChange {
  upsert: Records;
  remove: string[];
  keys: IndexedKey[];
}

/**
 * 提交与共享记录的存储接口：引擎本身不碰存储，仓储按命令类型经它预加载所需数据，再把命令的效果写回。
 * 一个实例对应一个团队下的一个应用；PostgreSQL 实现与内存实现（测试用）遵守同一份行为约定。
 * 读取部分就是推导内容用的 {@link ContentSource}（另带内容指纹），读取的成本只取决于所问的内容，不取决于工作区里一共有多少提交。
 */
export interface CommitStore extends ContentSource {
  /** 按标识读取已存在提交的元数据（含指纹，不含变更）；不存在的标识不出现在结果里。 */
  commits(ids: readonly string[]): Promise<Map<string, CommitMeta>>;
  /**
   * 键索引里这些唯一键的持有者：键文本（`recordKeyText`）到持有它的共享记录标识，每个问到的键都在结果里（没有持有者时为空列表）。
   * 走索引，成本只与问到的键数及命中数有关。
   */
  holders(keys: readonly RecordKey[]): Promise<Map<string, string[]>>;
  /** 有单值关联指向这些记录的共享记录（整行），走键索引，不扫全表。 */
  referencing(ids: readonly string[]): Promise<Records>;
  /** 追加提交（含字段级变更与指纹），只追加、不可修改。 */
  append(commits: readonly Commit[]): Promise<void>;
  /** 应用合并对共享记录的改动，同时更新这些记录在键索引里的键。 */
  apply(change: SharedChange): Promise<void>;
  /** 按新清单重建整份键索引：先清空，再写入 `keys`（登记新的数据模式版本时用）。 */
  reindex(keys: readonly IndexedKey[]): Promise<void>;
}

/** 引用行的锁：推进前排他（FOR UPDATE）、读取期间不许别人推进（FOR SHARE），或不加锁。 */
export type RefLock = 'update' | 'share' | 'none';
/** 治理行的锁：成员、邀请与策略命令排他（FOR UPDATE），其余命令共享（FOR SHARE），只读查询不加锁。 */
export type GovernanceLock = 'update' | 'share' | 'none';

/**
 * 命令事务的加载器：按固定的锁顺序把命令涉及的行读进一份局部工作区状态（只含这些行的 {@link Workspace}），
 * 引擎在这份局部状态上裁决。PostgreSQL 实现按调用加行锁，内存实现（测试用）从完整状态里截取。
 * 锁顺序由调用顺序保证：先治理行，再 PR 行，再引用行（共享引用先于任务引用）；写回时最后才动版本行。
 * 治理行之后的读取都发生在取得治理行锁之后，因此一定能看到在此之前提交的成员与策略变更。
 */
export interface WorkspaceLoader {
  /** 局部状态：只含已读取的行；治理字段（名称、策略、数据模式版本）、全部成员与共享头总在其中。 */
  readonly state: Workspace;
  /** 治理行（按 `lock` 加锁）、当前策略、全部成员与共享头（不加锁）；工作区不存在时返回 false。必须最先调用。 */
  governance(lock: GovernanceLock): Promise<boolean>;
  /** 读取保留期内（`now` 之前 {@link receiptRetentionMs} 以内）的回执；有则返回 true。 */
  receipt(operationId: string, now: number): Promise<boolean>;
  /** 锁定（FOR UPDATE，按 ID 升序）并读取这些 PR；不存在的忽略。 */
  lockPrs(ids: readonly string[]): Promise<void>;
  /** 锁定（FOR UPDATE，按 ID 升序）并读取某个任务名下的全部 PR，返回它们的 ID（升序）。 */
  lockTaskPrs(taskId: string): Promise<string[]>;
  /** 某个任务名下全部 PR 的 ID（升序，不加锁），用来确认锁定之后集合没有变化。 */
  taskPrIds(taskId: string): Promise<string[]>;
  /** 读取（不加锁）这些 PR。 */
  prs(ids: readonly string[]): Promise<void>;
  /** 读取（不加锁）某个任务名下的全部 PR。 */
  taskPrs(taskId: string): Promise<void>;
  /** 按 `lock` 锁定共享引用并重新读取共享头。 */
  sharedRef(lock: RefLock): Promise<void>;
  /** 读取任务元数据与任务头，按 `lock` 锁定任务引用；任务不存在时不出现在状态里。 */
  task(id: string, lock: RefLock): Promise<void>;
  /** 读取（不加锁）讨论线程，含全部评论。 */
  threads(ids: readonly string[]): Promise<void>;
  /** 读取（不加锁）某个 PR 的全部讨论线程，含全部评论。 */
  prThreads(prId: string): Promise<void>;
  /** 读取（不加锁）某个 PR 的全部审核记录，按写入顺序。 */
  prReviews(prId: string): Promise<void>;
  /** 读取（不加锁）这些候选，含存储的变更。 */
  candidates(ids: readonly string[]): Promise<void>;
  /** 读取邀请。 */
  invitation(id: string): Promise<void>;
  /** 读取属于 `userId` 的这条通知。 */
  notification(id: string, userId: string): Promise<void>;
  /** 讨论线程所属的 PR（不可变，不加锁）；线程不存在时为 undefined。 */
  threadPr(threadId: string): Promise<string | undefined>;
  /** PR 所属的任务（不可变，不加锁）；PR 不存在时为 undefined。 */
  prTask(prId: string): Promise<string | undefined>;
}

/**
 * 一个命令事务可用的存储：提交与共享记录、局部状态的加载器，以及把局部状态的改动与命令效果写回的入口。
 * 写回只改动 `changes` 列出的行，引用按期望头比较交换推进；改动修订号时，版本行是写事务的最后一步。
 */
export interface CommandStore {
  readonly commits: CommitStore;
  readonly loader: WorkspaceLoader;
  save(changes: WorkspaceChanges, effects: Effects, now: number): Promise<void>;
}
