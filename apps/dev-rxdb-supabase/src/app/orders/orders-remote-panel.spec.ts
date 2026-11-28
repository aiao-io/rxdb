import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { SyncCommands } from '../sync-commands';
import { Toasts } from '../toasts';
import type { OrdersRemoteSnapshot } from './orders-remote';
import { OrdersRemotePanel } from './orders-remote-panel';

const remote = vi.hoisted(() => ({
  fetchOrdersSnapshot: vi.fn(),
  deleteRemoteCustomer: vi.fn(),
  deleteRemoteOrder: vi.fn(),
  createRemoteOrderTree: vi.fn()
}));

vi.mock('./orders-remote', () => remote);

const snapshot: OrdersRemoteSnapshot = {
  customers: [
    { id: 'c1', name: '星河客户', idCardId: 'card1' },
    { id: 'c2', name: '远端客户 B2C4', idCardId: null }
  ],
  idCards: [{ id: 'card1', code: 'ID-001', ownerId: 'c1' }],
  orders: [{ id: 'o1', number: 'SO-1', customerId: 'c1' }],
  items: [
    { id: 'i1', productName: '耳机', quantity: 2, price: 10, orderId: 'o1' },
    { id: 'i2', productName: '手环', quantity: 1, price: 5, orderId: 'o1' }
  ],
  categories: [
    { id: 'k1', name: '数码' },
    { id: 'k2', name: '礼品' }
  ],
  attachments: [{ id: 'a1', categoriesId: 'k1', orderItemsId: 'i1' }]
};

/** 手动决定什么时候返回的读取 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

function render(options: { signedIn?: boolean; localIds?: string[]; load?: () => Promise<OrdersRemoteSnapshot> } = {}) {
  vi.clearAllMocks();
  remote.fetchOrdersSnapshot.mockImplementation(options.load ?? (() => Promise.resolve(snapshot)));
  remote.deleteRemoteCustomer.mockResolvedValue(undefined);
  remote.deleteRemoteOrder.mockResolvedValue(undefined);
  remote.createRemoteOrderTree.mockResolvedValue(undefined);
  const client = { from: vi.fn() };
  const round = signal(0);
  TestBed.configureTestingModule({
    providers: [
      { provide: DemoSession, useValue: { signedIn: options.signedIn ?? true, prepared: { client } } },
      { provide: SyncCommands, useValue: { round } }
    ]
  });
  const toasts = TestBed.inject(Toasts);
  const show = vi.spyOn(toasts, 'show');
  const fixture = TestBed.createComponent(OrdersRemotePanel);
  fixture.componentRef.setInput('localIds', new Set(options.localIds ?? ['c1', 'card1', 'o1', 'i1', 'i2', 'k1', 'k2']));
  const root = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string, scope: ParentNode = root) => scope.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const allByTestId = (id: string, scope: ParentNode = root) => [
    ...scope.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)
  ];
  const button = (scope: ParentNode, name: string) =>
    [...scope.querySelectorAll('button')].find(item => item.textContent?.trim() === name) ?? null;
  return { fixture, root, client, round, show, byTestId, allByTestId, button };
}

describe('OrdersRemotePanel（远端数据）', () => {
  it('打开就读远端：客户下挂证件与订单，订单下挂订单项与金额，订单项列出远端关联的分类', async () => {
    const { fixture, client, byTestId, allByTestId } = render();
    await settle(fixture);

    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledWith(client);
    expect(byTestId('orders-remote-counts')?.textContent).toContain(
      '客户 2 · 证件 1 · 订单 1 · 订单项 2 · 分类 2 · 关联 1'
    );
    const [star, other] = allByTestId('remote-customer');
    expect(star.textContent).toContain('星河客户');
    expect(byTestId('remote-customer-id-card', star)?.textContent?.trim()).toBe('证件：ID-001');
    expect(byTestId('remote-customer-id-card', other)?.textContent?.trim()).toBe('无证件');
    const order = byTestId('remote-order', star);
    expect(order?.dataset['orderNumber']).toBe('SO-1');
    expect(order?.textContent).toContain('¥25');
    const [earphone, band] = allByTestId('remote-order-item', star);
    expect(earphone.textContent).toContain('耳机 × 2 · ¥10');
    expect(byTestId('remote-order-item-categories', earphone)?.textContent).toContain('数码');
    expect(byTestId('remote-order-item-categories', band)?.textContent?.trim()).toBe('');
    expect(allByTestId('remote-category').map(chip => chip.textContent?.trim())).toEqual(['数码', '礼品']);
  });

  it('本机还没有的远端行标「本机没有」：拉取之后才会出现在本机', async () => {
    const { fixture, allByTestId, byTestId } = render({ localIds: ['c1', 'card1', 'o1', 'i1', 'k1'] });
    await settle(fixture);

    const [star, other] = allByTestId('remote-customer');
    expect(byTestId('remote-missing', other)).not.toBeNull();
    expect(allByTestId('remote-missing', star)).toHaveLength(1);
    expect(allByTestId('remote-order-item', star)[1].textContent).toContain('本机没有');
    expect(allByTestId('remote-category')[1].textContent).toContain('本机没有');
  });

  it('每轮推拉结束重读一次，「刷新」也重读', async () => {
    const { fixture, round, button, root } = render();
    await settle(fixture);
    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledTimes(1);

    round.set(1);
    await settle(fixture);
    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledTimes(2);

    button(root, '刷新')?.click();
    await settle(fixture);
    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledTimes(3);
  });

  it('在远端删客户（模拟别人删了他）：删完重读，提示本机要拉取才会变', async () => {
    const { fixture, client, allByTestId, button, show } = render();
    await settle(fixture);

    button(allByTestId('remote-customer')[0], '在远端删除客户')?.click();
    await settle(fixture);

    expect(remote.deleteRemoteCustomer).toHaveBeenCalledWith(client, 'c1');
    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    expect(show.mock.calls[0][0].message).toContain('已在远端删除「星河客户」');
  });

  it('在远端删订单：订单项随之级联删除', async () => {
    const { fixture, client, byTestId, button, show } = render();
    await settle(fixture);

    button(byTestId('remote-order') as HTMLElement, '在远端删除订单')?.click();
    await settle(fixture);

    expect(remote.deleteRemoteOrder).toHaveBeenCalledWith(client, 'o1');
    expect(show.mock.calls[0][0].message).toContain('已在远端删除订单 SO-1');
  });

  it('模拟别人新建一组：带证件的客户、订单与订单项，id 与外键都先定好', async () => {
    const { fixture, client, root, button, show } = render();
    await settle(fixture);

    button(root, '模拟别人新建一组')?.click();
    await settle(fixture);

    expect(remote.createRemoteOrderTree).toHaveBeenCalledOnce();
    const [usedClient, rows] = remote.createRemoteOrderTree.mock.calls[0];
    expect(usedClient).toBe(client);
    expect(rows.customer.name).toMatch(/^远端客户 [0-9A-F]{4}$/u);
    expect(rows.idCard.ownerId).toBe(rows.customer.id);
    expect(rows.order.customerId).toBe(rows.customer.id);
    expect(rows.items.map((item: { orderId: string }) => item.orderId)).toEqual([rows.order.id, rows.order.id]);
    expect(show.mock.calls[0][0].message).toContain(`已在远端新建「${rows.customer.name}」`);
  });

  it('远端写失败：原因留在面板里，不弹成功消息', async () => {
    const { fixture, allByTestId, button, byTestId, show } = render();
    await settle(fixture);
    remote.deleteRemoteCustomer.mockRejectedValueOnce(new Error('这一行已经不在远端了，刷新看看'));

    button(allByTestId('remote-customer')[0], '在远端删除客户')?.click();
    await settle(fixture);

    expect(byTestId('orders-remote-error')?.textContent).toContain('这一行已经不在远端了');
    expect(show).not.toHaveBeenCalled();
  });

  it('几次重读重叠时只认最后发出的那次：先发后到的旧结果不盖掉新的', async () => {
    const older = deferred<OrdersRemoteSnapshot>();
    const newer = deferred<OrdersRemoteSnapshot>();
    const pending = [older.promise, newer.promise];
    const { fixture, round, allByTestId } = render({ load: () => pending.shift() ?? Promise.resolve(snapshot) });
    fixture.detectChanges();
    round.set(1);
    fixture.detectChanges();

    newer.resolve({ ...snapshot, customers: [{ id: 'c9', name: '新快照', idCardId: null }] });
    await settle(fixture);
    older.resolve({ ...snapshot, customers: [{ id: 'c8', name: '旧快照', idCardId: null }] });
    await settle(fixture);

    expect(remote.fetchOrdersSnapshot).toHaveBeenCalledTimes(2);
    expect(allByTestId('remote-customer').map(row => row.textContent)).toEqual([expect.stringContaining('新快照')]);
  });

  it('读不到远端：原因显示在面板里', async () => {
    const { fixture, byTestId } = render({ load: () => Promise.reject(new Error('Failed to fetch')) });
    await settle(fixture);

    expect(byTestId('orders-remote-error')?.textContent).toContain('Failed to fetch');
  });

  it('访客没有远端订单表的权限：只给说明，不读远端', async () => {
    const { fixture, byTestId, root } = render({ signedIn: false });
    await settle(fixture);

    expect(byTestId('orders-remote-visitor')?.textContent).toContain('访客');
    expect(remote.fetchOrdersSnapshot).not.toHaveBeenCalled();
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });
});
