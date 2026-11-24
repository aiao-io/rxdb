import { useFind } from '@aiao/rxdb-angular';
import { PublicCatalogItem, type PublicCatalogItemStaticTypes } from '@aiao/rxdb-test/entities';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { CatalogRemoteState } from './catalog-remote-state';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';

const PAGE_SIZE = 3;

/**
 * 规则之外的公开数据（US-036）：在线分页浏览全部公开商品，不落进同步子集。
 *
 * @remarks
 * 浏览实体映射服务端的公开视图（只含公开行、不含成本价），走 QueryCache 以当前身份直读远端，访客不需要登录。
 * 它和同步的商品是两个实体、两张本地表：同步的清理删不到浏览缓存，浏览也不改变同步子集。
 * 按分类这类有界条件查：QueryCache 每次都要取该条件命中的全部 `{ id, updatedAt }` 来对账。
 */
@Component({
  selector: 'app-catalog-browse-panel',
  template: `
    <section class="card bg-base-100 shadow-sm" aria-labelledby="browse-title">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title" id="browse-title">在线浏览全部公开商品</h2>
          <button class="btn btn-sm" (click)="refresh()" type="button">刷新</button>
        </div>
        <p class="text-base-content/60 text-sm">
          不受同步规则限制，也不落进同步子集；需要联网。想离线可用，就把分类加进同步规则。
        </p>

        <div class="tabs tabs-box w-fit" role="tablist" aria-label="浏览的分类">
          @for (category of categories; track category) {
            <button
              class="tab"
              [class.tab-active]="category === $category()"
              [attr.aria-selected]="category === $category()"
              (click)="select(category)"
              role="tab"
              type="button"
            >
              {{ category }}
            </button>
          }
        </div>

        @if (items.error(); as error) {
          <div class="alert alert-error" role="alert">浏览失败：{{ error.message }}</div>
        }

        <ul class="divide-base-200 divide-y" data-testid="browse-list">
          @for (item of $rows(); track item.id) {
            <li class="flex items-center justify-between gap-2 py-1" data-testid="browse-item">
              <span>{{ item.name }}</span>
              <span class="text-base-content/70 text-sm">¥{{ item.price }} · {{ remote.tenantName(item.tenantId) }}</span>
            </li>
          } @empty {
            @if (!items.isLoading()) {
              <li class="text-base-content/60 py-1 text-sm">这个分类没有公开商品。</li>
            }
          }
        </ul>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="join">
            <button class="btn btn-sm join-item" [disabled]="$page() === 0" (click)="turn(-1)" type="button">
              上一页
            </button>
            <span class="btn btn-sm join-item pointer-events-none">第 {{ $page() + 1 }} 页</span>
            <button class="btn btn-sm join-item" [disabled]="!$hasNext()" (click)="turn(1)" type="button">
              下一页
            </button>
          </div>
          @if (session.prepared; as prepared) {
            @if ($followed()) {
              <span class="badge badge-success">「{{ $category() }}」已在同步规则里</span>
            } @else {
              <button class="btn btn-sm btn-outline" (click)="prepared.followed.toggle($category())" type="button">
                关注「{{ $category() }}」：加进同步规则，下次同步后离线可用
              </button>
            }
          }
        </div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogBrowsePanel {
  readonly #category = signal<string>(CATALOG_CATEGORIES[0]);
  readonly #page = signal(0);
  readonly #refresh = signal(0);
  readonly session = inject(DemoSession);
  readonly remote = inject(CatalogRemoteState);
  readonly categories = CATALOG_CATEGORIES;

  readonly $category = this.#category.asReadonly();
  readonly $page = this.#page.asReadonly();

  /** 多取一行，用来判断还有没有下一页 */
  readonly items = useFind(PublicCatalogItem, (): PublicCatalogItemStaticTypes['findOptions'] => {
    this.#refresh();
    return {
      where: { combinator: 'and', rules: [{ field: 'category', operator: '=', value: this.#category() }] },
      orderBy: [{ field: 'name', sort: 'asc' }],
      limit: PAGE_SIZE + 1,
      offset: this.#page() * PAGE_SIZE
    };
  });
  readonly $rows = computed(() => this.items.value().slice(0, PAGE_SIZE));
  readonly $hasNext = computed(() => this.items.value().length > PAGE_SIZE);
  readonly $followed = computed(
    () => this.session.prepared?.followed.value().includes(this.#category()) ?? false
  );

  select(category: string): void {
    this.#category.set(category);
    this.#page.set(0);
  }

  turn(step: number): void {
    this.#page.update(page => Math.max(0, page + step));
  }

  /** 重新查当前页：QueryCache 向远端对账，变成私有或被删掉的行从浏览缓存里消失 */
  refresh(): void {
    this.#refresh.update(value => value + 1);
  }
}
