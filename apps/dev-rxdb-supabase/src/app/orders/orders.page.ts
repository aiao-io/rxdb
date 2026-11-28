import { RxDB, uuid } from '@aiao/rxdb';
import { useFindAll, useSyncState } from '@aiao/rxdb-angular';
import { CdkPortal } from '@angular/cdk/portal';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDatabase as Database, LucideDynamicIcon, LucideSparkles as Sparkles } from '@lucide/angular';
import { of } from 'rxjs';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { historyActions } from '../history-actions';
import { registerPageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import { RightPanel } from '../side-panel';
import { SyncCommands } from '../sync-commands';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem } from './order-entities';
import {
  attachmentId,
  describeDependencyRejections,
  groupBy,
  idCardOf,
  orderTotal,
  orderTreeDraft,
  orderTreeRows,
  parseOrderItemDraft,
  pendingRows
} from './orders-interactions';
import { OrdersRemotePanel } from './orders-remote-panel';
import { OrdersScenarioGuide } from './orders-scenario-guide';
import { UnpushedBadge } from './unpushed-badge';

/** 订单页撤销、重做的作用域：五个实体合起来，挂分类用的关联表随两端一并算进来（US-316） */
const ORDER_HISTORY_SCOPE = [DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem, DemoCategory];

/** 按建立先后排；同一毫秒建的行再按 `id` 排，顺序稳定 */
function byCreated(sort: 'asc' | 'desc') {
  return {
    where: { combinator: 'and' as const, rules: [] },
    orderBy: [
      { field: 'createdAt', sort },
      { field: 'id', sort }
    ]
  };
}

/**
 * 订单：关系数据的推拉同步（US-227），按「怎么测」一个窗口就能试（US-235）
 *
 * @remarks
 * 客户 1—n 订单 1—n 订单项，订单项 n—n 分类，表与外键在 `supabase/orders-demo.sql`。页面按关系嵌套着画：客户下面是证件与
 * 订单，订单下面是订单项，订单项上挂分类——删父行时整棵子树一起消失，级联看得见。所有修改先写本机，还没推送的行标「未推送」；
 * 顶栏的「推送」推整机、「拉取」拉整机（epic-016）：全量推送按外键把父实体排到前面（US-037），删除时子在前。
 *
 * 页头的「远端数据」在右侧面板里直接读远端的表，并能模拟别人改远端（删客户、删订单、新建一组），拉取与外键被拒不用另开浏览器；
 * 「怎么测」按场景列出步骤与预期。「生成示例数据」一次写下一位带证件的客户、他的订单与订单项，免得每次手填。
 *
 * 撤销、重做作用于订单的五个实体合起来（US-316），跨客户与证件的一次写入整条撤销，不会撤到 Todo 与商品；
 * 删客户时本地外键级联删掉的订单、订单项与证件与源删除同一个事务，撤销一次整组回来（US-318）。
 * 已登录的身份共享全部订单；别人已在远端删掉的客户，本机给他新建的订单推不上去，被拒清单里是这条订单，页面上方另外指出是哪位客户。
 * 给订单项挂上、摘掉分类写的是中间表：关联行 id 由两端派生，两个人给同一条订单项挂同一个分类只落成远端的一行（US-228）。
 * 客户与证件互相持有外键：新建客户时填上证件号码，两行在同一批里新建、互相引用，推送时客户的证件引用先写空、同一请求里再补写；
 * 删掉证件只把客户的引用置空（US-038）。访客的订单只存在本机（US-225）。
 */
@Component({
  selector: 'app-orders-page',
  imports: [AsyncPipe, CdkPortal, LucideDynamicIcon, OrdersRemotePanel, OrdersScenarioGuide, UnpushedBadge],
  template: `
    <main class="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="text-2xl font-bold" data-testid="orders-title">订单 · 关系数据的推拉同步</h1>
          <p class="text-base-content/70 text-sm">
            客户 1—n 订单 1—n 订单项，订单项 n—n 分类，客户 1—1 证件（互相引用）。修改先存在本机，用顶栏推送、拉取：
            推送时父行排在前面，删除时子行排在前面。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-sm btn-primary"
            [disabled]="$busy()"
            (click)="seed()"
            data-testid="orders-seed"
            title="一位带证件的客户、他的一张订单与两条订单项，一次写进本机"
            type="button"
          >
            <svg [lucideIcon]="Sparkles" size="16"></svg>
            生成示例数据
          </button>
          @if (remoteSync.$connected()) {
            <button
              class="btn btn-sm"
              #remoteToggle
              [attr.aria-expanded]="panel.active() === 'server'"
              [class.btn-active]="panel.active() === 'server'"
              (click)="panel.toggle('server', remoteToggle)"
              aria-controls="side-panel"
              data-testid="orders-remote-toggle"
              title="直接读远端的表，并能模拟别人改远端"
              type="button"
            >
              <svg [lucideIcon]="Database" size="16"></svg>
              远端数据
            </button>
          }
        </div>
      </header>

      @if (!remoteSync.$connected()) {
        <div class="alert alert-warning" data-testid="orders-local-mode" role="alert">
          未连接远端（纯本地模式）：订单只存在本机，没有推送与拉取。连 Supabase 演示请运行 pnpm nx dev
          dev-rxdb-supabase。
        </div>
      } @else if (!session.signedIn) {
        <div class="alert alert-info" data-testid="orders-visitor-notice" role="status">
          <span>
            访客的订单只存在本机：订单走日志同步，只对登录身份开放。切换成 Alice、Bob 或匿名用户之后才能推送与拉取订单。
          </span>
          <button
            class="btn btn-sm btn-primary"
            [disabled]="session.$switching()"
            (click)="session.switchTo('alice')"
            type="button"
          >
            切换成 Alice
          </button>
        </div>
      }

      @if ($dependencyNotices().length > 0) {
        <ul class="alert alert-warning flex flex-col items-start text-sm" data-testid="orders-dependency-notices">
          @for (notice of $dependencyNotices(); track $index) {
            <li>{{ notice }}</li>
          }
        </ul>
      }

      @if (remoteSync.$connected()) {
        <app-orders-scenario-guide />
      }

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-customers-title">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="card-title" id="orders-customers-title">客户与订单</h2>
            <span class="text-base-content/60 text-xs">删订单带走订单项，删客户带走证件、订单与订单项</span>
          </div>
          @if (errorOf('customers'); as error) {
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
              title="填了就与客户在同一批里新建：两行互相引用"
            />
            <button class="btn btn-sm" [disabled]="$busy()" type="submit">新建客户</button>
          </form>

          <ul class="flex flex-col gap-3">
            @for (customer of customers.value(); track customer.id) {
              @let idCard = $idCardByCustomer().get(customer.id);
              <li class="border-base-300 rounded-box flex flex-col gap-2 border p-3" data-testid="customer-card">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="customer">
                  <span class="font-semibold" data-testid="customer-name">{{ customer.name }}</span>
                  <app-unpushed-badge [kind]="$pending().get(customer.id)" />
                  <span class="text-base-content/70 text-sm" data-testid="customer-id-card">
                    {{ idCard ? '证件：' + idCard.code : '无证件' }}
                  </span>
                  @if (idCard) {
                    <app-unpushed-badge [kind]="$pending().get(idCard.id)" />
                  }
                  <span class="ms-auto flex gap-1">
                    @if (idCard) {
                      <button
                        class="btn btn-xs btn-ghost"
                        [disabled]="$busy()"
                        (click)="remove(customer.id, idCard)"
                        title="只删证件：客户留着，证件引用置空"
                        type="button"
                      >
                        删除证件
                      </button>
                    }
                    <button
                      class="btn btn-xs btn-ghost text-error"
                      [disabled]="$busy()"
                      (click)="remove('customers', customer)"
                      title="连同证件、订单、订单项与分类关联一起删"
                      type="button"
                    >
                      删除客户
                    </button>
                  </span>
                </div>
                @if (errorOf(customer.id); as error) {
                  <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
                }

                <ul class="border-base-200 flex flex-col gap-3 border-s ps-3">
                  @for (order of $ordersByCustomer().get(customer.id) ?? []; track order.id) {
                    @let orderItems = $itemsByOrder().get(order.id) ?? [];
                    <li class="flex flex-col gap-1" [attr.data-order-number]="order.number" data-testid="order">
                      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span class="font-medium"
                          >订单 <span data-testid="order-number">{{ order.number }}</span></span
                        >
                        <app-unpushed-badge [kind]="$pending().get(order.id)" />
                        <span class="text-sm" data-testid="order-total">¥{{ total(orderItems) }}</span>
                        <button
                          class="btn btn-xs btn-ghost text-error ms-auto"
                          [disabled]="$busy()"
                          (click)="remove(customer.id, order)"
                          title="连同它的订单项与分类关联一起删"
                          type="button"
                        >
                          删除订单
                        </button>
                      </div>
                      <ul class="flex flex-col gap-1 ps-3 text-sm">
                        @for (item of orderItems; track item.id) {
                          @let attached = (item.categories$ | async) ?? [];
                          @let choices = unattached(attached);
                          <li class="flex flex-wrap items-center gap-2" data-testid="order-item">
                            <span>{{ item.productName }} × {{ item.quantity }} · ¥{{ item.price }}</span>
                            <app-unpushed-badge [kind]="$pending().get(item.id)" />
                            <span class="flex flex-wrap gap-1" data-testid="order-item-categories">
                              @for (category of attached; track category.id) {
                                @let unpushed = $pending().has(attachmentId(item.id, category.id));
                                <span
                                  class="badge badge-sm gap-1"
                                  [attr.data-unpushed]="unpushed || null"
                                  [class.badge-warning]="unpushed"
                                  [title]="unpushed ? '挂上之后还没推送' : ''"
                                >
                                  {{ category.name }}
                                  <button
                                    class="btn btn-ghost btn-xs"
                                    [attr.aria-label]="'摘掉分类 ' + category.name"
                                    [disabled]="$busy()"
                                    (click)="detach(customer.id, item, category)"
                                    type="button"
                                  >
                                    ×
                                  </button>
                                </span>
                              }
                            </span>
                            @if (choices.length > 0) {
                              <form
                                class="flex gap-1"
                                #attachForm
                                (submit)="attach($event, customer.id, item, attachCategory.value, attachForm)"
                                data-testid="order-item-category-form"
                              >
                                <select
                                  class="select select-xs w-28"
                                  #attachCategory
                                  [disabled]="$busy()"
                                  aria-label="挂上分类"
                                >
                                  @for (category of choices; track category.id) {
                                    <option [value]="category.id">{{ category.name }}</option>
                                  }
                                </select>
                                <button class="btn btn-xs" [disabled]="$busy()" type="submit">挂上</button>
                              </form>
                            }
                          </li>
                        }
                      </ul>
                      <form
                        class="flex flex-wrap gap-2 ps-3"
                        #itemForm
                        (submit)="
                          addItem(
                            $event,
                            customer.id,
                            order,
                            { productName: product.value, quantity: quantity.value, price: price.value },
                            itemForm
                          )
                        "
                        data-testid="order-item-form"
                      >
                        <input
                          class="input input-xs w-32"
                          #product
                          [disabled]="$busy()"
                          aria-label="商品名称"
                          placeholder="商品名称"
                        />
                        <label class="input input-xs w-28">
                          <span class="label">数量</span>
                          <input #quantity [disabled]="$busy()" aria-label="数量" inputmode="numeric" value="1" />
                        </label>
                        <label class="input input-xs w-32">
                          <span class="label">单价</span>
                          <input #price [disabled]="$busy()" aria-label="单价" inputmode="decimal" />
                        </label>
                        <button class="btn btn-xs" [disabled]="$busy()" type="submit">加订单项</button>
                      </form>
                    </li>
                  } @empty {
                    <li class="text-base-content/60 text-sm">还没有订单</li>
                  }
                  <li>
                    <form
                      class="flex flex-wrap gap-2"
                      #orderForm
                      (submit)="createOrder($event, customer, orderNumber.value, orderForm)"
                      data-testid="orders-order-form"
                    >
                      <input
                        class="input input-sm w-36"
                        #orderNumber
                        [disabled]="$busy()"
                        aria-label="单号"
                        placeholder="单号"
                        required
                      />
                      <button class="btn btn-sm" [disabled]="$busy()" type="submit">新建订单</button>
                    </form>
                  </li>
                </ul>
              </li>
            } @empty {
              <li class="text-base-content/60 text-sm" data-testid="orders-empty">
                还没有客户：填上面的表单，或点页头的「生成示例数据」。
              </li>
            }
          </ul>
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm" aria-labelledby="orders-categories-title">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="card-title" id="orders-categories-title">分类</h2>
            <span class="text-base-content/60 text-xs"
              >多对多：一个分类能挂到多条订单项上；删分类只删关联，订单项还在</span
            >
          </div>
          @if (errorOf('categories'); as error) {
            <div class="alert alert-error text-sm" data-testid="orders-error" role="alert">{{ error }}</div>
          }
          <ul class="flex flex-wrap gap-2">
            @for (category of categories.value(); track category.id) {
              <li class="badge badge-outline gap-1" data-testid="category">
                {{ category.name }}
                <app-unpushed-badge [kind]="$pending().get(category.id)" />
                <button
                  class="btn btn-ghost btn-xs"
                  [disabled]="$busy()"
                  (click)="remove('categories', category)"
                  title="只删分类与它的关联，订单项还在"
                  type="button"
                >
                  删除分类
                </button>
              </li>
            } @empty {
              <li class="text-base-content/60 text-sm">还没有分类：新建之后能挂到订单项上。</li>
            }
          </ul>
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
        </div>
      </section>

      <ng-template cdkPortal>
        <app-orders-remote-panel [localIds]="$localIds()" />
      </ng-template>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class OrdersPage {
  readonly #rxdb = inject(RxDB);
  readonly #syncState = useSyncState();
  readonly #busy = signal(false);
  /** 上一次写入失败的原因，以及显示在哪：`customers`、`categories`，或客户 id（这位客户的卡片里） */
  readonly #error = signal<{ readonly target: string; readonly message: string } | null>(null);
  /** 待推送清单（US-317）：只在连着远端时订阅，本地模式没有推送，也就没有「未推送」 */
  readonly #pendingHistories = toSignal(
    inject(RemoteSyncState).$connected() ? this.#rxdb.versionManager.pushableHistories$ : of([]),
    { initialValue: [] }
  );

  /** 远端是否连上：本地模式与访客的提示、未推送的标记与远端数据面板据此给 */
  readonly remoteSync = inject(RemoteSyncState);
  /** 当前身份：订单走未分区的日志同步，只对登录身份开放（US-225） */
  readonly session = inject(DemoSession);
  readonly panel = inject(RightPanel);
  readonly remotePortal = viewChild(CdkPortal);
  readonly Sparkles = Sparkles;
  readonly Database = Database;

  /** 新建的客户在最上面，紧挨着新建表单；订单与订单项按建立先后 */
  readonly customers = useFindAll(DemoCustomer, byCreated('desc'));
  readonly idCards = useFindAll(DemoIdCard, byCreated('asc'));
  readonly orders = useFindAll(DemoOrder, byCreated('asc'));
  readonly items = useFindAll(DemoOrderItem, byCreated('asc'));
  readonly categories = useFindAll(DemoCategory, byCreated('asc'));

  /** 正在写本机 */
  readonly $busy = this.#busy.asReadonly();
  /** 还没推送的行：id → 新建还是修改 */
  readonly $pending = computed(() => pendingRows(this.#pendingHistories()));
  readonly $ordersByCustomer = computed(() => groupBy(this.orders.value(), order => order.customerId));
  readonly $itemsByOrder = computed(() => groupBy(this.items.value(), item => item.orderId));
  /** 客户 id → 他的证件；两边的引用对得上才算（见 {@link idCardOf}） */
  readonly $idCardByCustomer = computed(
    () => new Map(this.customers.value().map(customer => [customer.id, idCardOf(customer, this.idCards.value())]))
  );
  /** 本机全部行的 id：远端数据面板据此标出远端有、本机还没有的行 */
  readonly $localIds = computed(
    () =>
      new Set(
        [
          ...this.customers.value(),
          ...this.idCards.value(),
          ...this.orders.value(),
          ...this.items.value(),
          ...this.categories.value()
        ].map(row => row.id)
      )
  );
  /** 依赖的客户已不在远端、因此被拒的订单 */
  readonly $dependencyNotices = computed(() =>
    describeDependencyRejections(this.#syncState.lastRejections(), this.customers.value())
  );

  readonly total = orderTotal;
  readonly attachmentId = attachmentId;

  constructor() {
    const history = this.#rxdb.versionManager.history(ORDER_HISTORY_SCOPE);
    registerPageWorkbench({
      title: '订单',
      scopeLabel: '本页：订单',
      ...historyActions(history, signal(null)),
      history,
      ...inject(SyncCommands).forPage()
    });
    // 远端数据交给右侧面板的槽位；离开本页时撤回，开着就一并关上
    effect(onCleanup => {
      const portal = this.remotePortal();
      if (!portal) return;
      onCleanup(this.panel.provide('server', { heading: '远端数据', portal }));
    });
  }

  /** 这张卡片上一次写入失败的原因 */
  errorOf(target: string): string | null {
    const error = this.#error();
    return error?.target === target ? error.message : null;
  }

  /**
   * 一次写下一组示例：带证件的客户、他的一张订单与两条订单项
   *
   * @remarks
   * 同一个事务：顶栏撤销一次整组撤掉，推送一次整组推上去（客户与证件互相引用，父行排在前面）。
   */
  seed(): Promise<void> {
    const rows = orderTreeRows(orderTreeDraft('示例客户', uuid().slice(-4).toUpperCase()), uuid);
    const entityManager = this.#rxdb.entityManager;
    return this.#write('customers', () =>
      entityManager.saveMany([
        entityManager.instantiate(DemoCustomer, rows.customer),
        entityManager.instantiate(DemoIdCard, rows.idCard),
        entityManager.instantiate(DemoOrder, rows.order),
        ...rows.items.map(item => entityManager.instantiate(DemoOrderItem, item))
      ])
    );
  }

  /** 新建客户；填了证件号码时，客户与证件在同一批里新建、互相引用 */
  createCustomer(event: Event, name: string, idCardCode: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('customers', '先填客户名称');
    const code = idCardCode.trim();
    if (!code) {
      return this.#write(
        'customers',
        () => this.#rxdb.entityManager.instantiate(DemoCustomer, { name: trimmed }).save(),
        form
      );
    }
    return this.#write('customers', () => this.#saveCustomerWithIdCard(trimmed, code), form);
  }

  /** 给这位客户新建一张订单 */
  createOrder(event: Event, customer: DemoCustomer, number: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = number.trim();
    if (!trimmed) return this.#fail(customer.id, '先填单号');
    return this.#write(
      customer.id,
      () => this.#rxdb.entityManager.instantiate(DemoOrder, { number: trimmed, customerId: customer.id }).save(),
      form
    );
  }

  addItem(
    event: Event,
    target: string,
    order: DemoOrder,
    input: { productName: string; quantity: string; price: string },
    form: HTMLFormElement
  ): Promise<void> {
    event.preventDefault();
    const parsed = parseOrderItemDraft(input);
    if (!parsed.ok) return this.#fail(target, parsed.error);
    return this.#write(
      target,
      () => this.#rxdb.entityManager.instantiate(DemoOrderItem, { ...parsed.draft, orderId: order.id }).save(),
      form
    );
  }

  createCategory(event: Event, name: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return this.#fail('categories', '先填分类名称');
    return this.#write(
      'categories',
      () => this.#rxdb.entityManager.instantiate(DemoCategory, { name: trimmed }).save(),
      form
    );
  }

  /**
   * 删本机的行；子行（分类的是关联行，客户的是订单、订单项与证件）由本地外键级联删掉，与源删除同一个事务（US-318），
   * 推送时按子在前推上去。删证件时客户留着，它的证件引用由本地外键置空
   *
   * @param target - 失败原因显示在哪：`customers`（客户卡片）、`categories`（分类卡片），或这一行所属的客户 id
   * @param entity - 要删的行
   */
  remove(target: string, entity: DemoCustomer | DemoOrder | DemoCategory | DemoIdCard): Promise<void> {
    return this.#write(target, () => entity.remove());
  }

  /** 还没挂到这条订单项上的分类 */
  unattached(attached: readonly Pick<DemoCategory, 'id'>[]): DemoCategory[] {
    return this.categories.value().filter(category => !attached.some(item => item.id === category.id));
  }

  /** 给订单项挂上一个分类：写本机的中间表，随这条订单项保存 */
  attach(event: Event, target: string, item: DemoOrderItem, categoryId: string, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    const category = this.categories.value().find(candidate => candidate.id === categoryId);
    if (!category) return this.#fail(target, '先选要挂上的分类');
    return this.#write(
      target,
      async () => {
        await item.categories$.add(category);
        await item.save();
      },
      form
    );
  }

  /** 从订单项上摘掉一个分类：删本机中间表里这一对的行，随这条订单项保存 */
  detach(target: string, item: DemoOrderItem, category: DemoCategory): Promise<void> {
    return this.#write(target, async () => {
      await item.categories$.remove(category);
      await item.save();
    });
  }

  async #write(target: string, operation: () => Promise<unknown>, form?: HTMLFormElement): Promise<void> {
    this.#busy.set(true);
    this.#error.set(null);
    try {
      await operation();
      form?.reset();
    } catch (error) {
      this.#error.set({ target, message: getErrorMessage(error, '写入本机失败') });
    } finally {
      this.#busy.set(false);
    }
  }

  #fail(target: string, message: string): Promise<void> {
    this.#error.set({ target, message });
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
