import { RxDB, uuid } from '@aiao/rxdb';
import { useFindAll, useSyncState } from '@aiao/rxdb-angular';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { historyActions } from '../history-actions';
import { registerPageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import { SyncCommands } from '../sync-commands';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem } from './order-entities';
import {
  describeDependencyRejections,
  idCardOf,
  itemsByOrder,
  orderTotal,
  parseOrderItemDraft
} from './orders-interactions';

/** 发起写入的那张卡片：失败原因显示在它里面 */
type OrdersCard = 'customer' | 'category' | 'order';

/** 订单页撤销、重做的作用域：五个实体合起来，挂分类用的关联表随两端一并算进来（US-316） */
const ORDER_HISTORY_SCOPE = [DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem, DemoCategory];

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
 * 顶栏的「推送」推整机、「拉取」拉整机（epic-016）：全量推送按外键把父实体排到前面（US-037），删除时子在前。
 * 撤销、重做作用于订单的五个实体合起来（US-316），跨客户与证件的一次写入整条撤销，不会撤到 Todo 与商品；
 * 删客户时本地外键级联删掉的订单、订单项与证件与源删除同一个事务，撤销一次整组回来（US-318）。
 * 已登录的身份共享全部订单（Alice 与 Bob 开两个浏览器对照）；别人已在远端删掉的客户，本机给他新建的订单推不上去，
 * 被拒清单里是这条订单，下面另外指出是哪位客户。给订单项挂上、摘掉分类写的是中间表：关联行 id 由两端派生，
 * 两个人给同一条订单项挂同一个分类只落成远端的一行（US-228）。客户与证件互相持有外键：新建客户时填上证件号码，
 * 两行在同一批里新建、互相引用，推送时客户的证件引用先写空、同一请求里再补写；删掉证件只把客户的引用置空（US-038）。
 * 访客的订单只存在本机（US-225）。
 */
@Component({
  selector: 'app-orders-page',
  imports: [AsyncPipe],
  template: `
    <main class="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold" data-testid="orders-title">订单 · 关系数据的推拉同步</h1>
        <p class="text-base-content/70 text-sm">
          客户、订单与订单项之间有外键：删订单带走订单项，删客户带走订单与证件。客户与证件互相引用，可以在同一批里新建。
          修改先存在本机，推送时父行排在前面、删除时子行排在前面。开两个浏览器分别登录 Alice 与
          Bob，在顶栏推送一边、拉取另一边。
        </p>
      </header>

      @if (!remoteSync.$connected()) {
        <div class="alert alert-warning" data-testid="orders-local-mode" role="alert">
          未连接远端（纯本地模式）：订单只存在本机，没有推送与拉取。
        </div>
      } @else if (!session.signedIn) {
        <div class="alert alert-info" data-testid="orders-visitor-notice" role="status">
          访客的订单只存在本机：订单走日志同步，只对登录身份开放。用右上角切换成 Alice、Bob
          或匿名用户之后才能推送与拉取订单。
        </div>
      }

      @if ($dependencyNotices().length > 0) {
        <ul class="alert alert-warning flex flex-col items-start text-sm" data-testid="orders-dependency-notices">
          @for (notice of $dependencyNotices(); track $index) {
            <li>{{ notice }}</li>
          }
        </ul>
      }

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-customers-title">
        <div class="card-body gap-3">
          <h2 class="card-title" id="orders-customers-title">客户</h2>
          @if (errorOf('customer'); as error) {
            <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
          }
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
          @if (errorOf('category'); as error) {
            <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
          }
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
          @if (errorOf('order'); as error) {
            <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
          }
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
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class OrdersPage {
  readonly #rxdb = inject(RxDB);
  readonly #syncState = useSyncState();
  readonly #busy = signal(false);
  readonly #error = signal<{ readonly card: OrdersCard; readonly message: string } | null>(null);
  /** 客户 id → 名字；computed 用到时才读客户列表，可以写在它前面 */
  readonly #customerNames = computed(() => new Map(this.customers.value().map(item => [item.id, item.name])));

  /** 远端是否连上：本地模式与访客的提示据此给 */
  readonly remoteSync = inject(RemoteSyncState);
  /** 当前身份：订单走未分区的日志同步，只对登录身份开放（US-225） */
  readonly session = inject(DemoSession);

  readonly customers = useFindAll(DemoCustomer, byCreated());
  readonly idCards = useFindAll(DemoIdCard, byCreated());
  readonly orders = useFindAll(DemoOrder, byCreated());
  readonly items = useFindAll(DemoOrderItem, byCreated());
  readonly categories = useFindAll(DemoCategory, byCreated());

  /** 正在写本机 */
  readonly $busy = this.#busy.asReadonly();
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

  constructor() {
    const history = this.#rxdb.versionManager.history(ORDER_HISTORY_SCOPE);
    registerPageWorkbench({
      title: '订单',
      scopeLabel: '本页：订单',
      ...historyActions(history, signal(null)),
      history,
      ...inject(SyncCommands).forPage()
    });
  }

  /** 这张卡片上一次写入失败的原因 */
  errorOf(card: OrdersCard): string | null {
    const error = this.#error();
    return error?.card === card ? error.message : null;
  }

  /** 订单的客户名；客户已被删掉、订单还没随之消失的那一刻显示 id */
  customerName(customerId: DemoCustomer['id']): string {
    return this.#customerNames().get(customerId) ?? customerId;
  }

  /** 新建客户；填了证件号码时，客户与证件在同一批里新建、互相引用 */
  createCustomer(event: Event, name: string, idCardCode: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('customer', '先填客户名称');
    const code = idCardCode.trim();
    if (!code) {
      return this.#write(
        'customer',
        () => this.#rxdb.entityManager.instantiate(DemoCustomer, { name: trimmed }).save(),
        form
      );
    }
    return this.#write('customer', () => this.#saveCustomerWithIdCard(trimmed, code), form);
  }

  createOrder(event: Event, customerId: string, number: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = number.trim();
    const customer = this.customers.value().find(item => item.id === customerId);
    if (!customer) return this.#fail('order', '先选订单的客户');
    if (!trimmed) return this.#fail('order', '先填单号');
    return this.#write(
      'order',
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
    if (!parsed.ok) return this.#fail('order', parsed.error);
    return this.#write(
      'order',
      () => this.#rxdb.entityManager.instantiate(DemoOrderItem, { ...parsed.draft, orderId: order.id }).save(),
      form
    );
  }

  createCategory(event: Event, name: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('category', '先填分类名称');
    return this.#write(
      'category',
      () => this.#rxdb.entityManager.instantiate(DemoCategory, { name: trimmed }).save(),
      form
    );
  }

  /**
   * 删本机的行；子行（分类的是关联行，客户的是订单、订单项与证件）由本地外键级联删掉，与源删除同一个事务（US-318），
   * 推送时按子在前推上去。删证件时客户留着，它的证件引用由本地外键置空
   */
  remove(entity: DemoCustomer | DemoOrder | DemoCategory | DemoIdCard): Promise<void> {
    const card: OrdersCard =
      entity instanceof DemoCategory ? 'category'
      : entity instanceof DemoOrder ? 'order'
      : 'customer';
    return this.#write(card, () => entity.remove());
  }

  /** 还没挂到这条订单项上的分类 */
  unattached(attached: readonly Pick<DemoCategory, 'id'>[]): DemoCategory[] {
    return this.categories.value().filter(category => !attached.some(item => item.id === category.id));
  }

  /** 给订单项挂上一个分类：写本机的中间表，随这条订单项保存 */
  attach(event: Event, item: DemoOrderItem, categoryId: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const category = this.categories.value().find(candidate => candidate.id === categoryId);
    if (!category) return this.#fail('order', '先选要挂上的分类');
    return this.#write(
      'order',
      async () => {
        await item.categories$.add(category);
        await item.save();
      },
      form
    );
  }

  /** 从订单项上摘掉一个分类：删本机中间表里这一对的行，随这条订单项保存 */
  detach(item: DemoOrderItem, category: DemoCategory): Promise<void> {
    return this.#write('order', async () => {
      await item.categories$.remove(category);
      await item.save();
    });
  }

  async #write(card: OrdersCard, operation: () => Promise<unknown>, form?: HTMLFormElement): Promise<void> {
    this.#busy.set(true);
    this.#error.set(null);
    try {
      await operation();
      form?.reset();
    } catch (error) {
      this.#error.set({ card, message: getErrorMessage(error, '写入本机失败') });
    } finally {
      this.#busy.set(false);
    }
  }

  #fail(card: OrdersCard, message: string): Promise<void> {
    this.#error.set({ card, message });
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
}
