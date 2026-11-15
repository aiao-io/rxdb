import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminConsole } from './admin-console';
import { ProductClient, ProductRequestError } from './product-client';

const user = {
  id: 'fixture-user',
  email: 'fixture@example.test',
  createdAt: null,
  lastSignInAt: null,
  disabled: false,
  revision: 2,
  authState: 'applied'
};
const usage = { sources: {}, partial: true };

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
});

async function rig(status = 'signed-in', render = false) {
  if (!render) TestBed.overrideComponent(AdminConsole, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AdminConsole);
  const client = new ProductClient(async () => {
    throw new Error('测试禁止真实授权');
  });
  const admin = vi.spyOn(client, 'admin').mockImplementation(async (path, method = 'GET') => {
    if (method !== 'GET') return { content: { revision: 5 }, account: { auth_state: 'applied' } };
    if (path.startsWith('users?')) return { users: [user] };
    if (path === 'audit') return { entries: [{ id: 1, action: 'publish' }] };
    if (path.startsWith('tasks?')) return { reports: [{ id: 'task-report' }] };
    if (path.startsWith('usage?')) return usage;
    return {};
  });
  fixture.componentRef.setInput('client', client);
  fixture.componentRef.setInput('identity', 'fixture-admin');
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
  return { fixture, component: fixture.componentInstance, admin };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('administrative access and identity', () => {
  it('免费平台保留业务管理入口，移除平台生图与计费入口', async () => {
    const { fixture } = await rig('signed-in', true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('nav[aria-label="后台导航"]')).toBeNull();
    expect(element.textContent).not.toContain('业务管理');
    expect(element.querySelector('[data-testid="console-refresh"]')).toBeNull();
    expect(element.querySelector('h2')?.textContent).toBe('用户列表');
  });

  it.each(['signed-out', 'unverified', 'checking'])('does not request data for %s sessions', async status => {
    const { component, admin } = await rig(status);
    await component.load();
    expect(admin).not.toHaveBeenCalled();
    expect(component.allowed()).toBe(false);
    expect(component.users()).toEqual([]);
    expect(component.message()).toContain(status === 'checking' ? '验证账号' : '管理员账号');
  });

  it('checks the administrative session before reading the first page', async () => {
    const { component, admin } = await rig();
    expect(admin.mock.calls.slice(0, 2).map(([path]) => path)).toEqual(['session', 'users?page=1&perPage=25']);
    expect(component.allowed()).toBe(true);
    expect(component.users()).toEqual([user]);
  });

  it('clears previously loaded private data when permission is revoked', async () => {
    const { component, admin } = await rig();
    admin.mockRejectedValue(new Error('权限已撤销'));
    await component.load();
    expect(component.allowed()).toBe(false);
    expect(component.users()).toEqual([]);
    expect(component.message()).toBe('权限已撤销');
    expect(component.busy()).toBe(false);
  });

  it('discards late responses after identity changes', async () => {
    const { fixture, component, admin } = await rig();
    let resolve!: (value: unknown) => void;
    admin.mockImplementationOnce(
      () =>
        new Promise(yes => {
          resolve = yes;
        })
    );
    const loading = component.load();
    fixture.componentRef.setInput('identity', 'next-account');
    fixture.componentRef.setInput('status', 'checking');
    fixture.detectChanges();
    expect(component.users()).toEqual([]);
    resolve({});
    await loading;
    expect(component.allowed()).toBe(false);
    expect(component.users()).toEqual([]);
    expect(component.message()).toContain('验证账号');
  });

  it('prevents duplicate loads and tab transitions while a request is active', async () => {
    const { component, admin } = await rig();
    component.busy.set(true);
    admin.mockClear();
    await component.load();
    await component.selectTab('audit');
    await component.changePage(1);
    expect(admin).not.toHaveBeenCalled();
    expect(component.tab()).toBe('users');
  });
});

describe('administrative content and state changes', () => {
  it('requires confirmation and sends revision information when changing account status', async () => {
    const { component, admin } = await rig();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    admin.mockClear();
    await component.setAccount(user);
    expect(admin).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.setAccount(user);
    expect(admin).toHaveBeenCalledWith(
      'users/fixture-user',
      'PATCH',
      expect.objectContaining({ disabled: true, revision: 2, requestId: expect.any(String) })
    );
    expect(component.message()).toBe('账号状态已确认。');
    await component.setAccount({ ...user, disabled: true });
    expect(admin).toHaveBeenCalledWith('users/fixture-user', 'PATCH', expect.objectContaining({ disabled: false }));
  });

  it('keeps an unconfirmed authentication ban distinct from a confirmed product change', async () => {
    const { component, admin } = await rig();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    admin.mockResolvedValueOnce({ account: { auth_state: 'pending' } });
    await component.setAccount(user);
    expect(component.message()).toContain('登录限制待确认');
  });

  it('显示用量指标的已知小计和未知条数', async () => {
    const { component } = await rig();
    expect(component.metric(1, 2)).toBe('1（2条未知）');
    expect(component.metric(null, 1)).toBe('未知（1条未知）');
    expect(component.metric(null)).toBe('未知');
  });

  it('encodes task filters and separates known usage from unknown totals', async () => {
    const { component, admin } = await rig();
    component.filter.model = 'model/a + b';
    component.filter.status = 'completed';
    await component.selectTab('tasks');
    expect(admin).toHaveBeenCalledWith('tasks?model=model%2Fa+%2B+b&status=completed&page=1');
    expect(component.taskRows()).toEqual([{ id: 'task-report' }]);
    expect(component.usage()).toEqual(usage);
    await component.changePage(1);
    expect(component.taskPage()).toBe(2);
    await component.searchTasks();
    expect(component.taskPage()).toBe(1);
    expect(component.sourceLabel('verified')).toBe('核验费用');
    expect(component.sourceLabel('custom')).toBe('custom');
    expect(
      component.currencyList({
        records: 1,
        requestCount: null,
        providerUnits: null,
        verifiedCost: null,
        currencies: {}
      })
    ).toBe('未知');
    expect(
      component.currencyList({ records: 1, requestCount: 1, providerUnits: 1, verifiedCost: 2, currencies: { USD: 2 } })
    ).toBe('USD 2');
  });

  it('clamps the first page and loads the audit trail on its own tab', async () => {
    const { component } = await rig();
    await component.changePage(-1);
    expect(component.page()).toBe(1);
    await component.changePage(1);
    expect(component.page()).toBe(2);
    await component.selectTab('audit');
    expect(component.audit()).toEqual([{ id: 1, action: 'publish' }]);
  });
});

describe('积分管理', () => {
  it('读取所选用户积分，调整失败后用原标识重试，成功后刷新余额', async () => {
    const { component, admin } = await rig();
    const snapshot = { account: { balance: 12, reserved: 2, available: 10 }, entries: [] };
    let failed = false;
    admin.mockImplementation(async (path, method = 'GET') => {
      if (path.endsWith('/credits') && method === 'GET') return snapshot;
      if (path.endsWith('/credits') && method === 'POST') {
        if (!failed) {
          failed = true;
          throw new Error('请求未确认');
        }
        return { entry: {} };
      }
      return {};
    });
    await component.openUser(user);
    expect(component.credits()).toEqual(snapshot);
    component.creditForm.delta = 4;
    component.creditForm.reason = '发放测试';
    await component.adjustCredits();
    expect(component.message()).toContain('未确认');
    expect(component.userDetail()).toEqual(user);
    await component.adjustCredits();
    const writes = admin.mock.calls.filter(call => call[1] === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0][2]).toEqual(writes[1][2]);
    expect(component.credits()).toEqual(snapshot);
    expect(component.message()).toContain('已确认');
  });
  it('切换账号后丢弃迟到的积分结果，空原因不发请求', async () => {
    const { component, fixture, admin } = await rig();
    let resolve: (value: unknown) => void = () => undefined;
    admin.mockImplementation(
      () =>
        new Promise(value => {
          resolve = value;
        })
    );
    const pending = component.openUser(user);
    fixture.componentRef.setInput('identity', 'other-admin');
    fixture.componentRef.setInput('status', 'signed-out');
    fixture.detectChanges();
    resolve({ account: { balance: 9, reserved: 0, available: 9 }, entries: [] });
    await pending;
    expect(component.credits()).toBeNull();
    expect(component.userDetail()).toBeNull();
  });
});

it('积分调整原因必填，分页使用服务器流水标识且不提交调整', async () => {
  const { component, admin } = await rig();
  const entries = [{ id: 71 }];
  admin.mockImplementation(async () => ({ account: { balance: 12, reserved: 0, available: 12 }, entries }));
  await component.openUser(user);
  admin.mockClear();
  component.creditForm.delta = 2;
  component.creditForm.reason = ' ';
  await component.adjustCredits();
  expect(admin).not.toHaveBeenCalled();
  expect(component.message()).toContain('调整原因');
  await component.olderCredits();
  expect(admin).toHaveBeenCalledWith('users/fixture-user/credits?before=71');
});

it('积分操作遇到会话失效或撤权时清除旧后台数据', async () => {
  const { component, admin } = await rig();
  admin.mockResolvedValue({ account: { balance: 12, reserved: 0, available: 12 }, entries: [] });
  await component.openUser(user);
  component.creditForm.delta = 1;
  component.creditForm.reason = '权限复验';
  admin.mockRejectedValue(new ProductRequestError(403, '管理员权限已撤销'));
  await component.adjustCredits();
  expect(component.allowed()).toBe(false);
  expect(component.credits()).toBeNull();
  expect(component.userDetail()).toBeNull();
});

it('管理员从用户列表打开积分表单、填写原因并看到更新余额', async () => {
  const { component, fixture, admin } = await rig('signed-in', true);
  let balance = 12;
  admin.mockImplementation(async (path, method = 'GET', payload) => {
    if (method === 'POST') {
      balance += (payload as { delta: number }).delta;
      return { entry: {} };
    }
    if (path.endsWith('/credits')) return { account: { balance, reserved: 0, available: balance }, entries: [] };
    return {};
  });
  const element: HTMLElement = fixture.nativeElement;
  element.querySelector<HTMLButtonElement>('.account-link')!.click();
  await fixture.whenStable();
  fixture.detectChanges();
  expect(element.textContent).toContain('余额 12');
  const delta = element.querySelector<HTMLInputElement>('input[name="creditDelta"]')!;
  const reason = element.querySelector<HTMLInputElement>('input[name="creditReason"]')!;
  delta.value = '3';
  delta.dispatchEvent(new Event('input', { bubbles: true }));
  reason.value = '活动发放';
  reason.dispatchEvent(new Event('input', { bubbles: true }));
  reason.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await fixture.whenStable();
  fixture.detectChanges();
  expect(admin).toHaveBeenCalledWith(
    'users/fixture-user/credits',
    'POST',
    expect.objectContaining({ delta: 3, reason: '活动发放' })
  );
  expect(component.message()).toBe('积分调整已确认。');
  expect(element.textContent).toContain('余额 15');
});
