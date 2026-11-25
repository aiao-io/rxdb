import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { CatalogItemEditor, type CatalogItemEdit } from './catalog-item-editor';
import {
  createItem,
  deleteItem,
  fetchTenantItems,
  joinTenant,
  leaveTenant,
  setItemVisibility,
  updateItem,
  type CatalogRemoteItem
} from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';

/**
 * 模拟服务端那边的变化：成员关系，商品的编辑、可见范围、删除与新增。
 *
 * @remarks
 * 这里直接以当前身份写远端业务表（RLS：只能改所在租户的商品），写入经同步触发器记进对应区的日志；
 * 本机的同步数据不会因此马上变，要点「同步」，或到别的身份的窗口里同步，才看得到效果。
 * 自助加入、退出租户只为演示方便，模拟的是「管理员调整了你的成员关系」。
 */
@Component({
  selector: 'app-catalog-server-panel',
  imports: [FormsModule, CatalogItemEditor],
  template: `
    <section class="card bg-base-100 shadow-sm" aria-labelledby="server-title">
      <div class="card-body gap-4">
        <h2 class="card-title" id="server-title">模拟服务端变更</h2>
        @if (!session.signedIn) {
          <p class="text-base-content/70 text-sm" data-testid="server-panel-visitor">
            访客只能读公开数据。切换到 Alice、Bob 或匿名用户，就能加入租户、改租户的商品，模拟服务端那边的变化。
          </p>
        } @else {
          <p class="text-base-content/60 text-sm">
            以当前身份直接写远端（按 RLS 只能改所在租户的商品）。本机数据不会马上变：点「本机同步的商品」里的「同步」，
            或到别的身份的窗口里同步，看分区同步怎么收到写入与移除。
          </p>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">成员关系（演示用的自助加入，模拟管理员调整）</legend>
            <div class="flex flex-wrap gap-2">
              @for (tenant of remote.$tenants(); track tenant.id) {
                @if (remote.$myTenantIds().includes(tenant.id)) {
                  <button class="btn btn-sm" [disabled]="$busy()" (click)="leave(tenant.id)" type="button">
                    退出{{ tenant.name }}
                  </button>
                } @else {
                  <button class="btn btn-sm btn-outline" [disabled]="$busy()" (click)="join(tenant.id)" type="button">
                    加入{{ tenant.name }}
                  </button>
                }
              }
            </div>
            <p class="label whitespace-normal">
              成员关系变了、业务行一行没改：下次同步时，加入的租户补快照，退出的租户整块从本机删掉。
            </p>
          </fieldset>

          @if ($error(); as error) {
            <div class="alert alert-error" role="alert">{{ error }}</div>
          }
          @if ($notice(); as notice) {
            <p class="text-sm" role="status">{{ notice }}</p>
          }

          @if (remote.$myTenantIds().length === 0) {
            <p class="text-base-content/60 text-sm">还不在任何租户里：加入一个租户后可以管理它的商品。</p>
          } @else {
            <ul class="divide-base-200 divide-y">
              @for (item of $items(); track item.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="server-item">
                  <div class="flex min-w-0 flex-col gap-1">
                    <span class="flex flex-wrap items-center gap-1">
                      {{ item.name }}
                      <span class="badge badge-ghost badge-sm">{{ item.category }}</span>
                      <span class="badge badge-outline badge-sm">
                        {{ item.visibility === 'public' ? '公开' : '仅租户内部' }}
                      </span>
                    </span>
                    <span class="text-base-content/60 text-xs">
                      {{ remote.tenantName(item.tenantId) }} · ¥{{ item.price }} · 成本
                      {{ item.cost === null ? '未填' : '¥' + item.cost }}
                    </span>
                  </div>
                  <div class="ml-auto flex gap-1">
                    <button class="btn btn-xs" [disabled]="$busy()" (click)="edit(item)" type="button">编辑</button>
                    <button class="btn btn-xs w-20" [disabled]="$busy()" (click)="toggleVisibility(item)" type="button">
                      {{ item.visibility === 'public' ? '收回为内部' : '公开' }}
                    </button>
                    <button
                      class="btn btn-xs btn-error btn-outline"
                      [disabled]="$busy()"
                      (click)="remove(item)"
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </li>
              }
            </ul>

            <form class="flex flex-wrap items-end gap-2" (ngSubmit)="create()">
              <label class="fieldset">
                <span class="fieldset-legend">新增商品</span>
                <input
                  class="input input-sm"
                  [ngModel]="draftName()"
                  (ngModelChange)="draftName.set($event)"
                  name="name"
                  placeholder="名称"
                  required
                />
              </label>
              <select
                class="select select-sm w-24"
                [ngModel]="draftCategory()"
                (ngModelChange)="draftCategory.set($event)"
                aria-label="分类"
                name="category"
              >
                @for (category of categories; track category) {
                  <option [value]="category">{{ category }}</option>
                }
              </select>
              <select
                class="select select-sm w-32"
                [ngModel]="draftTenantId()"
                (ngModelChange)="draftTenantId.set($event)"
                aria-label="所属租户"
                name="tenant"
              >
                @for (tenantId of remote.$myTenantIds(); track tenantId) {
                  <option [value]="tenantId">{{ remote.tenantName(tenantId) }}</option>
                }
              </select>
              <select
                class="select select-sm w-28"
                [ngModel]="draftVisibility()"
                (ngModelChange)="draftVisibility.set($event)"
                aria-label="可见范围"
                name="visibility"
              >
                <option value="public">公开</option>
                <option value="tenant">仅租户内部</option>
              </select>
              <button class="btn btn-sm btn-primary" [disabled]="$busy() || !draftName().trim()" type="submit">
                新增
              </button>
            </form>
          }
        }
      </div>
    </section>
    <app-catalog-item-editor [busy]="$busy()" [error]="$error()" (save)="saveEdit($event)" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogServerPanel {
  readonly #items = signal<readonly CatalogRemoteItem[]>([]);
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);
  readonly #notice = signal<string | null>(null);
  readonly editorRef = viewChild.required(CatalogItemEditor);
  readonly session = inject(DemoSession);
  readonly remote = inject(CatalogRemoteState);
  readonly categories = CATALOG_CATEGORIES;

  readonly $items = this.#items.asReadonly();
  readonly $busy = this.#busy.asReadonly();
  readonly $error = this.#error.asReadonly();
  readonly $notice = this.#notice.asReadonly();

  // 新增表单的草稿：zoneless + OnPush 下用 signal，异步回调里清空也会重新渲染
  readonly draftName = signal('');
  readonly draftCategory = signal<string>(CATALOG_CATEGORIES[0]);
  readonly draftTenantId = signal('');
  readonly draftVisibility = signal<CatalogRemoteItem['visibility']>('public');

  constructor() {
    // 所在的租户变了：重新列出可以管理的商品，新增表单默认落在第一个租户
    effect(() => {
      const tenantIds = this.remote.$myTenantIds();
      const current = untracked(this.draftTenantId);
      this.draftTenantId.set(tenantIds.includes(current) ? current : (tenantIds[0] ?? ''));
      void this.#loadItems(tenantIds);
    });
  }

  join(tenantId: string): Promise<void> {
    return this.#run(`已加入${this.remote.tenantName(tenantId)}`, async client => {
      await joinTenant(client, tenantId);
      await this.remote.refresh();
    });
  }

  leave(tenantId: string): Promise<void> {
    return this.#run(`已退出${this.remote.tenantName(tenantId)}`, async client => {
      await leaveTenant(client, tenantId);
      await this.remote.refresh();
    });
  }

  /** 以服务端现值打开编辑框；上一次操作的失败原因不带进框里 */
  edit(item: CatalogRemoteItem): void {
    this.#error.set(null);
    this.editorRef().open(item);
  }

  /** 写回服务端，成功才关上编辑框；失败时框不关，原因显示在框里 */
  saveEdit({ id, changes }: CatalogItemEdit): Promise<void> {
    return this.#run(`「${changes.name}」已修改`, async client => {
      await updateItem(client, id, changes);
      this.editorRef().close();
      await this.#loadItems(this.remote.$myTenantIds());
    });
  }

  toggleVisibility(item: CatalogRemoteItem): Promise<void> {
    const next = item.visibility === 'public' ? 'tenant' : 'public';
    return this.#run(`「${item.name}」已${next === 'public' ? '公开' : '收回为租户内部'}`, async client => {
      await setItemVisibility(client, item.id, next);
      await this.#loadItems(this.remote.$myTenantIds());
    });
  }

  remove(item: CatalogRemoteItem): Promise<void> {
    return this.#run(`「${item.name}」已删除`, async client => {
      await deleteItem(client, item.id);
      await this.#loadItems(this.remote.$myTenantIds());
    });
  }

  create(): Promise<void> {
    const name = this.draftName().trim();
    return this.#run(`「${name}」已新增`, async client => {
      await createItem(client, {
        name,
        category: this.draftCategory(),
        price: 99,
        cost: 40,
        visibility: this.draftVisibility(),
        tenantId: this.draftTenantId()
      });
      this.draftName.set('');
      await this.#loadItems(this.remote.$myTenantIds());
    });
  }

  async #loadItems(tenantIds: readonly string[]): Promise<void> {
    const client = this.session.prepared?.client;
    if (!client) return;
    try {
      this.#items.set(await fetchTenantItems(client, tenantIds));
    } catch (error) {
      this.#error.set(getErrorMessage(error, '读取租户商品失败'));
    }
  }

  async #run(
    notice: string,
    action: (client: NonNullable<DemoSession['prepared']>['client']) => Promise<void>
  ): Promise<void> {
    const client = this.session.prepared?.client;
    if (!client) return;
    this.#busy.set(true);
    this.#error.set(null);
    this.#notice.set(null);
    try {
      await action(client);
      this.#notice.set(`${notice}。去点「同步」看本机数据怎么变。`);
    } catch (error) {
      this.#error.set(getErrorMessage(error, '操作失败'));
    } finally {
      this.#busy.set(false);
    }
  }
}
