import {
  getRxDBIdentityDatabaseName,
  RXDB_ANONYMOUS_SUBJECT,
  RxDBError,
  RxDBIdentityMismatchError,
  sha256Hex,
  type RemoteChange,
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
 * 按授权分区只读同步（US-033）需要远端适配器提供的协议
 *
 * @remarks
 * 适配器五个方法都实现时，同步插件对登记为分区的实体改走「分区快照 + 快照点之后的增量」，
 * 其余实体照旧走通用日志拉取。
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
  getEntitySyncInfo(
    namespace: string,
    entity: string
  ): Promise<{
    namespace: string;
    entity: string;
    tableName: string | null;
    bucketed: boolean;
  }>;

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
 * @returns 对象键按字典序排列后的 JSON 文本
 */
export function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
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
