import { RxDB } from '@aiao/rxdb';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { SyncCommands } from '../sync-commands';
import { tenantGrants, tenantsWith } from './catalog-permissions';
import { fetchCallerBuckets, fetchTenants, type DemoTenant } from './catalog-remote';

/**
 * 商品目录页共用的远端状态：租户、当前身份能读的区，以及在各租户上的成员权限。
 *
 * @remarks
 * 页面级提供。成员权限来自引擎的授权快照 `rxdb.grants`（US-029）：Supabase 适配器读服务端 `rxdb_caller_grants()`，
 * 远端连接时与每轮同步进门时各刷新一次，写进本地库，离线重开沿用上次的快照。页面打开时、本页改了成员关系之后
 * 再刷新一次（`rxdb.grants.refresh()`）；每轮推拉之后重读租户与能读的区（拉到的可能是别人调整过的成员关系，
 * 能读的区跟着变，本地数据要等下一次同步才变，US-033 AC#3、#4）。两次刷新之间界面上可能还是旧权限，
 * 以推送时服务端的裁决为准。
 */
@Injectable()
export class CatalogRemoteState {
  readonly #session = inject(DemoSession);
  readonly #rxdb = inject(RxDB);
  readonly #tenants = signal<readonly DemoTenant[]>([]);
  readonly #callerBuckets = signal<readonly string[]>([]);
  readonly #error = signal<string | null>(null);
  /** 最近一次发起的读：交错的两次读只留后发起的那一次 */
  #generation = 0;

  /** 全部演示租户 */
  readonly $tenants = this.#tenants.asReadonly();
  /** 服务端 `rxdb_caller_buckets()`：当前身份能读的区 */
  readonly $callerBuckets = this.#callerBuckets.asReadonly();
  /** 引擎的授权快照：商品的写入口按它与 `CatalogItem` 的声明逐行派生（`CatalogLocalWrites`） */
  readonly $grantSnapshot = toSignal(this.#rxdb.grants.snapshot$, { initialValue: this.#rxdb.grants.snapshot });
  /** 当前身份在各作用域上的成员权限；快照还没取到时为空，访客没有租户作用域 */
  readonly $grants = computed(() => this.$grantSnapshot().grants);
  /** 当前身份所在的租户：每个成员关系都有 read，员工也算 */
  readonly $myTenantIds = computed(() => tenantGrants(this.$grants()).map(grant => grant.tenantId));
  /** 在服务端能改商品的租户（有 edit）：「模拟服务端变更」经 REST 写远端时按它列租户 */
  readonly $editableTenantIds = computed(() => tenantsWith(this.$grants(), 'edit'));
  /** 能调整成员权限的租户（有 manage） */
  readonly $managedTenantIds = computed(() => tenantsWith(this.$grants(), 'manage'));
  /** 上一次读取失败的原因 */
  readonly $error = this.#error.asReadonly();

  constructor() {
    // 授权快照已在每轮同步进门时由引擎刷新，这里只重读租户与能读的区
    toObservable(inject(SyncCommands).round)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => void this.#load(false));
  }

  /** 重新读一遍远端，连同授权快照：页面打开时、本页改了成员关系之后 */
  refresh(): Promise<void> {
    return this.#load(true);
  }

  /** 租户的名字；不认识的租户原样显示 id */
  tenantName(tenantId: string): string {
    return this.#tenants().find(tenant => tenant.id === tenantId)?.name ?? tenantId;
  }

  async #load(withGrants: boolean): Promise<void> {
    const client = this.#session.prepared?.client;
    if (!client) return;
    const generation = ++this.#generation;
    this.#error.set(null);
    try {
      const [tenants, callerBuckets] = await Promise.all([
        fetchTenants(client),
        fetchCallerBuckets(client),
        withGrants ? this.#rxdb.grants.refresh() : undefined
      ]);
      if (generation !== this.#generation) return;
      this.#tenants.set(tenants);
      this.#callerBuckets.set(callerBuckets);
    } catch (error) {
      if (generation === this.#generation) this.#error.set(getErrorMessage(error, '读取远端失败'));
    }
  }
}
