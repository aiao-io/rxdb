import { RxDB, type PullResult, type SyncRejection } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { PageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import { RightPanel } from '../side-panel';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem } from './order-entities';
import { attachmentId } from './orders-interactions';
import OrdersPage from './orders.page';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn(), useSyncState: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll, useSyncState: angularMocks.useSyncState };
});

/** 订单项挂着的分类：`categories$` 是关系的可观察集合，带 add / remove */
function categoriesOf(initial: { id: string; name: string }[]) {
  return Object.assign(new BehaviorSubject(initial), {
    add: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve())
  });
}

/** 待推送清单的一项：只关心落在哪些行上 */
type PendingHistory = { changes: { entityId: string; type: 'INSERT' | 'UPDATE' | 'DELETE' }[] };

const pulled: PullResult = {
  pulled: 2,
  compacted: 0,
  applied: 2,
  hasMore: false,
  conflictsResolved: 0,
  conflictsDeferred: 0,
  failures: [],
  persistedProgress: true,
  historyInvalidated: true
};

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

function render(
  options: { connected?: boolean; signedIn?: boolean; rejections?: SyncRejection[]; pending?: PendingHistory[] } = {}
) {
  const customer = { id: 'c1', name: '星河客户', idCardId: 'card1', remove: vi.fn(() => Promise.resolve()) };
  const noCard = { id: 'c2', name: '极光客户', idCardId: null, remove: vi.fn(() => Promise.resolve()) };
  const idCard = { id: 'card1', ownerId: 'c1', code: 'ID-001', remove: vi.fn(() => Promise.resolve()) };
  const order = { id: 'o1', number: 'SO-1', customerId: 'c1', remove: vi.fn(() => Promise.resolve()) };
  const digital = { id: 'k1', name: '数码', remove: vi.fn(() => Promise.resolve()) };
  const gift = { id: 'k2', name: '礼品', remove: vi.fn(() => Promise.resolve()) };
  const items = [
    {
      id: 'i1',
      orderId: 'o1',
      productName: '耳机',
      quantity: 2,
      price: 10,
      categories$: categoriesOf([digital]),
      save: vi.fn(() => Promise.resolve())
    },
    {
      id: 'i2',
      orderId: 'o1',
      productName: '手环',
      quantity: 1,
      price: 5,
      categories$: categoriesOf([]),
      save: vi.fn(() => Promise.resolve())
    }
  ];
  const saved: { entity: unknown; data: unknown }[] = [];
  const instantiate = vi.fn((entity: unknown, data: unknown) => ({
    entity,
    data,
    save: vi.fn(() => {
      saved.push({ entity, data });
      return Promise.resolve();
    })
  }));
  /** 同一批保存的实体：每次调用一组 */
  const savedTogether: { entity: unknown; data: unknown }[][] = [];
  const saveMany = vi.fn((entities: { entity: unknown; data: unknown }[]) => {
    savedTogether.push(entities.map(({ entity, data }) => ({ entity, data })));
    return Promise.resolve(entities);
  });
  const pull = vi.fn(() => Promise.resolve(pulled));
  const history = {
    type: 'repositories',
    histories$: of([]),
    undoCount$: of(0),
    redoCount$: of(0),
    undoBarrier$: of(null),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve())
  };
  const pending = new BehaviorSubject<PendingHistory[]>(options.pending ?? []);
  const rxdb = {
    entityManager: { instantiate, saveMany },
    syncManager: { pull, push: vi.fn() },
    versionManager: {
      history: vi.fn(() => history),
      pushableCount$: new BehaviorSubject(3),
      pullableCount$: new BehaviorSubject(1),
      pushableHistories$: pending
    }
  };
  const lists = new Map<unknown, unknown[]>([
    [DemoCustomer, [customer, noCard]],
    [DemoIdCard, [idCard]],
    [DemoOrder, [order]],
    [DemoOrderItem, items],
    [DemoCategory, [digital, gift]]
  ]);
  angularMocks.useFindAll.mockImplementation((entity: unknown) => ({ value: signal(lists.get(entity) ?? []) }));
  angularMocks.useSyncState.mockReturnValue({ lastRejections: signal(options.rejections ?? []) });
  const remoteSync = new RemoteSyncState();
  remoteSync.markConnected(options.connected ?? true);
  const session = {
    signedIn: options.signedIn ?? true,
    prepared: {},
    $switching: signal(false),
    switchTo: vi.fn(() => Promise.resolve())
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: RemoteSyncState, useValue: remoteSync },
      { provide: DemoSession, useValue: session }
    ]
  });
  const fixture = TestBed.createComponent(OrdersPage);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string, scope: ParentNode = root) => scope.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const allByTestId = (id: string, scope: ParentNode = root) => [
    ...scope.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)
  ];
  const card = (name: string) => {
    const found = allByTestId('customer-card').find(item => byTestId('customer', item)?.textContent?.includes(name));
    if (!found) throw new Error(`Missing customer card ${name}`);
    return found;
  };
  const button = (scope: Element, name: string) =>
    [...scope.querySelectorAll('button')].find(item => item.textContent?.trim() === name) ?? null;
  const fill = (scope: Element, selector: string, value: string) => {
    const input = scope.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (!input) throw new Error(`Missing ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
  };
  const submit = (testId: string, scope: Element = root) => {
    const form = scope.querySelector<HTMLFormElement>(`[data-testid="${testId}"]`);
    if (!form) throw new Error(`Missing form ${testId}`);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  };
  return {
    fixture,
    root,
    byTestId,
    allByTestId,
    card,
    button,
    fill,
    submit,
    saved,
    savedTogether,
    instantiate,
    saveMany,
    pull,
    pending,
    rxdb,
    history,
    session,
    customer,
    idCard,
    order,
    items,
    digital,
    gift
  };
}

describe('OrdersPage（US-227 阶段 A）', () => {
  it('按关系嵌套着列：客户下面是他的订单，订单下面是订单项与金额', async () => {
    const { fixture, card, byTestId, allByTestId } = render();
    await settle(fixture);

    const star = card('星河客户');
    const orderRow = byTestId('order', star);
    expect(orderRow?.dataset['orderNumber']).toBe('SO-1');
    expect(byTestId('order-total', orderRow as HTMLElement)?.textContent).toContain('¥25');
    const itemRows = allByTestId('order-item', orderRow as HTMLElement).map(row => row.textContent);
    expect(itemRows).toHaveLength(2);
    expect(itemRows[0]).toContain('耳机');
    expect(itemRows[0]).toContain('× 2');
    expect(byTestId('order', card('极光客户'))).toBeNull();
    expect(card('极光客户').textContent).toContain('还没有订单');
  });

  it('新建客户、订单与订单项都先写本机：订单建在所在的客户下，订单项建在所在的订单下', async () => {
    const { fixture, root, card, fill, submit, saved } = render();
    await settle(fixture);

    fill(root, '[data-testid="orders-customer-form"] input', '月光客户');
    submit('orders-customer-form');
    await settle(fixture);
    fill(card('星河客户'), '[data-testid="orders-order-form"] input', 'SO-2');
    submit('orders-order-form', card('星河客户'));
    await settle(fixture);
    const orderRow = root.querySelector('[data-testid="order"]') as HTMLElement;
    fill(orderRow, 'input[placeholder="商品名称"]', '充电宝');
    fill(orderRow, 'input[aria-label="数量"]', '3');
    fill(orderRow, 'input[aria-label="单价"]', '49');
    submit('order-item-form', orderRow);
    await settle(fixture);

    expect(saved).toEqual([
      { entity: DemoCustomer, data: { name: '月光客户' } },
      { entity: DemoOrder, data: { number: 'SO-2', customerId: 'c1' } },
      { entity: DemoOrderItem, data: { productName: '充电宝', quantity: 3, price: 49, orderId: 'o1' } }
    ]);
  });

  it('订单项的数量默认是 1：只填商品名称与单价也能加', async () => {
    const { fixture, root, fill, submit, saved } = render();
    await settle(fixture);

    const orderRow = root.querySelector('[data-testid="order"]') as HTMLElement;
    expect(orderRow.querySelector<HTMLInputElement>('input[aria-label="数量"]')?.value).toBe('1');
    fill(orderRow, 'input[placeholder="商品名称"]', '数据线');
    fill(orderRow, 'input[aria-label="单价"]', '19.9');
    submit('order-item-form', orderRow);
    await settle(fixture);

    expect(saved).toEqual([
      { entity: DemoOrderItem, data: { productName: '数据线', quantity: 1, price: 19.9, orderId: 'o1' } }
    ]);
  });

  it('订单项填得不对时给出原因，显示在这位客户的卡片里，不写本机', async () => {
    const { fixture, root, card, fill, submit, instantiate, byTestId } = render();
    await settle(fixture);

    const orderRow = root.querySelector('[data-testid="order"]') as HTMLElement;
    fill(orderRow, 'input[placeholder="商品名称"]', '充电宝');
    fill(orderRow, 'input[aria-label="数量"]', '0');
    fill(orderRow, 'input[aria-label="单价"]', '49');
    submit('order-item-form', orderRow);
    await settle(fixture);

    expect(instantiate).not.toHaveBeenCalled();
    expect(byTestId('orders-error', card('星河客户'))?.textContent).toContain('数量要是正整数');
    expect(byTestId('orders-error', card('极光客户'))).toBeNull();
  });

  it('删除订单与删除客户删的是本机的行，推送之后远端级联', async () => {
    const { fixture, root, button, customer, order } = render();
    await settle(fixture);

    button(root.querySelector('[data-testid="order"]') as Element, '删除订单')?.click();
    await settle(fixture);
    button(root.querySelector('[data-testid="customer"]') as Element, '删除客户')?.click();
    await settle(fixture);

    expect(order.remove).toHaveBeenCalledOnce();
    expect(customer.remove).toHaveBeenCalledOnce();
  });

  it('登记到顶栏：撤销、重做作用于订单的五个实体合起来，推拉是整机的（epic-016）', async () => {
    const { fixture, rxdb, history, pull } = render();
    await settle(fixture);
    const page = TestBed.inject(PageWorkbench).current();

    expect(page).toMatchObject({ title: '订单', scopeLabel: '本页：订单' });
    expect(rxdb.versionManager.history).toHaveBeenCalledWith([
      DemoCustomer,
      DemoIdCard,
      DemoOrder,
      DemoOrderItem,
      DemoCategory
    ]);
    expect(page?.history).toBe(history);
    await page?.pull?.run();
    expect(pull).toHaveBeenCalledWith({ fetchAll: true });
  });

  it('页面里不再有自己的同步卡片与被拒清单：它们在顶栏和同步中心', async () => {
    const { fixture, byTestId, root } = render();
    await settle(fixture);

    for (const id of ['orders-sync', 'orders-push', 'orders-pull', 'orders-pending-count']) {
      expect(byTestId(id)).toBeNull();
    }
    expect(root.querySelector('app-sync-rejections-panel')).toBeNull();
  });

  it('写入失败的原因显示在发起写入的那张卡片里（US-231 AC#10）', async () => {
    const { fixture, root, card, fill, submit, byTestId } = render();
    await settle(fixture);

    fill(root, '[data-testid="orders-customer-form"] input', '   ');
    submit('orders-customer-form');
    await settle(fixture);

    const customers = root.querySelector('[aria-labelledby="orders-customers-title"]') as HTMLElement;
    const categories = root.querySelector('[aria-labelledby="orders-categories-title"]') as HTMLElement;
    expect(byTestId('orders-error', customers)?.textContent).toContain('先填客户名称');
    expect(byTestId('orders-error', categories)).toBeNull();
    expect(byTestId('orders-error', card('星河客户'))).toBeNull();

    submit('orders-order-form', card('极光客户'));
    await settle(fixture);
    expect(byTestId('orders-error', card('极光客户'))?.textContent).toContain('先填单号');
  });

  it('依赖的客户已不在远端的订单被拒时，指出是哪位客户（AC#4）', async () => {
    const rejection: SyncRejection = {
      namespace: 'public',
      entity: 'DemoOrder',
      entityId: 'o9',
      op: 'INSERT',
      code: '23503',
      reason: 'dependency',
      message: 'violates foreign key constraint',
      dependsOn: { namespace: 'public', entity: 'DemoCustomer', entityId: 'c1' },
      at: new Date(),
      changeIds: [7]
    };
    const { fixture, byTestId } = render({ rejections: [rejection] });
    await settle(fixture);

    expect(byTestId('orders-dependency-notices')?.textContent).toContain('它的客户「星河客户」已不在远端');
  });

  it('访客（AC#5）：提示订单只存本机，一键切换成 Alice；仍然可以在本机新建', async () => {
    const { fixture, root, byTestId, button, fill, submit, saved, session } = render({ signedIn: false });
    await settle(fixture);

    const notice = byTestId('orders-visitor-notice') as HTMLElement;
    expect(notice.textContent).toContain('访客的订单只存在本机');
    button(notice, '切换成 Alice')?.click();
    expect(session.switchTo).toHaveBeenCalledWith('alice');
    fill(root, '[data-testid="orders-customer-form"] input', '访客的客户');
    submit('orders-customer-form');
    await settle(fixture);

    expect(saved).toEqual([{ entity: DemoCustomer, data: { name: '访客的客户' } }]);
  });

  it('阶段 B：新建分类写本机；删除分类删的是本机的行', async () => {
    const { fixture, root, fill, submit, saved, button, digital } = render();
    await settle(fixture);

    fill(root, '[data-testid="orders-category-form"] input', '礼品');
    submit('orders-category-form');
    await settle(fixture);
    button(root.querySelector('[data-testid="category"]') as Element, '删除分类')?.click();
    await settle(fixture);

    expect(saved).toEqual([{ entity: DemoCategory, data: { name: '礼品' } }]);
    expect(digital.remove).toHaveBeenCalledOnce();
  });

  it('阶段 B：订单项列出挂着的分类；挂上、摘掉分类都写本机并保存这条订单项', async () => {
    const { fixture, root, fill, submit, items, digital, gift } = render();
    await settle(fixture);

    const [earphone] = [...root.querySelectorAll<HTMLElement>('[data-testid="order-item"]')];
    expect(earphone.querySelector('[data-testid="order-item-categories"]')?.textContent).toContain('数码');
    // 已经挂上的分类不在可选项里
    const options = [...earphone.querySelectorAll('[data-testid="order-item-category-form"] option')];
    expect(options.map(option => option.textContent?.trim())).toEqual(['礼品']);

    fill(earphone, '[data-testid="order-item-category-form"] select', 'k2');
    submit('order-item-category-form', earphone);
    await settle(fixture);
    expect(items[0].categories$.add).toHaveBeenCalledWith(gift);
    expect(items[0].save).toHaveBeenCalledOnce();

    (earphone.querySelector('button[aria-label="摘掉分类 数码"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(items[0].categories$.remove).toHaveBeenCalledWith(digital);
    expect(items[0].save).toHaveBeenCalledTimes(2);
  });

  it('阶段 B：分类都挂上了就不再给挂上的入口', async () => {
    const { fixture, root, items, digital, gift } = render();
    await settle(fixture);

    items[1].categories$.next([digital, gift]);
    await settle(fixture);

    const band = [...root.querySelectorAll<HTMLElement>('[data-testid="order-item"]')][1];
    expect(band.querySelector('[data-testid="order-item-category-form"]')).toBeNull();
  });

  it('没连远端（纯本地模式）时说明原因，不登记推拉；没有怎么测、远端数据与未推送的标记', async () => {
    const { fixture, byTestId, root } = render({
      connected: false,
      pending: [{ changes: [{ entityId: 'c1', type: 'INSERT' }] }]
    });
    await settle(fixture);

    expect(byTestId('orders-local-mode')?.textContent).toContain('未连接远端');
    expect(TestBed.inject(PageWorkbench).current()).toMatchObject({ push: null, pull: null });
    expect(byTestId('orders-guide')).toBeNull();
    expect(byTestId('orders-remote-toggle')).toBeNull();
    expect(root.querySelector('[data-testid="unpushed"]')).toBeNull();
  });

  it('阶段 C：客户一行显示他的证件，没有证件的显示「无证件」', async () => {
    const { fixture, root } = render();
    await settle(fixture);

    const cards = [...root.querySelectorAll('[data-testid="customer"]')].map(row =>
      row.querySelector('[data-testid="customer-id-card"]')?.textContent?.trim()
    );
    expect(cards).toEqual(['证件：ID-001', '无证件']);
  });

  it('阶段 C：填了证件号码时，客户与证件在同一批里新建、互相引用（AC#10）', async () => {
    const { fixture, root, fill, submit, saved, savedTogether, saveMany } = render();
    await settle(fixture);

    fill(root, '[data-testid="orders-customer-form"] input[aria-label="客户名称"]', '月光客户');
    fill(root, '[data-testid="orders-customer-form"] input[aria-label="证件号码"]', ' ID-002 ');
    submit('orders-customer-form');
    await settle(fixture);

    expect(saved).toEqual([]);
    expect(saveMany).toHaveBeenCalledOnce();
    const [[customerRow, cardRow]] = savedTogether;
    const customerData = customerRow.data as { id: string; name: string; idCardId: string };
    const cardData = cardRow.data as { id: string; code: string; ownerId: string };
    expect(customerRow.entity).toBe(DemoCustomer);
    expect(cardRow.entity).toBe(DemoIdCard);
    expect(customerData).toMatchObject({ name: '月光客户', idCardId: cardData.id });
    expect(cardData).toMatchObject({ code: 'ID-002', ownerId: customerData.id });
    expect(customerData.id).not.toBe(cardData.id);
  });

  it('阶段 C：删除证件删的是本机的证件，客户还在（AC#11）', async () => {
    const { fixture, root, button, customer, idCard } = render();
    await settle(fixture);

    button(root.querySelector('[data-testid="customer"]') as Element, '删除证件')?.click();
    await settle(fixture);

    expect(idCard.remove).toHaveBeenCalledOnce();
    expect(customer.remove).not.toHaveBeenCalled();
  });
});

describe('OrdersPage 怎么测（US-235）', () => {
  it('连着远端时页面上就有「怎么测」：按场景列出步骤', async () => {
    const { fixture, byTestId } = render();
    await settle(fixture);

    expect(byTestId('orders-guide')).not.toBeNull();
    expect(byTestId('orders-scenario')?.dataset['scenario']).toBe('push');
  });

  it('生成示例数据：带证件的客户、他的一张订单与两条订单项，一次写进本机、互相对得上', async () => {
    const { fixture, byTestId, saveMany, savedTogether } = render();
    await settle(fixture);

    byTestId('orders-seed')?.click();
    await settle(fixture);

    expect(saveMany).toHaveBeenCalledOnce();
    const [rows] = savedTogether;
    expect(rows.map(row => row.entity)).toEqual([DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem, DemoOrderItem]);
    const [customer, idCard, order, ...items] = rows.map(row => row.data as Record<string, unknown>);
    expect(customer['name']).toMatch(/^示例客户 [0-9A-F]{4}$/u);
    expect(customer['idCardId']).toBe(idCard['id']);
    expect(idCard['ownerId']).toBe(customer['id']);
    expect(order['customerId']).toBe(customer['id']);
    expect(items.map(item => item['orderId'])).toEqual([order['id'], order['id']]);
  });

  it('还没推送的行标「未推送」：新建与修改各有说法；推送之后清单空了，标记跟着消失', async () => {
    const { fixture, root, card, byTestId, allByTestId, pending } = render({
      pending: [
        { changes: [{ entityId: 'c1', type: 'INSERT' }] },
        { changes: [{ entityId: 'o1', type: 'UPDATE' }] },
        { changes: [{ entityId: 'o9', type: 'DELETE' }] }
      ]
    });
    await settle(fixture);

    const star = byTestId('customer', card('星河客户')) as HTMLElement;
    expect(byTestId('unpushed', star)?.dataset['kind']).toBe('INSERT');
    expect(byTestId('unpushed', byTestId('order') as HTMLElement)?.dataset['kind']).toBe('UPDATE');
    expect(allByTestId('unpushed')).toHaveLength(2);

    pending.next([]);
    await settle(fixture);
    expect(root.querySelector('[data-testid="unpushed"]')).toBeNull();
  });

  it('刚挂上、还没推送的分类标出来：按关联行的 id 认', async () => {
    const { fixture, root } = render({
      pending: [{ changes: [{ entityId: attachmentId('i1', 'k1'), type: 'INSERT' }] }]
    });
    await settle(fixture);

    const [earphone] = [...root.querySelectorAll<HTMLElement>('[data-testid="order-item"]')];
    const chip = earphone.querySelector<HTMLElement>('[data-testid="order-item-categories"] .badge');
    expect(chip?.dataset['unpushed']).toBe('true');
  });

  it('页头的「远端数据」在右侧面板打开远端的表；再点一下收起', async () => {
    const { fixture, byTestId } = render();
    await settle(fixture);
    const panel = TestBed.inject(RightPanel);
    const toggle = byTestId('orders-remote-toggle') as HTMLButtonElement;

    expect(panel.headingOf('server')).toBe('远端数据');
    toggle.click();
    fixture.detectChanges();
    expect(panel.active()).toBe('server');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.active()).toBeNull();
  });

  it('离开页面：撤回远端数据的面板，开着就一并关上', async () => {
    const { fixture, byTestId } = render();
    await settle(fixture);
    const panel = TestBed.inject(RightPanel);
    byTestId('orders-remote-toggle')?.click();

    fixture.destroy();

    expect(panel.pagePanel('server')).toBeUndefined();
    expect(panel.active()).toBeNull();
  });
});
