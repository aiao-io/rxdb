import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import {
  createItem,
  deleteItem,
  fetchTenantItems,
  joinTenant,
  leaveTenant,
  setItemVisibility,
  type CatalogRemoteItem
} from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';

/**
 * 模拟服务端那边的变化：成员关系、商品的可见范围、删除与新增。
 *
 * @remarks
 * 这里直接以当前身份写远端业务表（RLS：只能改所在租户的商品），写入经同步触发器记进对应区的日志；
 * 本机的同步数据不会因此马上变，要点「同步」，或到别的身份的窗口里同步，才看得到效果。
 * 自助加入、退出租户只为演示方便，模拟的是「管理员调整了你的成员关系」。
 */
@Component({
  selector: 'app-catalog-server-panel',
  imports: [FormsModule],
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
            以当前身份直接写远端（按 RLS 只能改所在租户的商品）。本机数据不会马上变：点上面的「同步」，
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
            <p class="label">成员关系变了、业务行一行没改：下次同步时，加入的租户补快照，退出的租户整块从本机删掉。</p>
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
            <div class="overflow-x-auto">
              <table class="table-sm table">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>租户</th>
                    <th>可见范围</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of $items(); track item.id) {
                    <tr data-testid="server-item">
                      <td>{{ item.name }} <span class="badge badge-ghost badge-sm">{{ item.category }}</span></td>
                      <td>{{ remote.tenantName(item.tenantId) }}</td>
                      <td>{{ item.visibility === 'public' ? '公开' : '仅租户内部' }}</td>
                      <td class="flex justify-end gap-1">
                        <button class="btn btn-xs" [disabled]="$busy()" (click)="toggleVisibility(item)" type="button">
                          {{ item.visibility === 'public' ? '收回为内部' : '公开' }}
                        </button>
                        <button class="btn btn-xs btn-error btn-outline" [disabled]="$busy()" (click)="remove(item)" type="button">
                          删除
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <form class="flex flex-wrap items-end gap-2" (ngSubmit)="create()">
              <label class="fieldset">
                <span class="fieldset-legend">新增商品</span>
                <input class="input input-sm" [(ngModel)]="draftName" name="name" placeholder="名称" required />
              </label>
              <select class="select select-sm w-24" [(ngModel)]="draftCategory" name="category" aria-label="分类">
                @for (category of categories; track category) {
                  <option [value]="category">{{ category }}</option>
                }
              </select>
              <select class="select select-sm w-32" [(ngModel)]="draftTenantId" name="tenant" aria-label="所属租户">
                @for (tenantId of remote.$myTenantIds(); track tenantId) {
                  <option [value]="tenantId">{{ remote.tenantName(tenantId) }}</option>
                }
              </select>
              <select class="select select-sm w-28" [(ngModel)]="draftVisibility" name="visibility" aria-label="可见范围">
                <option value="public">公开</option>
                <option value="tenant">仅租户内部</option>
              </select>
              <button class="btn btn-sm btn-primary" [disabled]="$busy() || !draftName.trim()" type="submit">新增</button>
            </form>
          }
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogServerPanel {
  readonly #items = signal<readonly CatalogRemoteItem[]>([]);
  readonly #busy = signal(false);
  readonly #error = signal<string | null>(null);
  readonly #notice = signal<string | null>(null);
  readonly session = inject(DemoSession);
  readonly remote = inject(CatalogRemoteState);
  readonly categories = CATALOG_CATEGORIES;

  readonly $items = this.#items.asReadonly();
  readonly $busy = this.#busy.asReadonly();
  readonly $error = this.#error.asReadonly();
  readonly $notice = this.#notice.asReadonly();

  draftName = '';
  draftCategory: string = CATALOG_CATEGORIES[0];
  draftTenantId = '';
  draftVisibility: CatalogRemoteItem['visibility'] = 'public';

  constructor() {
    // 所在的租户变了：重新列出可以管理的商品，新增表单默认落在第一个租户
    effect(() => {
      const tenantIds = this.remote.$myTenantIds();
      this.draftTenantId = tenantIds.includes(this.draftTenantId) ? this.draftTenantId : (tenantIds[0] ?? '');
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
    const name = this.draftName.trim();
    return this.#run(`「${name}」已新增`, async client => {
      await createItem(client, {
        name,
        category: this.draftCategory,
        price: 99,
        cost: 40,
        visibility: this.draftVisibility,
        tenantId: this.draftTenantId
      });
      this.draftName = '';
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
