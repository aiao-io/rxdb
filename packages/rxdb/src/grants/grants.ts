/**
 * @fileoverview 本实例的授权快照（US-029）：状态、两种来源（应用设入 / 远端报告）、落库与读回。
 */

import { BehaviorSubject, firstValueFrom, type Observable } from 'rxjs';
import { getEntityAccessScope } from '../entity/entity-permissions.js';
import { isNetworkError } from '../repository/network-error.js';
import type { FindOptions } from '../repository/query-options.interface.js';
import type { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { RxDBError, RxDBReadOnlyError } from '../RxDBError.js';
import type { CallerIdentityReporter } from '../system/identity-binding.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import {
  grantsIssue,
  RXDB_GRANT_SOURCES,
  RxDBGrantSnapshot,
  type RxDBGrant,
  type RxDBGrantSource
} from './grant-snapshot.js';
import { RXDB_GRANT_STATE_ID, RxDBGrantState } from './grant-state.js';

/** 按主键读那一行 */
const STATE_BY_ID: FindOptions<typeof RxDBGrantState> = {
  where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: RXDB_GRANT_STATE_ID }] },
  limit: 1
};

/** 落库行里除主键之外的三列 */
interface GrantStateFields {
  readonly source: RxDBGrantSource;
  readonly grants: readonly RxDBGrant[];
  readonly updatedAt: Date;
}

const isGrantSource = (value: unknown): value is RxDBGrantSource =>
  RXDB_GRANT_SOURCES.includes(value as RxDBGrantSource);

/** 能报告授权的远端：实现了 `RxDBAdapterRemoteBase.callerGrants()` */
interface CallerGrantsReporter extends CallerIdentityReporter {
  callerGrants(): Promise<readonly RxDBGrant[]>;
}

const reportsCallerGrants = (adapter: unknown): adapter is CallerGrantsReporter =>
  typeof (adapter as Partial<CallerGrantsReporter> | undefined)?.callerGrants === 'function';

/**
 * 把落库行读成快照
 *
 * @remarks
 * 行是本机缓存，形状不可信（手工改库、将来的版本写下的新形状）：读不懂就按「未取到」处理。
 * 未取到时判定一律拒绝，不会因为读不懂而放行任何写；下一次设入或刷新会覆盖这一行。
 */
const snapshotOfRow = (row: RxDBGrantState): RxDBGrantSnapshot => {
  if (!isGrantSource(row.source) || grantsIssue(row.grants) !== null) return RxDBGrantSnapshot.UNKNOWN;
  return RxDBGrantSnapshot.known(row.grants as readonly RxDBGrant[], row.source, new Date(row.updatedAt));
};

/**
 * 本实例的授权快照：调用者在各作用域上有哪些成员权限
 *
 * @remarks
 * 规则形式的写权限（`permissions: { update: { requires: 'edit' } }`）按这份快照判定。
 *
 * - **来源**：有实体声明了作用域（`access`）、且远端适配器报告授权（`RxDBAdapterRemoteBase.callerGrants()`，
 *   Supabase 读 `rxdb_caller_grants()`）时，快照来自远端：远端连接时、同步每一轮进门时与 {@link RxDBGrants.refresh}
 *   各问一次，{@link RxDBGrants.set} 被拒。否则快照由应用经 {@link RxDBGrants.set} 设入。一个实例只认一个来源。
 * - **落库**：快照写进本实例的本地库（`rxdb_grant_state`）。本地库按身份分库（US-035），换身份就是换库，
 *   快照不跨库；离线关库重开，`connect()` 读回上次的快照，照样按它判定。远端在本地库之前连上时，那一次只发布、
 *   不落库，下一次刷新再落库。
 * - **离线**：远端连接时连不上远端，沿用上次的快照；远端没部署授权函数这类配置错误让连接失败。
 * - **事件**：{@link RxDBGrants.snapshot$} 只在内容变化时发出，同样的授权再设入一次不发。
 * - **多标签页**：快照是每个实例自己的，一个标签页设入不会推到别的标签页；各标签页各自设入或刷新。
 *
 * 判定只是快速失败，不是安全边界：远端刚发生的降权，本机在下一次刷新之前感知不到，那期间的写由远端在推送时拒绝。
 *
 * @example
 * ```typescript
 * await rxdb.connect('wa-sqlite');
 * await rxdb.grants.set([
 *   { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
 *   { scope: 'tenant:jiguang', permissions: ['read'] }
 * ]);
 * rxdb.grants.snapshot$.subscribe(snapshot => render(snapshot));
 * ```
 */
export class RxDBGrants {
  readonly #snapshot$ = new BehaviorSubject<RxDBGrantSnapshot>(RxDBGrantSnapshot.UNKNOWN);

  readonly #rxdb: RxDB;

  /** 当前快照：订阅时先交出当前值，之后只在内容变化时发出 */
  readonly snapshot$: Observable<RxDBGrantSnapshot> = this.#snapshot$.asObservable();

  /** 当前快照，同步读取 */
  get snapshot(): RxDBGrantSnapshot {
    return this.#snapshot$.value;
  }

  /**
   * @param rxdb - 所属实例
   */
  constructor(rxdb: RxDB) {
    this.#rxdb = rxdb;
  }

  /**
   * 由应用设入授权快照（来源 `'app'`）：先写进本地库，再发布
   *
   * @param grants - 调用者在各作用域上的权限；同一作用域出现多次时合并
   * @throws {@link RxDBReadOnlyError} 只读实例
   * @throws {@link RxDBError} 授权形状不对；本实例没有配置本地适配器；快照来自远端（见 {@link RxDBGrants.refresh}）
   *
   * @remarks
   * 写库失败时快照不变，错误原样抛出：快照与本地库里的那一行不能分叉，否则关库重开会回到另一份授权。
   * 在 `connect()` 之后调用。
   */
  async set(grants: readonly RxDBGrant[]): Promise<void> {
    if (this.#rxdb.readOnly) throw new RxDBReadOnlyError('grants.set');
    const updatedAt = new Date();
    const snapshot = RxDBGrantSnapshot.known(grants, 'app', updatedAt);
    if (this.#rxdb.config.sync.local?.adapter === undefined) {
      throw new RxDBError('授权快照要存进本地库，本实例没有配置本地适配器（sync.local.adapter）');
    }
    if ((await this.#remoteSource()) !== undefined) {
      throw new RxDBError(
        `授权快照来自远端适配器 ${String(this.#rxdb.config.sync.remote?.adapter)}（callerGrants()），不能由应用设入；` +
          '要立即重读远端用 rxdb.grants.refresh()'
      );
    }
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    await adapter.transaction(executor => this.#write(executor, { source: 'app', grants: snapshot.grants, updatedAt }));
    this.#publish(snapshot);
  }

  /**
   * 从本地库读回上次的快照（`connect()` 打开既有库时调用）
   *
   * @param adapter - 正在引导的本地适配器
   *
   * @remarks
   * 走引导期事务：此刻还在 `connect()` 里，普通查询的就绪门等的正是这一次 `connect()`，排进去就是等自己。
   *
   * @internal
   */
  async load(adapter: Pick<RxDBAdapterLocalBase, 'bootstrapTransaction'>): Promise<void> {
    const [row] = await adapter.bootstrapTransaction(
      executor => executor.getRepository(RxDBGrantState).find(STATE_BY_ID),
      false
    );
    this.#publishIfNotOlder(row === undefined ? RxDBGrantSnapshot.UNKNOWN : snapshotOfRow(row));
  }

  /**
   * 从远端重读授权快照（来源 `'remote'`）：先核对调用者身份，再问远端，本地库已连上就写进去，然后发布
   *
   * @throws `RxDBIdentityMismatchError` 远端会话是别的身份；什么都不问、快照不变
   * @throws 远端报的错原样抛出（离线、服务端没部署授权函数等），快照不变
   *
   * @remarks
   * 没有实体声明作用域、或远端适配器不报告授权时什么都不做：快照由应用设入，这里没有可重读的来源。
   * 同步插件在每一轮进门时调它，应用在知道权限刚改过（如管理员调整了成员权限）时也可以调。
   */
  async refresh(): Promise<void> {
    const remote = await this.#remoteSource();
    if (remote) await this.#refreshFrom(remote);
  }

  /**
   * 远端连接时刷新一次（`connect()` 调用）
   *
   * @param remote - 刚连上的远端适配器
   * @throws 远端没部署授权函数、交回的形状不对、会话是别的身份：连接失败
   *
   * @remarks
   * 连不上远端（离线）不算失败：沿用上次的快照，下一次刷新再问。
   *
   * @internal
   */
  async refreshOnConnect(remote: unknown): Promise<void> {
    if (!this.#scoped() || !reportsCallerGrants(remote)) return;
    try {
      await this.#refreshFrom(remote);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }

  /** 内容变了才发：同样的授权再设入一次，判定与界面都不该被打扰 */
  #publish(snapshot: RxDBGrantSnapshot): void {
    if (!snapshot.equals(this.snapshot)) this.#snapshot$.next(snapshot);
  }

  /**
   * 不比内存里的旧才发布：内存里还没有，或这一份的取得时间不早于内存里的
   *
   * @remarks
   * 两处会送来过时的快照：远端先于本地库连上时，那一次的远端快照只发布、还没落库，随后打开本地库读回的是更早的一份；
   * 两次刷新交错时，先开始（取得时间更早）的那次可能晚到。两处都不能拿更早的结果盖掉更新的。
   */
  #publishIfNotOlder(candidate: RxDBGrantSnapshot): void {
    const current = this.snapshot;
    const notOlder =
      current.status === 'unknown' ||
      (candidate.status === 'known' && Number(candidate.updatedAt) >= Number(current.updatedAt));
    if (notOlder) this.#publish(candidate);
  }

  /** 有实体声明了作用域：只有这时才需要授权快照，远端才值得问 */
  #scoped(): boolean {
    return this.#rxdb.config.entities.some(
      EntityType => getEntityAccessScope(getEntityMetadata(EntityType)) !== undefined
    );
  }

  /** 快照的远端来源：有实体声明了作用域、且配置的远端适配器报告授权；否则 `undefined`（来源是应用） */
  async #remoteSource(): Promise<CallerGrantsReporter | undefined> {
    const name = this.#rxdb.config.sync.remote?.adapter;
    if (name === undefined || !this.#scoped()) return undefined;
    const remote: unknown = await this.#rxdb.getAdapter(name);
    return reportsCallerGrants(remote) ? remote : undefined;
  }

  /**
   * 问一次远端：身份核对在前（授权是要落进这个身份的库的数据），本地库已连上才落库
   *
   * @remarks
   * 不等本地库连上：远端可能先连、甚至与本地并行连接，等待本地会让远端的 `connect()` 卡在一条还没开始的连接上。
   * 取得时间记在问远端之前，交错的两次刷新按它比先后（见 `#publishIfNotOlder`）。
   */
  async #refreshFrom(remote: CallerGrantsReporter): Promise<void> {
    await this.#rxdb.assertCallerIdentity(remote);
    const updatedAt = new Date();
    const snapshot = RxDBGrantSnapshot.known(await remote.callerGrants(), 'remote', updatedAt);
    const local = this.#rxdb.localAdapterIfConnected;
    if (local) {
      await local.transaction(executor =>
        this.#write(executor, { source: 'remote', grants: snapshot.grants, updatedAt })
      );
    }
    this.#publishIfNotOlder(snapshot);
  }

  /** 在调用方的事务里写那一行：有就改写，没有就新建 */
  async #write(executor: TransactionExecutor, fields: GrantStateFields): Promise<void> {
    const repository = executor.getRepository(RxDBGrantState);
    const [existing] = await repository.find(STATE_BY_ID);
    if (existing) {
      await repository.update(existing, fields);
      return;
    }
    const row = Object.assign(this.#rxdb.entityManager.instantiate(RxDBGrantState), {
      id: RXDB_GRANT_STATE_ID,
      ...fields
    });
    await repository.create(row);
  }
}
