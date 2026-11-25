import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DemoSession } from '../demo-session';
import { RemoteSyncState } from '../remote-sync-state';
import { CatalogBrowsePanel } from './catalog-browse-panel';
import { CatalogLocalWrites } from './catalog-local-writes';
import { CatalogRemoteState } from './catalog-remote-state';
import { CatalogServerPanel } from './catalog-server-panel';
import { CatalogSyncedPanel } from './catalog-synced-panel';
import { bucketLabel } from './catalog-view';

/**
 * 商品目录：按身份授权的同步与本机数据隔离（epic-015）。
 *
 * @remarks
 * - US-033：数据按授权分区，能读哪些区由服务端裁决，同步规则只在能读的区里挑行
 * - US-035：每个身份一个本地库，切换身份就是打开另一个库
 * - US-036：规则之外的公开数据在线浏览，不落进同步子集
 * - US-034：所在租户的商品在本机增删改，推送之前可以撤销、重做
 *
 * 页面够宽时分两栏：左边是身份、本机同步的商品与在线浏览，右边是模拟服务端变更，
 * 改完服务端点「同步」不用上下翻找。按页面自己的宽度（容器查询）分栏，侧栏展开、收起都算得准。
 */
@Component({
  selector: 'app-catalog-page',
  imports: [CatalogSyncedPanel, CatalogBrowsePanel, CatalogServerPanel],
  providers: [CatalogRemoteState, CatalogLocalWrites],
  template: `
    <main class="@container mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold" data-testid="catalog-title">商品目录 · 按身份授权的同步</h1>
        <p class="text-base-content/70 text-sm">
          同一个后端：访客只读得到公开商品，Alice、Bob 各自还读得到所在租户的内部商品。
          用右上角切换身份，每个身份打开自己的本地库；开两个浏览器（或一个隐身窗口）可以并排对照。
        </p>
      </header>

      @if (!remoteSync.$connected() || !session.prepared) {
        <div class="alert alert-warning" data-testid="catalog-local-mode" role="alert">
          商品目录演示按身份授权的远端同步，需要连接 Supabase（pnpm nx dev dev-rxdb-supabase）。
        </div>
      } @else {
        <div class="grid items-start gap-4 @4xl:grid-cols-2">
          <div class="flex min-w-0 flex-col gap-4" data-testid="catalog-display">
            <section class="card bg-base-100 shadow-sm" aria-labelledby="identity-title">
              <div class="card-body gap-2">
                <h2 class="card-title" id="identity-title">身份与权限</h2>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt class="text-base-content/60">当前身份</dt>
                  <dd data-testid="catalog-identity">
                    {{ session.description?.title }} · {{ session.description?.detail }}
                  </dd>
                  <dt class="text-base-content/60">本地库</dt>
                  <dd>
                    <code data-testid="catalog-database">{{ session.prepared.databaseName }}</code>
                  </dd>
                  <dt class="text-base-content/60">能读的区</dt>
                  <dd class="flex flex-wrap gap-1" data-testid="catalog-buckets">
                    @for (bucket of remote.$callerBuckets(); track bucket) {
                      <span class="badge badge-outline badge-sm" [title]="bucket">{{ bucketName(bucket) }}</span>
                    }
                  </dd>
                </dl>
                <p class="text-base-content/60 text-xs">
                  能读的区由服务端 <code>rxdb_caller_buckets()</code> 与 RLS
                  裁决，客户端改不了；同步规则只在这些区里挑行。
                </p>
                @if (remote.$error(); as error) {
                  <div class="alert alert-error" role="alert">{{ error }}</div>
                }
              </div>
            </section>

            <app-catalog-synced-panel />
            <app-catalog-browse-panel />
          </div>

          <aside class="min-w-0" aria-label="模拟服务端变更" data-testid="catalog-operations">
            <app-catalog-server-panel />
          </aside>
        </div>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class CatalogPage implements OnInit {
  readonly session = inject(DemoSession);
  readonly remoteSync = inject(RemoteSyncState);
  readonly remote = inject(CatalogRemoteState);

  ngOnInit(): void {
    if (this.remoteSync.$connected()) void this.remote.refresh();
  }

  bucketName(bucket: string): string {
    return bucketLabel(bucket, this.remote.$tenants());
  }
}
