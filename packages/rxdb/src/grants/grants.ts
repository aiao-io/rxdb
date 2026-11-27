/**
 * @fileoverview 本实例的授权快照（US-029）：状态、应用设入、落库与读回。
 */

import { BehaviorSubject, firstValueFrom, type Observable } from 'rxjs';
import type { FindOptions } from '../repository/query-options.interface.js';
import type { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import type { RxDB } from '../RxDB.js';
import { RxDBError, RxDBReadOnlyError } from '../RxDBError.js';
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
 * - **来源**：没有远端授权来源的应用经 {@link RxDBGrants.set} 直接设入；远端来源由远端适配器报告（Supabase 读
 *   `rxdb_caller_grants()`）。一个实例只认一个来源。
 * - **落库**：快照写进本实例的本地库（`rxdb_grant_state`）。本地库按身份分库（US-035），换身份就是换库，
 *   快照不跨库；离线关库重开，`connect()` 读回上次的快照，照样按它判定。
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
   * @throws {@link RxDBError} 授权形状不对；本实例没有配置本地适配器
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
    this.#publish(row === undefined ? RxDBGrantSnapshot.UNKNOWN : snapshotOfRow(row));
  }

  /** 内容变了才发：同样的授权再设入一次，判定与界面都不该被打扰 */
  #publish(snapshot: RxDBGrantSnapshot): void {
    if (!snapshot.equals(this.snapshot)) this.#snapshot$.next(snapshot);
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
