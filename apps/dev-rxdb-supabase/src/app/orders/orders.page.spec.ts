import { RxDB, type PullResult, type PushResult, type SyncRejection } from '@aiao/rxdb';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { RemoteSyncState } from '../remote-sync-state';
import { SyncRejectionsPanel } from '../sync-rejections-panel';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem } from './order-entities';
import OrdersPage from './orders.page';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn(), useSyncState: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll, useSyncState: angularMocks.useSyncState };
});

// 被拒清单读同步状态，单测不验它（见 sync-rejections-panel.spec.ts）
@Component({ selector: 'app-sync-rejections-panel', template: '' })
class RejectionsPanelStub {}

/** 订单项挂着的分类：`categories$` 是关系的可观察集合，带 add / remove */
function categoriesOf(initial: { id: string; name: string }[]) {
  return Object.assign(new BehaviorSubject(initial), {
    add: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve())
  });
}

const pushed: PushResult = { pushed: 4, rejected: 0, failed: 0, compacted: 0, originalCount: 4, failures: [] };
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

function render(options: { connected?: boolean; signedIn?: boolean; rejections?: SyncRejection[] } = {}) {
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
  const push = vi.fn(() => Promise.resolve(pushed));
  const pull = vi.fn(() => Promise.resolve(pulled));
  const rxdb = {
    entityManager: { instantiate, saveMany },
    syncManager: { push, pull },
    versionManager: { pushableCount$: new BehaviorSubject(3), pullableCount$: new BehaviorSubject(1) }
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
  TestBed.overrideComponent(OrdersPage, {
    remove: { imports: [SyncRejectionsPanel] },
    add: { imports: [RejectionsPanelStub] }
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: RemoteSyncState, useValue: remoteSync },
      { provide: DemoSession, useValue: { signedIn: options.signedIn ?? true, prepared: {} } }
    ]
  });
  const fixture = TestBed.createComponent(OrdersPage);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
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
    button,
    fill,
    submit,
    saved,
    savedTogether,
    instantiate,
    saveMany,
    push,
    pull,
    customer,
    idCard,
    order,
    items,
    digital,
    gift
  };
}

describe('OrdersPage（US-227 阶段 A）', () => {
  it('列出客户、订单与订单项：订单显示客户名与金额，订单项挂在所属订单下', async () => {
    const { fixture, root } = render();
    await settle(fixture);

    expect(root.querySelector('[data-testid="customer"]')?.textContent).toContain('星河客户');
    const orderRow = root.querySelector<HTMLElement>('[data-testid="order"]');
    expect(orderRow?.dataset['orderNumber']).toBe('SO-1');
    expect(orderRow?.querySelector('[data-testid="order-customer"]')?.textContent).toContain('星河客户');
    expect(orderRow?.querySelector('[data-testid="order-total"]')?.textContent).toContain('¥25');
    const itemRows = [...(orderRow?.querySelectorAll('[data-testid="order-item"]') ?? [])].map(row => row.textContent);
    expect(itemRows).toHaveLength(2);
    expect(itemRows[0]).toContain('耳机');
    expect(itemRows[0]).toContain('× 2');
  });

  it('新建客户、订单与订单项都先写本机：外键取所选的客户与所在的订单', async () => {
    const { fixture, root, fill, submit, saved } = render();
    await settle(fixture);

    fill(root, '[data-testid="orders-customer-form"] input', '极光客户');
    submit('orders-customer-form');
    await settle(fixture);
    fill(root, '[data-testid="orders-order-form"] select', 'c1');
    fill(root, '[data-testid="orders-order-form"] input', 'SO-2');
    submit('orders-order-form');
    await settle(fixture);
    const orderRow = root.querySelector('[data-testid="order"]') as HTMLElement;
    fill(orderRow, 'input[placeholder="商品名称"]', '充电宝');
    fill(orderRow, 'input[aria-label="数量"]', '3');
    fill(orderRow, 'input[aria-label="单价"]', '49');
    submit('order-item-form', orderRow);
    await settle(fixture);

    expect(saved).toEqual([
      { entity: DemoCustomer, data: { name: '极光客户' } },
      { entity: DemoOrder, data: { number: 'SO-2', customerId: 'c1' } },
      { entity: DemoOrderItem, data: { productName: '充电宝', quantity: 3, price: 49, orderId: 'o1' } }
    ]);
  });

  it('订单项填得不对时给出原因，不写本机', async () => {
    const { fixture, root, fill, submit, instantiate, byTestId } = render();
    await settle(fixture);

    const orderRow = root.querySelector('[data-testid="order"]') as HTMLElement;
    fill(orderRow, 'input[placeholder="商品名称"]', '充电宝');
    fill(orderRow, 'input[aria-label="数量"]', '0');
    fill(orderRow, 'input[aria-label="单价"]', '49');
    submit('order-item-form', orderRow);
    await settle(fixture);

    expect(instantiate).not.toHaveBeenCalled();
    expect(byTestId('orders-error')?.textContent).toContain('数量要是正整数');
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

  it('推送与拉取走整机的推拉，结果写在同步区；每结束一轮，轮数加一', async () => {
    const { fixture, byTestId, push, pull } = render();
    await settle(fixture);
    expect(byTestId('orders-pending-count')?.textContent?.trim()).toBe('3');
    expect(byTestId('orders-pullable-count')?.textContent?.trim()).toBe('1');

    byTestId('orders-push')?.click();
    await settle(fixture);
    expect(push).toHaveBeenCalledOnce();
    expect(byTestId('orders-sync-notice')?.textContent).toContain('推送完成：推上去 4 条');
    expect(byTestId('orders-sync')?.dataset['syncCount']).toBe('1');

    byTestId('orders-pull')?.click();
    await settle(fixture);
    expect(pull).toHaveBeenCalledOnce();
    expect(byTestId('orders-sync-notice')?.textContent).toContain('拉取完成：拉到 2 条');
    expect(byTestId('orders-sync')?.dataset['syncCount']).toBe('2');
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

  it('访客（AC#5）：订单只存本机，推送与拉取不可用；仍然可以在本机新建', async () => {
    const { fixture, root, byTestId, fill, submit, saved, push, pull } = render({ signedIn: false });
    await settle(fixture);

    expect(byTestId('orders-visitor-notice')?.textContent).toContain('访客的订单只存在本机');
    expect((byTestId('orders-push') as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId('orders-pull') as HTMLButtonElement).disabled).toBe(true);
    fill(root, '[data-testid="orders-customer-form"] input', '访客的客户');
    submit('orders-customer-form');
    await settle(fixture);

    expect(saved).toEqual([{ entity: DemoCustomer, data: { name: '访客的客户' } }]);
    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
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

  it('没连远端（纯本地模式）时推送与拉取不可用，并说明原因', async () => {
    const { fixture, byTestId } = render({ connected: false });
    await settle(fixture);

    expect(byTestId('orders-local-mode')?.textContent).toContain('未连接远端');
    expect((byTestId('orders-push') as HTMLButtonElement).disabled).toBe(true);
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
