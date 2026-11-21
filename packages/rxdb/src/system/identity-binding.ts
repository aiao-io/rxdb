/**
 * @fileoverview 本地库与身份的绑定（US-035）：换了登录身份，不能让新身份读到上一个身份的数据。
 *
 * @remarks
 * 同一个本地库换了登录身份，上一个身份同步下来的行仍在库里，留下的待推变更也会被下一个身份推出去。
 * 这件事没有编译期形态，所以在两处按数据实测：
 *
 * - **打开时**：库里记着它属于谁（`rxdb_migration` 的一行水位，与能力认领、引导指纹同一类「这个库上发生过什么」），
 *   与应用声明的身份对不上就拒绝连接。守卫排在一切写入之前，离线同样生效；
 * - **与远端交换数据之前**：问远端适配器当前调用者是谁，与声明的身份对不上就停下，一个请求都不发。
 *   问的是此刻的调用者而不是缓存值：令牌可能在两次请求之间换了主人。
 *
 * 不提供自动改绑：把库改绑给另一个身份，等于把上一个身份的数据交给他。身份不匹配只有一种处置，
 * 就是换到该身份自己的库（{@link getRxDBIdentityDatabaseName}）。
 *
 * 防的是误混，不是保密：本地库不加密时，能打开浏览器存储的人仍然读得到每个身份的库。
 */

import { defer, from, switchMap, type Observable } from 'rxjs';
import { RxDBError } from '../RxDBError.js';
import type { QueryCacheRemoteAdapter } from '../repository/query-cache.interface.js';
import { sha256Hex } from './sha256.js';

/**
 * 本地库所属的身份
 *
 * @remarks
 * 两个字段都只在内存里使用：库里记的、库名里用的都是它们的不可逆摘要。
 */
export interface RxDBIdentity {
  /**
   * 后端标识：同一个身份在不同后端是不同的库
   *
   * @example 'https://project-a.supabase.co'
   */
  readonly scope: string;

  /**
   * 身份：未登录用 {@link RXDB_ANONYMOUS_SUBJECT}，登录用用户 id
   *
   * @remarks
   * 必须与远端适配器的 `callerIdentity()` 报告的值同口径。
   */
  readonly subject: string;
}

/** 未登录（匿名访问）的身份值：公开数据本来就不需要区分是谁，所有访客共用这一个身份 */
export const RXDB_ANONYMOUS_SUBJECT = 'anon' as const;

/**
 * 身份绑定水位行的名字前缀
 *
 * @remarks
 * 借 `rxdb_migration` 的一行记录，不另开表、不升系统 schema。双下划线包裹是为了不与用户迁移名相撞，
 * 与 `RXDB_CAPABILITY_WATERMARK_PREFIX`、`RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX` 互不重叠，
 * 所以迁移与能力守卫都读不到这些行。**前缀一旦发布就不能改**：改了等于既有库的绑定集体失踪，
 * 下一次打开会把它们当成未绑定、就地绑给打开它的那个身份。
 */
export const RXDB_IDENTITY_WATERMARK_PREFIX = '__rxdb_identity__:' as const;

/** 身份键的编码版本：改了编码就换版本，旧键不会与新键撞上 */
const IDENTITY_KEY_VERSION = 1;

/**
 * 库名里取身份键的前多少位十六进制：64 位
 *
 * @remarks
 * 库名受存储后端的路径长度限制：wa-sqlite 内置 VFS 的库名（含 `@0_1` 后缀）上限 49 字节，
 * 摘要越长留给应用自己的库名就越短。库名只负责把不同身份分到不同的库，真正的守卫是库里记的完整身份键：
 * 就算两个身份撞了库名，打开时也会因为绑定对不上而被拒绝。
 */
const DATABASE_NAME_KEY_LENGTH = 16;

/** 摘要在报错文案里只露前几位：够对照、不够反推 */
const SHORT_KEY_LENGTH = 12;

const shortKey = (key: string): string => key.slice(0, SHORT_KEY_LENGTH);

/**
 * 校验身份声明的形状
 *
 * @param identity - 应用声明的身份
 * @throws {@link RxDBError} 缺字段、字段不是非空字符串
 *
 * @remarks
 * 声明里的空串不会被当成「未登录」悄悄放行：未登录要显式写 {@link RXDB_ANONYMOUS_SUBJECT}。
 */
export function assertRxDBIdentity(identity: RxDBIdentity): void {
  const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
  if (typeof identity !== 'object' || identity === null || !isText(identity.scope) || !isText(identity.subject)) {
    throw new RxDBError(
      'RxDBOptions.identity must be { scope, subject } with two non-empty strings; ' +
        `use "${RXDB_ANONYMOUS_SUBJECT}" as the subject for an unauthenticated client.`
    );
  }
}

/**
 * 算身份键：对「后端标识 + 身份」取 SHA-256
 *
 * @param identity - 应用声明的身份
 * @returns 64 位小写十六进制；同一组输入恒得同一个键，不同的输入不会撞上
 *
 * @remarks
 * 摘要是为了库名与库里的记录不出现用户 id 原文。用户 id 本身是随机的，不靠摘要保密。
 * 两个字段以 JSON 数组编码再取摘要，拼接没有歧义（`("a","bc")` 与 `("ab","c")` 是两个键）。
 *
 * @internal
 */
export function getRxDBIdentityKey(identity: RxDBIdentity): string {
  const encoded = JSON.stringify(['rxdb-identity', IDENTITY_KEY_VERSION, identity.scope, identity.subject]);
  return sha256Hex(new TextEncoder().encode(encoded));
}

/**
 * 按身份算本地库名
 *
 * @param baseName - 应用自己的库名（用户可读的逻辑名）
 * @param identity - 应用声明的身份
 * @returns `<baseName>-<身份键前 16 位>`：同一个身份恒得同一个名字，不同身份或不同后端互不相同，名字里不含用户 id 原文
 * @throws {@link RxDBError} 基础名为空，或身份声明不合法
 *
 * @remarks
 * 名字比基础名多 17 个字节。wa-sqlite 内置 VFS 的库名（含 `@0_1` 后缀）上限 49 字节，所以基础名要留在 28 字节以内。
 *
 * @example
 * ```ts
 * const identity = { scope: supabaseUrl, subject: session?.user.id ?? RXDB_ANONYMOUS_SUBJECT };
 * const rxdb = new RxDB({
 *   dbName: getRxDBIdentityDatabaseName('todo', identity),
 *   identity,
 *   entities: [Todo],
 *   sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
 * });
 * ```
 */
export function getRxDBIdentityDatabaseName(baseName: string, identity: RxDBIdentity): string {
  if (typeof baseName !== 'string' || baseName.length === 0) {
    throw new RxDBError('getRxDBIdentityDatabaseName requires a non-empty base name.');
  }
  assertRxDBIdentity(identity);
  return `${baseName}-${getRxDBIdentityKey(identity).slice(0, DATABASE_NAME_KEY_LENGTH)}`;
}

/**
 * 身份对不上
 *
 * @remarks
 * 两种来源：
 * - `database`：本地库绑定的是别的身份。连接被拒，本地数据一行不动；
 * - `remote`：远端会话实际是别的身份。没有与远端交换任何数据，本地数据一行不动，待推变更留在原处。
 *
 * 唯一的处置是换到该身份自己的库。键都是不可逆摘要，文案与字段里没有用户 id 原文。
 */
export class RxDBIdentityMismatchError extends RxDBError {
  constructor(
    /** 在哪一处发现对不上 */
    readonly source: 'database' | 'remote',
    /** 本客户端声明的身份键 */
    readonly clientKey: string,
    /** 另一边的身份键：库里绑定的（可能不止一个），或远端会话报告的 */
    readonly foundKeys: readonly string[]
  ) {
    const found = foundKeys.map(shortKey).join(', ');
    super(
      source === 'database' ?
        `Local database is bound to a different identity: this client is ${shortKey(clientKey)} but the database belongs to ${found}. ` +
          `Local data is untouched. Open the database of this identity instead (see getRxDBIdentityDatabaseName).`
      : `The remote session belongs to a different identity: this client is ${shortKey(clientKey)} but the remote reports ${found}. ` +
          `Nothing was exchanged with the remote and local data is untouched. Open the database of the signed-in identity instead (see getRxDBIdentityDatabaseName).`
    );
    this.name = 'RxDBIdentityMismatchError';
    Object.setPrototypeOf(this, RxDBIdentityMismatchError.prototype);
  }
}

/**
 * 身份绑定水位行的行名
 *
 * @param key - {@link getRxDBIdentityKey} 的结果
 * @returns `rxdb_migration."name"`
 *
 * @internal
 */
export const identityWatermarkName = (key: string): string => `${RXDB_IDENTITY_WATERMARK_PREFIX}${key}`;

/**
 * 核对库里的身份绑定
 *
 * @param migrationNames - `rxdb_migration` 全表的 `name` 列，顺序无关
 * @param clientKey - 本客户端声明的身份键；没有声明身份时为 `undefined`
 * @returns 库里已经绑定了本身份时为 `true`；没有声明身份、或库还没绑定时为 `false`（调用方据此决定要不要绑定）
 * @throws {@link RxDBIdentityMismatchError} 库里有别的身份的绑定
 *
 * @remarks
 * 库里同时有本身份与别的身份的行也拒绝：正常路径写不出这种库，出现了就是并发打开或手工改库，
 * 不能因为「里面也有我的」就放行。
 *
 * @internal
 */
export function assertIdentityBinding(migrationNames: readonly string[], clientKey: string | undefined): boolean {
  if (clientKey === undefined) return false;
  const bound = migrationNames
    .filter(name => name.startsWith(RXDB_IDENTITY_WATERMARK_PREFIX))
    .map(name => name.slice(RXDB_IDENTITY_WATERMARK_PREFIX.length));
  const foreign = bound.filter(key => key !== clientKey);
  if (foreign.length > 0) throw new RxDBIdentityMismatchError('database', clientKey, foreign);
  return bound.length > 0;
}

/** 能报告「当前调用者是谁」的远端：对应 `RxDBAdapterRemoteBase.callerIdentity()` */
export interface CallerIdentityReporter {
  callerIdentity?: () => Promise<string>;
}

/**
 * 核对远端会话的身份
 *
 * @param identity - 本客户端声明的身份；没有声明时不核对，也不问远端
 * @param remote - 远端适配器
 * @throws {@link RxDBIdentityMismatchError} 远端会话是别的身份
 * @throws {@link RxDBError} 适配器不报告调用者身份，或报告了空值
 *
 * @remarks
 * 适配器不报告身份时拒绝，不当作通过：声明了身份却无法核对，就是没有这道防线，不能静默降级。
 * 每次都问、不缓存。
 *
 * @internal
 */
export async function assertCallerIdentity(
  identity: RxDBIdentity | undefined,
  remote: CallerIdentityReporter
): Promise<void> {
  if (identity === undefined) return;
  if (typeof remote.callerIdentity !== 'function') {
    throw new RxDBError(
      'RxDBOptions.identity is set but the remote adapter does not implement callerIdentity(), ' +
        'so the session identity cannot be verified before exchanging data.'
    );
  }
  const reported = await remote.callerIdentity();
  if (typeof reported !== 'string' || reported.length === 0) {
    throw new RxDBError('The remote adapter reported an empty caller identity; refusing to exchange data.');
  }
  if (reported === identity.subject) return;
  throw new RxDBIdentityMismatchError('remote', getRxDBIdentityKey(identity), [
    getRxDBIdentityKey({ scope: identity.scope, subject: reported })
  ]);
}

/**
 * 给 QueryCache 要用的远端包一层身份核对
 *
 * @param identity - 本客户端声明的身份；没有声明时原样返回 `remote`
 * @param remote - 远端适配器
 * @returns 五个入口（`fetchMetadata` / `findByIds` / `create` / `update` / `delete`）每次订阅时先核对身份再转发的替身；
 *   远端没有的可选写入口，替身上同样没有
 *
 * @remarks
 * 替身只含 QueryCache 引擎消费的那五个入口，不用 `Proxy`：远端适配器带私有字段，方法必须以它本身为 `this` 调用。
 * 核对发生在订阅时而不是调用时：同一个 Observable 被重新订阅，等于又发一次请求，必须再核对一次。
 *
 * @internal
 */
export function createIdentityGuardedQueryCacheRemote<R extends QueryCacheRemoteAdapter & CallerIdentityReporter>(
  identity: RxDBIdentity | undefined,
  remote: R
): QueryCacheRemoteAdapter {
  if (identity === undefined) return remote;
  const guard = <T>(request: () => Observable<T>): Observable<T> =>
    defer(() => from(assertCallerIdentity(identity, remote))).pipe(switchMap(request));

  const guarded: QueryCacheRemoteAdapter = {
    fetchMetadata: (entityName, query) => guard(() => remote.fetchMetadata(entityName, query)),
    findByIds: (entityName, ids) => guard(() => remote.findByIds(entityName, ids))
  };
  if (remote.create) {
    const create = remote.create.bind(remote);
    guarded.create = (entityName, data) => guard(() => create(entityName, data));
  }
  if (remote.update) {
    const update = remote.update.bind(remote);
    guarded.update = (entityName, id, data) => guard(() => update(entityName, id, data));
  }
  if (remote.delete) {
    const remove = remote.delete.bind(remote);
    guarded.delete = (entityName, ids) => guard(() => remove(entityName, ids));
  }
  return guarded;
}
