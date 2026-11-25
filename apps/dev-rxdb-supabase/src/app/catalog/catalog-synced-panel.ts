import { RxDB, RxDBIdentityMismatchError } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { SyncRejectionsPanel } from '../sync-rejections-panel';
import { CatalogItemEditor, type CatalogItemEdit } from './catalog-item-editor';
import { CatalogItemHistory } from './catalog-item-history';
import { CatalogLocalWrites } from './catalog-local-writes';
import { CatalogRemoteState } from './catalog-remote-state';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';
import { groupByBucket } from './catalog-view';

/**
 * 按授权分区同步（US-033）与本机写入（US-034）：同步规则、同步、本机的商品，以及在本机增删改、撤销/重做与推送。
 *
 * @remarks
 * 能读哪些区由服务端裁决（`rxdb_caller_buckets()` 与 RLS），同步规则只在能读的区里挑行。
 * 同步下来的数据离线可用；成员关系、可见范围或规则变了，下一次同步按区补快照或整块清理。
 * 所在租户的商品可以在本机改，改动推送之前能撤销、重做，推送之后就成了大家看到的结果。
 */
@Component({
  selector: 'app-catalog-synced-panel',
  imports: [FormsModule, CatalogItemEditor, CatalogItemHistory, SyncRejectionsPanel],
  template: `
    <section class="card bg-base-100 shadow-sm" aria-labelledby="synced-title">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title" id="synced-title">本机同步的商品（离线可用）</h2>
          <div class="flex flex-wrap gap-1">
            <button
              class="btn btn-sm"
              [disabled]="!writes.$canWrite() || writes.$busy() || writes.$undoCount() === 0"
              (click)="writes.undo()"
              data-testid="catalog-undo"
              type="button"
            >
              撤销
              @if (writes.$undoCount()) {
                <span class="badge badge-xs">{{ writes.$undoCount() }}</span>
              }
            </button>
            <button
              class="btn btn-sm"
              [disabled]="!writes.$canWrite() || writes.$busy() || writes.$redoCount() === 0"
              (click)="writes.redo()"
              data-testid="catalog-redo"
              type="button"
            >
              重做
              @if (writes.$redoCount()) {
                <span class="badge badge-xs">{{ writes.$redoCount() }}</span>
              }
            </button>
            <button
              class="btn btn-sm"
              [disabled]="!session.signedIn || writes.$busy() || writes.$pending() === 0"
              (click)="writes.push()"
              data-testid="catalog-push"
              type="button"
            >
              推送
              @if (writes.$pending()) {
                <span class="badge badge-xs badge-primary" data-testid="catalog-pending-count">
                  {{ writes.$pending() }}
                </span>
              }
            </button>
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
        </div>

        <p class="text-base-content/60 text-sm" data-testid="catalog-write-hint">{{ $writeHint() }}</p>
        @if (writes.$notice(); as notice) {
          <p class="text-sm" data-testid="catalog-write-notice" role="status">{{ notice }}</p>
        }
        @if (writes.$error(); as error) {
          <div class="alert alert-error" data-testid="catalog-write-error" role="alert">{{ error }}</div>
        }

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
                <li class="flex flex-wrap items-center justify-between gap-2 py-1" data-testid="synced-item">
                  <span class="flex items-center gap-2">
                    <span class="badge badge-ghost badge-sm">{{ item.category }}</span>
                    <span>{{ item.name }}</span>
                  </span>
                  <span class="ml-auto flex items-center gap-2">
                    <span class="text-base-content/70 text-sm">
                      ¥{{ item.price }} · 成本 {{ item.cost === null ? '无权读取' : '¥' + item.cost }}
                    </span>
                    <button
                      class="btn btn-xs"
                      [disabled]="!writes.canEdit(item) || writes.$busy()"
                      (click)="edit(item)"
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-xs w-20"
                      [disabled]="!writes.canEdit(item) || writes.$busy()"
                      (click)="writes.setVisibility(item, item.visibility === 'public' ? 'tenant' : 'public')"
                      type="button"
                    >
                      {{ item.visibility === 'public' ? '收回为内部' : '公开' }}
                    </button>
                    <button
                      class="btn btn-xs btn-error btn-outline"
                      [disabled]="!writes.canEdit(item) || writes.$busy()"
                      (click)="writes.remove(item)"
                      type="button"
                    >
                      删除
                    </button>
                    @if (writes.canEdit(item)) {
                      <button class="btn btn-xs btn-ghost" (click)="historyRef().open(item)" type="button">历史</button>
                    }
                  </span>
                </li>
              }
            </ul>
          </div>
        } @empty {
          <p class="text-base-content/60 text-sm">本机还没有同步任何商品，点「同步」拉取这个身份能读的数据。</p>
        }

        <form class="flex flex-wrap items-end gap-2" (ngSubmit)="create()" data-testid="catalog-create-form">
          <label class="fieldset">
            <span class="fieldset-legend">在本机新建商品</span>
            <input
              class="input input-sm"
              [disabled]="!writes.$canWrite()"
              [ngModel]="draftName()"
              (ngModelChange)="draftName.set($event)"
              name="name"
              placeholder="新商品名称"
              required
            />
          </label>
          <select
            class="select select-sm w-24"
            [disabled]="!writes.$canWrite()"
            [ngModel]="draftCategory()"
            (ngModelChange)="draftCategory.set($event)"
            aria-label="新商品分类"
            name="category"
          >
            @for (category of categories; track category) {
              <option [value]="category">{{ category }}</option>
            }
          </select>
          <select
            class="select select-sm w-32"
            [disabled]="!writes.$canWrite()"
            [ngModel]="draftTenantId()"
            (ngModelChange)="draftTenantId.set($event)"
            aria-label="新商品所属租户"
            name="tenant"
          >
            @for (tenantId of remote.$myTenantIds(); track tenantId) {
              <option [value]="tenantId">{{ remote.tenantName(tenantId) }}</option>
            }
          </select>
          <select
            class="select select-sm w-28"
            [disabled]="!writes.$canWrite()"
            [ngModel]="draftVisibility()"
            (ngModelChange)="draftVisibility.set($event)"
            aria-label="新商品可见范围"
            name="visibility"
          >
            <option value="public">公开</option>
            <option value="tenant">仅租户内部</option>
          </select>
          <button
            class="btn btn-sm btn-primary"
            [disabled]="!writes.$canWrite() || writes.$busy() || !draftName().trim()"
            type="submit"
          >
            新建
          </button>
        </form>

        <app-sync-rejections-panel />
      </div>
    </section>
    <app-catalog-item-history />
    <app-catalog-item-editor
      [busy]="writes.$busy()"
      [error]="writes.$error()"
      (save)="saveEdit($event)"
      heading="编辑本机商品"
      note="改动先存在本机，推送之前可以撤销、重做；点「推送」才写到远端，由服务端按 RLS 决定收不收。"
    />
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
  readonly writes = inject(CatalogLocalWrites);
  readonly editorRef = viewChild.required(CatalogItemEditor);
  /** 远端变更历史（US-229）：只对能编辑这件商品的成员给入口 */
  readonly historyRef = viewChild.required(CatalogItemHistory);
  readonly categories = CATALOG_CATEGORIES;

  // 新建表单的草稿：zoneless + OnPush 下用 signal，异步回调里清空也会重新渲染
  readonly draftName = signal('');
  readonly draftCategory = signal<string>(CATALOG_CATEGORIES[0]);
  readonly draftTenantId = signal('');
  readonly draftVisibility = signal<CatalogItem['visibility']>('public');

  /** 写入口的说明：访客只读，不在租户里没有可改的商品 */
  readonly $writeHint = computed(() => {
    if (!this.session.signedIn) return '访客只读：登录成员才能在本机改商品。';
    if (!this.writes.$canWrite()) return '还不在任何租户里：加入租户之后可以在本机改这个租户的商品。';
    return '所在租户的商品可以在本机新建、编辑、删除：推送之前可以撤销、重做，点「推送」才写到远端，推送之后就不能再撤销。';
  });

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

  constructor() {
    // 所在的租户变了：新建表单默认落在第一个租户
    effect(() => {
      const tenantIds = this.remote.$myTenantIds();
      const current = untracked(this.draftTenantId);
      this.draftTenantId.set(tenantIds.includes(current) ? current : (tenantIds[0] ?? ''));
    });
  }

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

  edit(item: CatalogItem): void {
    this.editorRef().open(item);
  }

  /** 存进本机，成功才关上编辑框；失败时框不关，原因显示在框里 */
  async saveEdit({ id, changes }: CatalogItemEdit): Promise<void> {
    const item = this.items.value().find(candidate => candidate.id === id);
    if (!item) return;
    await this.writes.update(item, changes);
    if (!this.writes.$error()) this.editorRef().close();
  }

  async create(): Promise<void> {
    const name = this.draftName().trim();
    await this.writes.create({
      name,
      category: this.draftCategory(),
      price: 99,
      cost: 40,
      visibility: this.draftVisibility(),
      tenantId: this.draftTenantId()
    });
    if (!this.writes.$error()) this.draftName.set('');
  }
}
