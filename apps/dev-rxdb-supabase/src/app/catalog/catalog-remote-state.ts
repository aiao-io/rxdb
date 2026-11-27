import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { SyncCommands } from '../sync-commands';
import { tenantGrants, tenantsWith } from './catalog-permissions';
import {
  fetchCallerBuckets,
  fetchCallerGrants,
  fetchTenants,
  type CallerGrant,
  type DemoTenant
} from './catalog-remote';

/**
 * 商品目录页共用的远端状态：租户、当前身份能读的区，以及在各租户上的成员权限。
 *
 * @remarks
 * 页面级提供。打开页面时、每轮推拉之后、本页改了成员关系之后各重读一次（US-234）：拉到的可能是别人调整过的成员关系，
 * 推送被拒多半是权限变了。能读的区跟着变，本地数据要等下一次同步才变（US-033 AC#3、#4）；两次读之间界面上可能还是旧权限，
 * 以推送时服务端的裁决为准。
 */
@Injectable()
export class CatalogRemoteState {
  readonly #session = inject(DemoSession);
  readonly #tenants = signal<readonly DemoTenant[]>([]);
  readonly #callerBuckets = signal<readonly string[]>([]);
  readonly #grants = signal<readonly CallerGrant[]>([]);
  readonly #error = signal<string | null>(null);
  /** 最近一次发起的读：交错的两次读只留后发起的那一次 */
  #generation = 0;

  /** 全部演示租户 */
  readonly $tenants = this.#tenants.asReadonly();
  /** 服务端 `rxdb_caller_buckets()`：当前身份能读的区 */
  readonly $callerBuckets = this.#callerBuckets.asReadonly();
  /** 服务端 `rxdb_caller_grants()`：当前身份在各作用域上的成员权限；访客没有 */
  readonly $grants = this.#grants.asReadonly();
  /** 当前身份所在的租户：每个成员关系都有 read，员工也算 */
  readonly $myTenantIds = computed(() => tenantGrants(this.#grants()).map(grant => grant.tenantId));
  /** 能改商品的租户（有 edit） */
  readonly $editableTenantIds = computed(() => tenantsWith(this.#grants(), 'edit'));
  /** 能调整成员权限的租户（有 manage） */
  readonly $managedTenantIds = computed(() => tenantsWith(this.#grants(), 'manage'));
  /** 上一次读取失败的原因 */
  readonly $error = this.#error.asReadonly();

  constructor() {
    toObservable(inject(SyncCommands).round)
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => void this.refresh());
  }

  /** 重新读一遍远端：页面打开时、每轮推拉之后，以及成员关系变了之后 */
  async refresh(): Promise<void> {
    const client = this.#session.prepared?.client;
    if (!client) return;
    const generation = ++this.#generation;
    this.#error.set(null);
    try {
      const [tenants, callerBuckets, grants] = await Promise.all([
        fetchTenants(client),
        fetchCallerBuckets(client),
        this.#session.signedIn ? fetchCallerGrants(client) : Promise.resolve([])
      ]);
      if (generation !== this.#generation) return;
      this.#tenants.set(tenants);
      this.#callerBuckets.set(callerBuckets);
      this.#grants.set(grants);
    } catch (error) {
      if (generation === this.#generation) this.#error.set(getErrorMessage(error, '读取远端失败'));
    }
  }

  /** 租户的名字；不认识的租户原样显示 id */
  tenantName(tenantId: string): string {
    return this.#tenants().find(tenant => tenant.id === tenantId)?.name ?? tenantId;
  }
}
