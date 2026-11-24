import { inject, Injectable, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { fetchCallerBuckets, fetchMyTenantIds, fetchTenants, type DemoTenant } from './catalog-remote';

/**
 * 商品目录页共用的远端状态：租户、当前身份能读的区、所在的租户。
 *
 * @remarks
 * 页面级提供。成员关系改了之后刷新一次，能读的区跟着变；本地数据要等下一次同步才变（US-033 AC#3、#4）。
 */
@Injectable()
export class CatalogRemoteState {
  readonly #session = inject(DemoSession);
  readonly #tenants = signal<readonly DemoTenant[]>([]);
  readonly #callerBuckets = signal<readonly string[]>([]);
  readonly #myTenantIds = signal<readonly string[]>([]);
  readonly #error = signal<string | null>(null);

  /** 全部演示租户 */
  readonly $tenants = this.#tenants.asReadonly();
  /** 服务端 `rxdb_caller_buckets()`：当前身份能读的区 */
  readonly $callerBuckets = this.#callerBuckets.asReadonly();
  /** 当前登录身份所在的租户；访客没有 */
  readonly $myTenantIds = this.#myTenantIds.asReadonly();
  /** 上一次读取失败的原因 */
  readonly $error = this.#error.asReadonly();

  /** 重新读一遍远端：页面打开时，以及成员关系变了之后 */
  async refresh(): Promise<void> {
    const client = this.#session.prepared?.client;
    if (!client) return;
    this.#error.set(null);
    try {
      const [tenants, callerBuckets, myTenantIds] = await Promise.all([
        fetchTenants(client),
        fetchCallerBuckets(client),
        this.#session.signedIn ? fetchMyTenantIds(client) : Promise.resolve([])
      ]);
      this.#tenants.set(tenants);
      this.#callerBuckets.set(callerBuckets);
      this.#myTenantIds.set(myTenantIds);
    } catch (error) {
      this.#error.set(getErrorMessage(error, '读取远端失败'));
    }
  }

  /** 租户的名字；不认识的租户原样显示 id */
  tenantName(tenantId: string): string {
    return this.#tenants().find(tenant => tenant.id === tenantId)?.name ?? tenantId;
  }
}
