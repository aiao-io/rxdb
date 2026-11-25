import { RxDB, RxDBIdentityMismatchError } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { CatalogRemoteState } from './catalog-remote-state';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';
import { groupByBucket } from './catalog-view';

/**
 * 按授权分区同步（US-033）：同步规则、同步、本机已同步的商品。
 *
 * @remarks
 * 能读哪些区由服务端裁决（`rxdb_caller_buckets()` 与 RLS），同步规则只在能读的区里挑行。
 * 同步下来的数据离线可用；成员关系、可见范围或规则变了，下一次同步按区补快照或整块清理。
 */
@Component({
  selector: 'app-catalog-synced-panel',
  template: `
    <section class="card bg-base-100 shadow-sm" aria-labelledby="synced-title">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title" id="synced-title">本机同步的商品（离线可用）</h2>
          <button
            class="btn btn-primary btn-sm"
            [attr.data-sync-count]="$syncCount()"
            [disabled]="$syncing()"
            (click)="sync()"
            data-testid="catalog-sync"
            type="button"
          >
            @if ($syncing()) {
              <span class="loading loading-spinner loading-xs"></span>
            }
            同步
          </button>
        </div>

        @if (session.prepared; as prepared) {
          <fieldset class="fieldset">
            <legend class="fieldset-legend">同步规则：公开商品只同步关注的分类，所在租户的内部商品全部同步</legend>
            <div class="flex flex-wrap gap-4">
              @for (category of categories; track category) {
                <label class="label cursor-pointer gap-2">
                  <input
                    class="checkbox checkbox-sm"
                    [checked]="prepared.followed.value().includes(category)"
                    (change)="prepared.followed.toggle(category)"
                    type="checkbox"
                  />
                  {{ category }}
                </label>
              }
            </div>
            <p class="label whitespace-normal">改了规则之后点「同步」：新匹配的行补快照，不再匹配的行从本机删掉。</p>
          </fieldset>
        }

        @if ($result(); as result) {
          <p class="text-sm" data-testid="catalog-sync-result" role="status">{{ result }}</p>
        }
        @if ($error(); as error) {
          <div class="alert alert-error" role="alert">
            <span>同步失败：{{ error }}</span>
            @if ($identityMismatch()) {
              <button class="btn btn-sm" (click)="session.reload()" type="button">重新加载</button>
            }
          </div>
        }

        @for (group of $groups(); track group.bucket) {
          <div class="flex flex-col gap-1" [attr.data-bucket]="group.bucket">
            <h3 class="text-base-content/70 text-sm font-semibold">{{ group.label }} · {{ group.items.length }}</h3>
            <ul class="divide-base-200 divide-y">
              @for (item of group.items; track item.id) {
                <li class="flex items-center justify-between gap-2 py-1" data-testid="synced-item">
                  <span class="flex items-center gap-2">
                    <span class="badge badge-ghost badge-sm">{{ item.category }}</span>
                    <span>{{ item.name }}</span>
                  </span>
                  <span class="text-base-content/70 text-sm">
                    ¥{{ item.price }} · 成本 {{ item.cost === null ? '无权读取' : '¥' + item.cost }}
                  </span>
                </li>
              }
            </ul>
          </div>
        } @empty {
          <p class="text-base-content/60 text-sm">本机还没有同步任何商品，点「同步」拉取这个身份能读的数据。</p>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogSyncedPanel {
  readonly #rxdb = inject(RxDB);
  readonly #syncing = signal(false);
  readonly #result = signal<string | null>(null);
  readonly #error = signal<string | null>(null);
  readonly #identityMismatch = signal(false);
  readonly #syncCount = signal(0);
  readonly session = inject(DemoSession);
  readonly remote = inject(CatalogRemoteState);
  readonly categories = CATALOG_CATEGORIES;

  readonly $syncing = this.#syncing.asReadonly();
  readonly $result = this.#result.asReadonly();
  readonly $error = this.#error.asReadonly();
  readonly $identityMismatch = this.#identityMismatch.asReadonly();
  /** 已经结束的同步轮数（成功或失败） */
  readonly $syncCount = this.#syncCount.asReadonly();

  readonly items = useFindAll(CatalogItem, {
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'category', sort: 'asc' },
      { field: 'name', sort: 'asc' }
    ]
  });
  readonly $groups = computed(() => groupByBucket(this.items.value(), this.remote.$tenants()));

  /** 拉取这个身份能读的每个区：加入的区补快照，退出的区整块删掉，区内按规则增量 */
  async sync(): Promise<void> {
    this.#syncing.set(true);
    this.#result.set(null);
    this.#error.set(null);
    this.#identityMismatch.set(false);
    try {
      const result = await this.#rxdb.syncManager.pullRepository('public', 'CatalogItem', { fetchAll: true });
      if (result.error) throw result.error;
      this.#result.set(
        `第 ${this.#syncCount() + 1} 次同步完成：拉取 ${result.pulled} 条变更，落库 ${result.applied} 条。`
      );
    } catch (error) {
      // 会话已经换成另一个身份（US-035）：一个远端请求都没发，本地数据不动，重新加载才会打开新身份的库
      this.#identityMismatch.set(error instanceof RxDBIdentityMismatchError);
      this.#error.set(getErrorMessage(error, '未知错误'));
    } finally {
      this.#syncing.set(false);
      this.#syncCount.update(count => count + 1);
    }
  }
}
