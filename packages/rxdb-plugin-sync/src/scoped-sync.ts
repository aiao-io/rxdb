import {
  getRxDBIdentityDatabaseName,
  RXDB_ANONYMOUS_SUBJECT,
  RxDBError,
  RxDBIdentityMismatchError,
  sha256Hex,
  type RemoteChange,
  type RepositoryIdentifier,
  type RuleGroup,
  type RxDBIdentity
} from '@aiao/rxdb';

/** 同步插件绑定本地库时用的身份，与核心的 `RxDBIdentity` 同形状 */
export type ScopedSyncIdentity = RxDBIdentity;

/**
 * 能报告「本地库该绑定给谁」的远端适配器
 *
 * @remarks
 * 实现了它的适配器，同步插件在第一次与远端交换数据时把本地库绑定到它报告的身份，之后身份变了就停止同步。
 * 必须与适配器的 `callerIdentity()` 同一编码：同一个令牌只能有一个身份。
 */
export interface ScopedSyncIdentitySource {
  /** 当前调用者的身份；只读本地已有的会话状态 */
  syncIdentity(): Promise<ScopedSyncIdentity>;
}

/**
 * 实体在远端的登记信息：{@link ScopedSyncAdapter.getEntitySyncInfo} 的答案
 */
export interface ScopedEntitySyncInfo {
  /** 实体命名空间 */
  namespace: string;

  /** 实体名 */
  entity: string;

  /** 业务表名；实体没在远端登记过时为 `null` */
  tableName: string | null;

  /** 为 `true` 的实体走按区同步 */
  bucketed: boolean;
}

/**
 * 按授权分区只读同步（US-033）需要远端适配器提供的协议
 *
 * @remarks
 * 适配器六个必需的方法都实现时，同步插件对登记为分区的实体改走「分区快照 + 快照点之后的增量」，
 * 其余实体照旧走通用日志拉取。{@link ScopedSyncAdapter.getEntitySyncInfos} 是可选的批量问法（US-236）。
 */
export interface ScopedSyncAdapter {
  /** 当前调用者可读的分区 */
  getCallerBuckets(): Promise<string[]>;

  /**
   * 实体在远端的登记信息
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @returns `bucketed` 为 `true` 的实体走按区同步
   */
  getEntitySyncInfo(namespace: string, entity: string): Promise<ScopedEntitySyncInfo>;

  /**
   * 一次问齐多个实体的登记信息（US-236），可选
   *
   * @param entities - 要问的实体
   * @returns 与 `entities` 同序，每一项同 {@link ScopedSyncAdapter.getEntitySyncInfo}
   *
   * @remarks
   * 实现了它，同步状态统计与 `pull()` 每一轮只问一次远端；没实现时逐个并发问 `getEntitySyncInfo`，见 {@link entitySyncInfosOf}。
   */
  getEntitySyncInfos?(entities: readonly RepositoryIdentifier[]): Promise<ScopedEntitySyncInfo[]>;

  /**
   * 分区在给定分支上的日志水位（最大日志 id）
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param branchIds - 只算这些分支，与拉取同口径；不传时算全部分支
   * @throws 分区此刻已不属于调用者时（参考 SQL 报 `42501`）；状态查询据重读 {@link ScopedSyncAdapter.getCallerBuckets} 判定撤销
   */
  getBucketSnapshotPoint(
    namespace: string,
    entity: string,
    bucket: string,
    branchIds?: readonly string[]
  ): Promise<number>;
  /**
   * 分区在游标之后的日志条数（US-233）
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param afterId - 游标：只数 id 大于它的日志
   * @param branchIds - 只算这些分支，与拉取同口径
   * @param ids - 给了就只数这些 id 里落在这个分区的；调用方每批不超过 100 个
   * @returns 条数；不求值实体同步规则，与 {@link ScopedSyncAdapter.getBucketSnapshotPoint} 同口径
   * @throws 分区此刻已不属于调用者时，同 {@link ScopedSyncAdapter.getBucketSnapshotPoint}
   *
   * @remarks
   * 待拉数靠它：日志 id 是全库共用的序列，拿快照点减游标会把别的实体、别的区的变更都算进来。
   * 不按客户端标识排除自己推的：那个标识每次启动都换，刷新之后认不出上一次会话推的。调用方拿本地记下的
   * 远端 id（推送回执写的 `RxDBChange.remoteId`）按 `ids` 再问一次落在这个区的有几条，两次相减。
   */
  getBucketChangeCount(
    namespace: string,
    entity: string,
    bucket: string,
    afterId: number,
    branchIds: readonly string[],
    ids?: readonly number[]
  ): Promise<number>;

  /**
   * 读一页分区快照，按 id 升序
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param filter - 实体同步规则
   * @param afterId - 上一页最后一行的 id（`String(row.id)`）；第一页为 `null`
   * @param limit - 每页行数
   */
  pullBucketSnapshot(
    namespace: string,
    entity: string,
    bucket: string,
    filter: RuleGroup | undefined,
    afterId: string | null,
    limit: number
  ): Promise<Record<string, unknown>[]>;

  /**
   * 拉分区在游标之后的增量日志
   *
   * @param sinceId - 游标：只返回 id 大于它的日志
   * @param limit - 最多返回条数
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param filter - 实体同步规则；不再匹配的行以 DELETE 返回
   * @param branchId - 只拉这个分支
   */
  pullBucketChanges(
    sinceId: number,
    limit: number,
    namespace: string,
    entity: string,
    bucket: string,
    filter?: RuleGroup,
    branchId?: string
  ): Promise<RemoteChange[]>;
}

/**
 * 状态查询按区数待拉数要用的那几个原语（与单仓的 `checkRepositoryUpdates` 同一组判据）
 *
 * @internal
 */
export type ScopedStatusAdapter = Pick<
  ScopedSyncAdapter,
  'getCallerBuckets' | 'getEntitySyncInfo' | 'getEntitySyncInfos' | 'getBucketSnapshotPoint' | 'getBucketChangeCount'
>;

/**
 * 远端适配器实现了按区数待拉数要用的原语时，按 {@link ScopedStatusAdapter} 交回
 *
 * @param adapter - 远端适配器
 * @returns 四个原语（`getCallerBuckets` / `getEntitySyncInfo` / `getBucketSnapshotPoint` / `getBucketChangeCount`）都在时为它本身，否则为 `undefined`
 *
 * @internal
 */
export function scopedStatusAdapterOf(adapter: object): ScopedStatusAdapter | undefined {
  const candidate = adapter as Partial<ScopedSyncAdapter>;
  const supported =
    typeof candidate.getCallerBuckets === 'function' &&
    typeof candidate.getEntitySyncInfo === 'function' &&
    typeof candidate.getBucketSnapshotPoint === 'function' &&
    typeof candidate.getBucketChangeCount === 'function';
  return supported ? (candidate as ScopedStatusAdapter) : undefined;
}

/**
 * 远端能一次数完待拉数时的那一面（US-236）
 *
 * @param adapter - 远端适配器
 * @returns 实现了 {@link PendingChangeCountAdapter} 时是它自己，否则 `undefined`
 */
export function pendingCountAdapterOf(adapter: object): PendingChangeCountAdapter | undefined {
  const candidate = adapter as Partial<PendingChangeCountAdapter>;
  return typeof candidate.countPendingChanges === 'function' ? (candidate as PendingChangeCountAdapter) : undefined;
}

/**
 * 问齐一批实体在远端的登记信息（US-236）
 *
 * @param adapter - 支持按区同步的远端适配器
 * @param entities - 要问的实体
 * @returns 与 `entities` 同序的登记信息；`entities` 为空时不问
 *
 * @remarks
 * 适配器能一次问完（{@link ScopedSyncAdapter.getEntitySyncInfos}）就一次问，否则逐个并发问。
 */
export function entitySyncInfosOf(
  adapter: Pick<ScopedSyncAdapter, 'getEntitySyncInfo' | 'getEntitySyncInfos'>,
  entities: readonly RepositoryIdentifier[]
): Promise<ScopedEntitySyncInfo[]> {
  if (entities.length === 0) return Promise.resolve([]);
  if (typeof adapter.getEntitySyncInfos === 'function') return adapter.getEntitySyncInfos(entities);
  return Promise.all(entities.map(({ namespace, entity }) => adapter.getEntitySyncInfo(namespace, entity)));
}

/**
 * 待拉数探针：一个仓库（分区实体细到一个区）在游标之后、不是本库推上去的日志条数（US-236）
 */
export interface PendingChangeProbe {
  /** 实体命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 分区；未分区的日志为 `null` */
  readonly bucket: string | null;

  /** 游标：只数 id 大于它的日志 */
  readonly afterId: number;

  /** 本库推上去的远端 id（推送回执写下的 `RxDBChange.remoteId`）：落在范围里的不算 */
  readonly excludeIds: readonly number[];
}

/**
 * 一次数清多个仓库待拉数的远端适配器（US-236），可选能力
 *
 * @remarks
 * 实现了它，同步状态统计一轮只问一次远端，单仓的 `checkRepositoryUpdates` 也经它数未分区日志；没实现时逐个探针用
 * `getChangeCount` 与 {@link ScopedSyncAdapter.getBucketChangeCount} 数，有并发上限。口径相同：游标之后、给定分支上、
 * 不是本库推上去的变更；分区此刻已不属于调用者时数出 0。
 *
 * 只有它与 `getBucketChangeCount` 能按远端实际存在的 id 排除本库推上去的变更。没实现时未分区日志只能拿总数减去
 * 本库推上去的 id 个数：远端日志删掉了其中几条（运维裁剪、重新登记时的清理）就会少数、把别人的变更抵掉。
 * 日志会被裁剪的远端应当实现它。
 */
export interface PendingChangeCountAdapter {
  /**
   * 数清一批探针
   *
   * @param probes - 探针
   * @param branchIds - 只数这些分支（当前分支及其祖先），与拉取同口径
   * @returns 与 `probes` 同序的条数
   */
  countPendingChanges(probes: readonly PendingChangeProbe[], branchIds: readonly string[]): Promise<number[]>;
}

const IDENTITY_KEY_VERSION = 1;

/** 绑定身份的种类：未登录的访客共用一个 `anon`，登录用户各自一个 `user` */
export type ScopedIdentityKind = 'anon' | 'user';

/**
 * 身份的种类
 *
 * @param identity - 调用者身份
 * @returns subject 为 `RXDB_ANONYMOUS_SUBJECT` 时是 `anon`，否则是 `user`
 */
export function scopedIdentityKind(identity: ScopedSyncIdentity): ScopedIdentityKind {
  return identity.subject === RXDB_ANONYMOUS_SUBJECT ? 'anon' : 'user';
}

/**
 * 本地库绑定的身份与当前会话的身份对不上
 *
 * @remarks
 * 是核心 `RxDBIdentityMismatchError`（`source: 'database'`）的子类：库绑定在声明的身份上时，
 * 会话对不上由核心先拦下、抛核心的类；没有声明身份时由本插件按第一次同步时的会话绑定，对不上抛这个子类。
 * 第一次按会话绑定时库已由核心绑定给别的身份（曾以别的身份声明打开），抛的同样是核心的类。
 * 应用按核心的类 catch 就能接住两种情况；需要区分 anon 与登录用户时读这里多出的两个种类字段。
 * 同步停在原地，不发远端请求，本地数据不动。
 */
export class IdentityMismatchError extends RxDBIdentityMismatchError {
  constructor(
    /** 本地库绑定的身份种类 */
    readonly boundIdentityKind: ScopedIdentityKind,
    /** 当前会话的身份种类 */
    readonly currentIdentityKind: ScopedIdentityKind,
    /** 本地库绑定的身份指纹 */
    readonly boundFingerprint: string,
    /** 当前会话的身份指纹 */
    readonly currentFingerprint: string
  ) {
    super('database', currentFingerprint, [boundFingerprint]);
    this.name = 'IdentityMismatchError';
    Object.setPrototypeOf(this, IdentityMismatchError.prototype);
  }
}

/**
 * 身份指纹：对「后端标识 + 身份」取 SHA-256
 *
 * @param identity - 调用者身份
 * @returns 64 位小写十六进制，与核心算的身份键同一算法；不含 subject 原文
 */
export function identityFingerprint(identity: ScopedSyncIdentity): string {
  const encoded = JSON.stringify(['rxdb-identity', IDENTITY_KEY_VERSION, identity.scope, identity.subject]);
  return sha256Hex(new TextEncoder().encode(encoded));
}

/**
 * 按身份算本地库名
 *
 * @param baseName - 应用自己的库名，首尾空白会被去掉
 * @param identity - 调用者身份
 * @returns 与 `getRxDBIdentityDatabaseName()` 相同的结果
 * @throws {@link RxDBError} 基础名为空
 */
export function scopedDatabaseName(baseName: string, identity: ScopedSyncIdentity): string {
  const normalized = baseName.trim();
  if (normalized.length === 0) throw new RxDBError('A non-empty base database name is required.');
  return getRxDBIdentityDatabaseName(normalized, identity);
}

/**
 * 实体同步规则的指纹：规则变了，分区进度要重建
 *
 * @param filter - 实体同步规则；没有规则时为 `undefined`
 * @returns 没有规则时为 `'all'`，否则是规范化 JSON 的 FNV-1a 64 位摘要
 */
export function filterFingerprint(filter: RuleGroup | undefined): string {
  return filter ? `v1-${fnv1a64(canonicalize(filter))}` : 'all';
}

/**
 * 与键序无关的 JSON 编码
 *
 * @param value - 任意可 JSON 化的值；`Date` 按 ISO 字符串编码
 * @returns 对象键按 UTF-16 码元排序后的 JSON 文本
 *
 * @remarks
 * 不用 `localeCompare`：它按运行环境的语言区域与 ICU 版本排序，大小写、标点、`aa`（丹麦语）的先后因地而异，
 * 同一份规则换个环境就是另一个指纹，分区进度随之作废、整区快照重拉。
 */
export function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    // 同一个对象的键互不相同，两路比较就够了
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
