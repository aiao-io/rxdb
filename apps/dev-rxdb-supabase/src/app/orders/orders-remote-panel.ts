import { uuid } from '@aiao/rxdb';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { SyncCommands } from '../sync-commands';
import { Toasts } from '../toasts';
import { groupBy, idCardOf, orderTotal, orderTreeDraft, orderTreeRows } from './orders-interactions';
import {
  createRemoteOrderTree,
  deleteRemoteCustomer,
  deleteRemoteOrder,
  fetchOrdersSnapshot,
  type OrdersRemoteClient,
  type OrdersRemoteSnapshot,
  type RemoteCustomer,
  type RemoteOrder
} from './orders-remote';

const EMPTY: OrdersRemoteSnapshot = {
  customers: [],
  idCards: [],
  orders: [],
  items: [],
  categories: [],
  attachments: []
};

/**
 * 远端数据：直接读 Supabase 里订单演示的六张表，并能模拟别人改远端（US-235）
 *
 * @remarks
 * 不经同步，看的是推送之后远端真正落下了什么、外键级联删掉了什么；远端有、本机还没有的行标「本机没有」，拉取之后消失。
 * 每轮推拉结束自动重读，也能手动刷新。
 *
 * 「模拟别人」的写入以当前身份直接写业务表：同步触发器把它们（连同外键级联删掉的行）记进日志，日志不带本机的
 * clientId，所以本机拉得到，像是另一个人推上来的。一个窗口就能演示拉取与外键被拒，不用另开浏览器。
 *
 * 渲染在订单页提供的右侧面板里：面板标题就是「远端数据」，这里不再套卡片和标题。
 */
@Component({
  selector: 'app-orders-remote-panel',
  imports: [DatePipe],
  template: `
    <section class="flex flex-col gap-4 text-sm" data-testid="orders-remote-panel">
      @if (!session.signedIn) {
        <p class="text-base-content/70" data-testid="orders-remote-visitor">
          访客没有远端订单表的权限：订单只存在本机。右上角切换成 Alice、Bob 或匿名用户，再来看远端。
        </p>
      } @else {
        <p class="text-base-content/60">
          直接读 Supabase
          里的表（以当前身份）：推送之后远端落下了什么、外键级联删了什么，都在这里。推送、拉取之后自动重读。
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="btn btn-sm"
            [disabled]="$loading() || $busy()"
            (click)="refresh()"
            data-testid="orders-remote-refresh"
            type="button"
          >
            刷新
          </button>
          <span class="text-base-content/60 text-xs">
            @if ($loading()) {
              正在读远端…
            } @else if ($loadedAt(); as loadedAt) {
              读于 {{ loadedAt | date: 'HH:mm:ss' }}
            }
          </span>
        </div>
        @if ($error(); as error) {
          <div class="alert alert-error" data-testid="orders-remote-error" role="alert">{{ error }}</div>
        }

        <fieldset class="fieldset border-base-300 rounded-box border px-3 pb-3">
          <legend class="fieldset-legend">模拟别人改远端</legend>
          <p class="text-base-content/60 whitespace-normal">
            直接写远端，像另一个人推上来的：本机不会马上变，点顶栏的「拉取」才拉下来。删客户、删订单的按钮在下面各行上。
          </p>
          <button
            class="btn btn-sm"
            [disabled]="$busy()"
            (click)="createGroup()"
            data-testid="orders-remote-create"
            type="button"
          >
            模拟别人新建一组
          </button>
        </fieldset>

        @let snapshot = $snapshot();
        <p class="text-base-content/70" data-testid="orders-remote-counts">
          远端：客户 {{ snapshot.customers.length }} · 证件 {{ snapshot.idCards.length }} · 订单
          {{ snapshot.orders.length }} · 订单项 {{ snapshot.items.length }} · 分类 {{ snapshot.categories.length }} ·
          关联 {{ snapshot.attachments.length }}
        </p>

        <ul class="flex flex-col gap-2">
          @for (customer of snapshot.customers; track customer.id) {
            @let idCard = idCardOf(customer, snapshot.idCards);
            <li class="border-base-200 flex flex-col gap-1 rounded border p-2" data-testid="remote-customer">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-medium">{{ customer.name }}</span>
                <span class="text-base-content/60 text-xs" data-testid="remote-customer-id-card">
                  {{ idCard ? '证件：' + idCard.code : '无证件' }}
                </span>
                @if (missing(customer.id)) {
                  <span class="badge badge-info badge-xs" data-testid="remote-missing" title="拉取之后出现在本机">
                    本机没有
                  </span>
                }
                <button
                  class="btn btn-ghost btn-xs text-error ms-auto"
                  [disabled]="$busy()"
                  (click)="removeCustomer(customer)"
                  title="连同他的证件、订单、订单项与分类关联（远端外键级联）"
                  type="button"
                >
                  在远端删除客户
                </button>
              </div>
              <ul class="flex flex-col gap-1 ps-3">
                @for (order of $ordersByCustomer().get(customer.id) ?? []; track order.id) {
                  @let orderItems = $itemsByOrder().get(order.id) ?? [];
                  <li
                    class="border-base-200 flex flex-col gap-1 border-s ps-2"
                    [attr.data-order-number]="order.number"
                    data-testid="remote-order"
                  >
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>订单 {{ order.number }} · ¥{{ total(orderItems) }}</span>
                      @if (missing(order.id)) {
                        <span class="badge badge-info badge-xs" data-testid="remote-missing" title="拉取之后出现在本机">
                          本机没有
                        </span>
                      }
                      <button
                        class="btn btn-ghost btn-xs text-error ms-auto"
                        [disabled]="$busy()"
                        (click)="removeOrder(order)"
                        title="连同它的订单项与分类关联（远端外键级联）"
                        type="button"
                      >
                        在远端删除订单
                      </button>
                    </div>
                    <ul class="flex flex-col gap-1 ps-3">
                      @for (item of orderItems; track item.id) {
                        <li class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="remote-order-item">
                          <span>{{ item.productName }} × {{ item.quantity }} · ¥{{ item.price }}</span>
                          <span class="flex flex-wrap gap-1" data-testid="remote-order-item-categories">
                            @for (name of $categoryNamesByItem().get(item.id) ?? []; track $index) {
                              <span class="badge badge-ghost badge-sm">{{ name }}</span>
                            }
                          </span>
                          @if (missing(item.id)) {
                            <span
                              class="badge badge-info badge-xs"
                              data-testid="remote-missing"
                              title="拉取之后出现在本机"
                            >
                              本机没有
                            </span>
                          }
                        </li>
                      }
                    </ul>
                  </li>
                }
              </ul>
            </li>
          } @empty {
            <li class="text-base-content/60">远端还没有客户。</li>
          }
        </ul>

        <div class="flex flex-col gap-1">
          <h3 class="text-base-content/70 font-semibold">分类</h3>
          <ul class="flex flex-wrap gap-1">
            @for (category of snapshot.categories; track category.id) {
              <li class="badge badge-outline badge-sm" data-testid="remote-category">
                {{ category.name }}{{ missing(category.id) ? ' · 本机没有' : '' }}
              </li>
            } @empty {
              <li class="text-base-content/60">远端还没有分类。</li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrdersRemotePanel {
  readonly #commands = inject(SyncCommands);
  readonly #toasts = inject(Toasts);
  readonly #snapshot = signal<OrdersRemoteSnapshot>(EMPTY);
  readonly #loadedAt = signal<Date | null>(null);
  readonly #loading = signal(false);
  readonly #busy = signal(false);
  readonly #loadError = signal<string | null>(null);
  readonly #writeError = signal<string | null>(null);
  readonly #reloads = signal(0);
  /** 最近一次读远端的序号：几次读取重叠时，只有最后发出的那次能更新面板 */
  #latestLoad = 0;

  readonly session = inject(DemoSession);
  /** 本机全部行的 id（客户、证件、订单、订单项、分类）：远端有、这里没有的标「本机没有」 */
  readonly localIds = input.required<ReadonlySet<string>>();

  readonly $snapshot = this.#snapshot.asReadonly();
  readonly $loadedAt = this.#loadedAt.asReadonly();
  readonly $loading = this.#loading.asReadonly();
  /** 正在写远端 */
  readonly $busy = this.#busy.asReadonly();
  /** 失败的原因：上一次写远端的优先，其次是最近一次读远端的 */
  readonly $error = computed(() => this.#writeError() ?? this.#loadError());
  readonly $ordersByCustomer = computed(() => groupBy(this.#snapshot().orders, order => order.customerId));
  readonly $itemsByOrder = computed(() => groupBy(this.#snapshot().items, item => item.orderId));
  /** 订单项 id → 远端关联着的分类名 */
  readonly $categoryNamesByItem = computed(() => {
    const { categories, attachments } = this.#snapshot();
    const names = new Map(categories.map(category => [category.id, category.name]));
    const byItem = groupBy(attachments, attachment => attachment.orderItemsId);
    return new Map(
      [...byItem].map(([itemId, rows]) => [itemId, rows.map(row => names.get(row.categoriesId) ?? row.categoriesId)])
    );
  });

  readonly idCardOf = idCardOf;
  readonly total = orderTotal;

  constructor() {
    // 打开时读一次；之后每轮推拉结束、每次手动刷新或模拟写入之后再读
    effect(() => {
      this.#commands.round();
      this.#reloads();
      untracked(() => void this.#load());
    });
  }

  missing(id: string): boolean {
    return !this.localIds().has(id);
  }

  refresh(): void {
    this.#reloads.update(count => count + 1);
  }

  removeCustomer(customer: RemoteCustomer): Promise<void> {
    return this.#write(
      `已在远端删除「${customer.name}」，连同他的证件、订单与订单项。本机还没变：点顶栏的「拉取」看他消失；或者先给他新建订单再推送，看外键怎么拒绝。`,
      client => deleteRemoteCustomer(client, customer.id)
    );
  }

  removeOrder(order: RemoteOrder): Promise<void> {
    return this.#write(`已在远端删除订单 ${order.number} 与它的订单项。点顶栏的「拉取」看本机怎么变。`, client =>
      deleteRemoteOrder(client, order.id)
    );
  }

  createGroup(): Promise<void> {
    const rows = orderTreeRows(orderTreeDraft('远端客户', uuid().slice(-4).toUpperCase()), uuid);
    return this.#write(
      `已在远端新建「${rows.customer.name}」，带证件、订单与两条订单项。点顶栏的「拉取」把这一组拉到本机。`,
      client => createRemoteOrderTree(client, rows)
    );
  }

  /**
   * 读一次远端
   *
   * @remarks
   * 推拉一轮、刷新与模拟写入都会重读，几次可能重叠：先发后到的旧结果不能盖掉新的，只认最后发出的那次。
   */
  async #load(): Promise<void> {
    const client = this.#client();
    if (!client) return;
    const load = ++this.#latestLoad;
    this.#loading.set(true);
    const outcome = await fetchOrdersSnapshot(client).then(
      snapshot => ({ snapshot, error: null }),
      (error: unknown) => ({ snapshot: null, error: getErrorMessage(error, '读取远端失败') })
    );
    if (load !== this.#latestLoad) return;
    this.#loading.set(false);
    this.#loadError.set(outcome.error);
    if (!outcome.snapshot) return;
    this.#snapshot.set(outcome.snapshot);
    this.#loadedAt.set(new Date());
  }

  async #write(notice: string, operation: (client: OrdersRemoteClient) => Promise<void>): Promise<void> {
    const client = this.#client();
    if (!client) return;
    this.#busy.set(true);
    this.#writeError.set(null);
    try {
      await operation(client);
      this.#toasts.show({ kind: 'success', message: notice });
    } catch (error) {
      this.#writeError.set(getErrorMessage(error, '写远端失败'));
    } finally {
      this.#busy.set(false);
      this.refresh();
    }
  }

  /** 登录身份才读写远端：访客（anon）没有这些表的权限 */
  #client(): OrdersRemoteClient | undefined {
    return this.session.signedIn ? this.session.prepared?.client : undefined;
  }
}
