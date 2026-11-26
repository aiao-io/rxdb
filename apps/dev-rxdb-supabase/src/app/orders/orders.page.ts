import { RxDB, uuid } from '@aiao/rxdb';
import { useFindAll, useSyncState } from '@aiao/rxdb-angular';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { RemoteSyncState } from '../remote-sync-state';
import { SyncRejectionsPanel } from '../sync-rejections-panel';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem } from './order-entities';
import {
  describeDependencyRejections,
  describePullOutcome,
  describePushOutcome,
  idCardOf,
  itemsByOrder,
  orderTotal,
  parseOrderItemDraft,
  type SyncOutcome
} from './orders-interactions';

/** 正在跑的那个同步方向 */
type SyncDirection = 'pull' | 'push';

/** 按建立先后列出；同一毫秒建的行再按 `id` 排，顺序稳定 */
function byCreated() {
  return {
    where: { combinator: 'and' as const, rules: [] },
    orderBy: [
      { field: 'createdAt', sort: 'asc' as const },
      { field: 'id', sort: 'asc' as const }
    ]
  };
}

/**
 * 订单：关系数据的推拉同步（US-227）
 *
 * @remarks
 * 客户 1—n 订单 1—n 订单项，订单项 n—n 分类，表与外键在 `supabase/orders-demo.sql`。所有修改先写本机，
 * 「推送」推整机、「拉取」拉整机，
 * 与 Todo 页同一口径：全量推送按外键把父实体排到前面（US-037），删除时子在前。
 * 已登录的身份共享全部订单（Alice 与 Bob 开两个浏览器对照）；别人已在远端删掉的客户，本机给他新建的订单推不上去，
 * 被拒清单里是这条订单，下面另外指出是哪位客户。给订单项挂上、摘掉分类写的是中间表：关联行 id 由两端派生，
 * 两个人给同一条订单项挂同一个分类只落成远端的一行（US-228）。客户与证件互相持有外键：新建客户时填上证件号码，
 * 两行在同一批里新建、互相引用，推送时客户的证件引用先写空、同一请求里再补写；删掉证件只把客户的引用置空（US-038）。
 * 访客的订单只存在本机（US-225）。
 */
@Component({
  selector: 'app-orders-page',
  imports: [AsyncPipe, SyncRejectionsPanel],
  template: `
    @let pending = (pushableCount$ | async) ?? 0;
    @let pullable = (pullableCount$ | async) ?? 0;
    <main class="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold" data-testid="orders-title">订单 · 关系数据的推拉同步</h1>
        <p class="text-base-content/70 text-sm">
          客户、订单与订单项之间有外键：删订单带走订单项，删客户带走订单与证件。客户与证件互相引用，可以在同一批里新建。
          修改先存在本机，推送时父行排在前面、删除时子行排在前面。开两个浏览器分别登录 Alice 与
          Bob，推送一边、拉取另一边。
        </p>
      </header>

      @if (!remoteSync.$connected()) {
        <div class="alert alert-warning" data-testid="orders-local-mode" role="alert">
          未连接远端（纯本地模式）：订单只存在本机，推送与拉取不可用。
        </div>
      } @else if (!session.signedIn) {
        <div class="alert alert-info" data-testid="orders-visitor-notice" role="status">
          访客的订单只存在本机：订单走日志同步，只对登录身份开放。用右上角切换成 Alice、Bob
          或匿名用户之后才能推送与拉取。
        </div>
      }

      <section
        class="card bg-base-100 shadow-sm"
        [attr.data-sync-count]="$syncCount()"
        aria-labelledby="orders-sync-title"
        data-testid="orders-sync"
      >
        <div class="card-body gap-2">
          <h2 class="card-title" id="orders-sync-title">同步</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="btn btn-sm"
              [disabled]="!$syncEnabled() || $syncing() !== null"
              (click)="pull()"
              data-testid="orders-pull"
              type="button"
            >
              拉取
            </button>
            <span class="text-sm">
              待拉 <span class="badge badge-sm" data-testid="orders-pullable-count">{{ pullable }}</span>
            </span>
            <button
              class="btn btn-sm btn-primary"
              [disabled]="!$syncEnabled() || $syncing() !== null || pending === 0"
              (click)="push()"
              data-testid="orders-push"
              type="button"
            >
              推送
            </button>
            <span class="text-sm">
              待推 <span class="badge badge-sm" data-testid="orders-pending-count">{{ pending }}</span>
            </span>
            @if ($syncing()) {
              <span class="loading loading-spinner loading-sm" aria-label="正在同步"></span>
            }
          </div>
          <p class="text-base-content/60 text-xs">
            推送、拉取的是本机全部的修改（包括 Todo 页的），数字与它的范围一致。
          </p>
          @if ($notice(); as notice) {
            <p class="text-success text-sm" data-testid="orders-sync-notice" role="status">{{ notice }}</p>
          }
          @if ($error(); as error) {
            <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
          }
          @if ($dependencyNotices().length > 0) {
            <ul class="alert alert-warning flex flex-col items-start text-sm" data-testid="orders-dependency-notices">
              @for (notice of $dependencyNotices(); track $index) {
                <li>{{ notice }}</li>
              }
            </ul>
          }
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-customers-title">
        <div class="card-body gap-3">
          <h2 class="card-title" id="orders-customers-title">客户</h2>
          <form
            class="flex flex-wrap gap-2"
            #customerForm
            (submit)="createCustomer($event, newCustomerName.value, newIdCardCode.value, customerForm)"
            data-testid="orders-customer-form"
          >
            <input
              class="input input-sm"
              #newCustomerName
              [disabled]="$busy()"
              aria-label="客户名称"
              placeholder="客户名称"
              required
            />
            <input
              class="input input-sm"
              #newIdCardCode
              [disabled]="$busy()"
              aria-label="证件号码"
              placeholder="证件号码（可选）"
            />
            <button class="btn btn-sm" [disabled]="$busy()" type="submit">新建客户</button>
          </form>
          <ul class="divide-base-200 divide-y">
            @for (customer of customers.value(); track customer.id) {
              @let idCard = $idCardByCustomer().get(customer.id);
              <li class="flex flex-wrap items-center justify-between gap-2 py-1" data-testid="customer">
                <span>{{ customer.name }}</span>
                <span class="flex flex-wrap items-center gap-2">
                  <span class="text-base-content/70 text-sm" data-testid="customer-id-card">
                    {{ idCard ? '证件：' + idCard.code : '无证件' }}
                  </span>
                  @if (idCard) {
                    <button class="btn btn-xs btn-ghost" [disabled]="$busy()" (click)="remove(idCard)" type="button">
                      删除证件
                    </button>
                  }
                  <button class="btn btn-xs btn-ghost" [disabled]="$busy()" (click)="remove(customer)" type="button">
                    删除客户
                  </button>
                </span>
              </li>
            } @empty {
              <li class="text-base-content/60 py-1 text-sm">还没有客户</li>
            }
          </ul>
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-categories-title">
        <div class="card-body gap-3">
          <h2 class="card-title" id="orders-categories-title">分类</h2>
          <form
            class="flex flex-wrap gap-2"
            #categoryForm
            (submit)="createCategory($event, newCategoryName.value, categoryForm)"
            data-testid="orders-category-form"
          >
            <input
              class="input input-sm"
              #newCategoryName
              [disabled]="$busy()"
              aria-label="分类名称"
              placeholder="分类名称"
              required
            />
            <button class="btn btn-sm" [disabled]="$busy()" type="submit">新建分类</button>
          </form>
          <ul class="flex flex-wrap gap-2">
            @for (category of categories.value(); track category.id) {
              <li class="badge badge-outline gap-1" data-testid="category">
                {{ category.name }}
                <button class="btn btn-ghost btn-xs" [disabled]="$busy()" (click)="remove(category)" type="button">
                  删除分类
                </button>
              </li>
            } @empty {
              <li class="text-base-content/60 text-sm">还没有分类</li>
            }
          </ul>
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-orders-title">
        <div class="card-body gap-3">
          <h2 class="card-title" id="orders-orders-title">订单</h2>
          <form
            class="flex flex-wrap gap-2"
            #orderForm
            (submit)="createOrder($event, orderCustomer.value, orderNumber.value, orderForm)"
            data-testid="orders-order-form"
          >
            <select class="select select-sm" #orderCustomer [disabled]="$busy()" aria-label="订单的客户" required>
              @for (customer of customers.value(); track customer.id) {
                <option [value]="customer.id">{{ customer.name }}</option>
              }
            </select>
            <input
              class="input input-sm"
              #orderNumber
              [disabled]="$busy()"
              aria-label="单号"
              placeholder="单号"
              required
            />
            <button class="btn btn-sm" [disabled]="$busy() || customers.value().length === 0" type="submit">
              新建订单
            </button>
          </form>
          <ul class="flex flex-col gap-3">
            @for (order of orders.value(); track order.id) {
              @let orderItems = $itemsByOrder().get(order.id) ?? [];
              <li
                class="border-base-200 rounded border p-3"
                [attr.data-order-number]="order.number"
                data-testid="order"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-medium" data-testid="order-number">{{ order.number }}</span>
                  <span class="text-sm" data-testid="order-customer">客户：{{ customerName(order.customerId) }}</span>
                  <span class="text-sm" data-testid="order-total">¥{{ total(orderItems) }}</span>
                  <button class="btn btn-xs btn-ghost" [disabled]="$busy()" (click)="remove(order)" type="button">
                    删除订单
                  </button>
                </div>
                <ul class="flex flex-col gap-1 text-sm">
                  @for (item of orderItems; track item.id) {
                    @let attached = (item.categories$ | async) ?? [];
                    <li class="flex flex-wrap items-center gap-2" data-testid="order-item">
                      <span>{{ item.productName }} × {{ item.quantity }} · ¥{{ item.price }}</span>
                      <span class="flex flex-wrap gap-1" data-testid="order-item-categories">
                        @for (category of attached; track category.id) {
                          <span class="badge badge-sm gap-1">
                            {{ category.name }}
                            <button
                              class="btn btn-ghost btn-xs"
                              [attr.aria-label]="'摘掉分类 ' + category.name"
                              [disabled]="$busy()"
                              (click)="detach(item, category)"
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        }
                      </span>
                      @let choices = unattached(attached);
                      <form
                        class="flex gap-1"
                        #attachForm
                        (submit)="attach($event, item, attachCategory.value, attachForm)"
                        data-testid="order-item-category-form"
                      >
                        <select class="select select-xs" #attachCategory [disabled]="$busy()" aria-label="挂上分类">
                          @for (category of choices; track category.id) {
                            <option [value]="category.id">{{ category.name }}</option>
                          }
                        </select>
                        <button class="btn btn-xs" [disabled]="$busy() || choices.length === 0" type="submit">
                          挂上
                        </button>
                      </form>
                    </li>
                  }
                </ul>
                <form
                  class="mt-2 flex flex-wrap gap-2"
                  #itemForm
                  (submit)="
                    addItem(
                      $event,
                      order,
                      { productName: product.value, quantity: quantity.value, price: price.value },
                      itemForm
                    )
                  "
                  data-testid="order-item-form"
                >
                  <input
                    class="input input-xs"
                    #product
                    [disabled]="$busy()"
                    aria-label="商品名称"
                    placeholder="商品名称"
                  />
                  <input
                    class="input input-xs w-20"
                    #quantity
                    [disabled]="$busy()"
                    aria-label="数量"
                    inputmode="numeric"
                  />
                  <input
                    class="input input-xs w-24"
                    #price
                    [disabled]="$busy()"
                    aria-label="单价"
                    inputmode="decimal"
                  />
                  <button class="btn btn-xs" [disabled]="$busy()" type="submit">加订单项</button>
                </form>
              </li>
            } @empty {
              <li class="text-base-content/60 text-sm">还没有订单</li>
            }
          </ul>
        </div>
      </section>

      <app-sync-rejections-panel />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class OrdersPage {
  readonly #rxdb = inject(RxDB);
  readonly #syncState = useSyncState();
  readonly #busy = signal(false);
  readonly #syncing = signal<SyncDirection | null>(null);
  readonly #syncCount = signal(0);
  readonly #notice = signal<string | null>(null);
  readonly #error = signal<string | null>(null);
  /** 客户 id → 名字；computed 用到时才读客户列表，可以写在它前面 */
  readonly #customerNames = computed(() => new Map(this.customers.value().map(item => [item.id, item.name])));

  /** 远端是否连上；纯本地模式下推送与拉取不可用 */
  readonly remoteSync = inject(RemoteSyncState);
  /** 当前身份：订单走未分区的日志同步，只对登录身份开放（US-225） */
  readonly session = inject(DemoSession);

  readonly customers = useFindAll(DemoCustomer, byCreated());
  readonly idCards = useFindAll(DemoIdCard, byCreated());
  readonly orders = useFindAll(DemoOrder, byCreated());
  readonly items = useFindAll(DemoOrderItem, byCreated());
  readonly categories = useFindAll(DemoCategory, byCreated());
  /** 本机还没推送的修改（整机），与「推送」的范围一致 */
  readonly pushableCount$ = this.#rxdb.versionManager.pushableCount$;
  /** 远端还没拉到本机的修改（整机），与「拉取」的范围一致 */
  readonly pullableCount$ = this.#rxdb.versionManager.pullableCount$;

  /** 推送与拉取可用：远端连着，且当前是登录身份 */
  readonly $syncEnabled = computed(() => this.remoteSync.$connected() && this.session.signedIn);
  /** 正在写本机 */
  readonly $busy = this.#busy.asReadonly();
  /** 正在跑的同步方向 */
  readonly $syncing = this.#syncing.asReadonly();
  /** 已经结束的同步轮数（成功或失败） */
  readonly $syncCount = this.#syncCount.asReadonly();
  /** 上一轮同步的结果 */
  readonly $notice = this.#notice.asReadonly();
  /** 上一次操作失败的原因 */
  readonly $error = this.#error.asReadonly();
  readonly $itemsByOrder = computed(() => itemsByOrder(this.items.value()));
  /** 客户 id → 他的证件；两边的引用对得上才算（见 {@link idCardOf}） */
  readonly $idCardByCustomer = computed(
    () => new Map(this.customers.value().map(customer => [customer.id, idCardOf(customer, this.idCards.value())]))
  );
  /** 依赖的客户已不在远端、因此被拒的订单 */
  readonly $dependencyNotices = computed(() =>
    describeDependencyRejections(this.#syncState.lastRejections(), this.customers.value())
  );

  readonly total = orderTotal;

  /** 订单的客户名；客户已被删掉、订单还没随之消失的那一刻显示 id */
  customerName(customerId: DemoCustomer['id']): string {
    return this.#customerNames().get(customerId) ?? customerId;
  }

  /** 新建客户；填了证件号码时，客户与证件在同一批里新建、互相引用 */
  createCustomer(event: Event, name: string, idCardCode: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('先填客户名称');
    const code = idCardCode.trim();
    if (!code) {
      return this.#write(() => this.#rxdb.entityManager.instantiate(DemoCustomer, { name: trimmed }).save(), form);
    }
    return this.#write(() => this.#saveCustomerWithIdCard(trimmed, code), form);
  }

  createOrder(event: Event, customerId: string, number: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = number.trim();
    const customer = this.customers.value().find(item => item.id === customerId);
    if (!customer) return this.#fail('先选订单的客户');
    if (!trimmed) return this.#fail('先填单号');
    return this.#write(
      () => this.#rxdb.entityManager.instantiate(DemoOrder, { number: trimmed, customerId: customer.id }).save(),
      form
    );
  }

  addItem(
    event: Event,
    order: DemoOrder,
    input: { productName: string; quantity: string; price: string },
    form: HTMLFormElement
  ): Promise<void> {
    event.preventDefault();
    const parsed = parseOrderItemDraft(input);
    if (!parsed.ok) return this.#fail(parsed.error);
    return this.#write(
      () => this.#rxdb.entityManager.instantiate(DemoOrderItem, { ...parsed.draft, orderId: order.id }).save(),
      form
    );
  }

  createCategory(event: Event, name: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('先填分类名称');
    return this.#write(() => this.#rxdb.entityManager.instantiate(DemoCategory, { name: trimmed }).save(), form);
  }

  /**
   * 删本机的行；子行（分类的是关联行，客户的是证件）由本地外键级联删掉，推送时按子在前推上去。
   * 删证件时客户留着，它的证件引用由本地外键置空
   */
  remove(entity: DemoCustomer | DemoOrder | DemoCategory | DemoIdCard): Promise<void> {
    return this.#write(() => entity.remove());
  }

  /** 还没挂到这条订单项上的分类 */
  unattached(attached: readonly Pick<DemoCategory, 'id'>[]): DemoCategory[] {
    return this.categories.value().filter(category => !attached.some(item => item.id === category.id));
  }

  /** 给订单项挂上一个分类：写本机的中间表，随这条订单项保存 */
  attach(event: Event, item: DemoOrderItem, categoryId: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const category = this.categories.value().find(candidate => candidate.id === categoryId);
    if (!category) return this.#fail('先选要挂上的分类');
    return this.#write(async () => {
      await item.categories$.add(category);
      await item.save();
    }, form);
  }

  /** 从订单项上摘掉一个分类：删本机中间表里这一对的行，随这条订单项保存 */
  detach(item: DemoOrderItem, category: DemoCategory): Promise<void> {
    return this.#write(async () => {
      await item.categories$.remove(category);
      await item.save();
    });
  }

  pull(): Promise<void> {
    return this.#sync('pull', async () => describePullOutcome(await this.#rxdb.syncManager.pull()));
  }

  push(): Promise<void> {
    return this.#sync('push', async () => describePushOutcome(await this.#rxdb.syncManager.push()));
  }

  async #write(operation: () => Promise<unknown>, form?: HTMLFormElement): Promise<void> {
    this.#busy.set(true);
    this.#error.set(null);
    try {
      await operation();
      form?.reset();
    } catch (error) {
      this.#error.set(getErrorMessage(error, '写入本机失败'));
    } finally {
      this.#busy.set(false);
    }
  }

  #fail(message: string): Promise<void> {
    this.#error.set(message);
    return Promise.resolve();
  }

  /**
   * 同一批新建互相引用的客户与证件
   *
   * @remarks
   * 两边的 id 先定下来，各自带上对方的 id：本地外键到提交时才检查，同一个事务里没有先后之分。推送时客户的证件引用
   * 先写空、同一请求里再补写（US-038）。
   */
  #saveCustomerWithIdCard(name: string, code: string): Promise<unknown> {
    const entityManager = this.#rxdb.entityManager;
    const customerId = uuid();
    const idCardId = uuid();
    return entityManager.saveMany([
      entityManager.instantiate(DemoCustomer, { id: customerId, name, idCardId }),
      entityManager.instantiate(DemoIdCard, { id: idCardId, code, ownerId: customerId })
    ]);
  }

  async #sync(direction: SyncDirection, operation: () => Promise<SyncOutcome>): Promise<void> {
    this.#syncing.set(direction);
    this.#error.set(null);
    this.#notice.set(null);
    try {
      const outcome = await operation();
      this.#notice.set(outcome.notice);
      this.#error.set(outcome.error);
    } catch (error) {
      this.#error.set(getErrorMessage(error, direction === 'pull' ? '拉取失败' : '推送失败'));
    } finally {
      this.#syncing.set(null);
      this.#syncCount.update(count => count + 1);
    }
  }
}
