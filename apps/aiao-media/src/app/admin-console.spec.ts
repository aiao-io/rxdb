import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminConsole } from './admin-console';
import { imageMvpCatalog } from './image-mvp-catalog';
import { ProductClient } from './product-client';

const user = {
  id: 'fixture-user',
  email: 'fixture@example.test',
  createdAt: null,
  lastSignInAt: null,
  disabled: false,
  revision: 2,
  authState: 'applied'
};
const templateRow = { kind: 'template' as const, key: imageMvpCatalog[0].id, revision: 3, payload: imageMvpCatalog[0] };
const policyRow = {
  kind: 'provider-policy' as const,
  key: 'runtime',
  revision: 4,
  payload: { version: 1 as const, providers: [] }
};
const content = {
  drafts: [templateRow, policyRow],
  published: [{ kind: policyRow.kind, key: policyRow.key, revision: 2 }]
};
const usage = { sources: {}, partial: true };

async function rig(status = 'signed-in') {
  TestBed.overrideComponent(AdminConsole, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AdminConsole);
  const client = new ProductClient(async () => {
    throw new Error('测试禁止真实授权');
  });
  const admin = vi.spyOn(client, 'admin').mockImplementation(async (path, method = 'GET') => {
    if (method !== 'GET') return { content: { revision: 5 }, account: { auth_state: 'applied' } };
    if (path.startsWith('users?')) return { users: [user] };
    if (path === 'content') return content;
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
});

describe('administrative access and identity', () => {
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
    expect(component.content().drafts).toEqual([]);
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

  it('loads draft and published policy versions separately', async () => {
    const { component } = await rig();
    await component.selectTab('policies');
    expect(component.policyRevision()).toBe(4);
    expect(component.policyActiveRevision()).toBe(2);
    expect(component.policyRow()).toEqual(policyRow);
    expect(component.publishedRevision(policyRow)).toBe(2);
    expect(component.publishedRevision(templateRow)).toBeNull();
    component.addPolicyProvider();
    const entry = component.policy().providers[0];
    expect(entry).toMatchObject({ enabled: false, direct: false, proxy: false, sizes: ['1024x1024'] });
    component.policyModels(entry, ' model-a, , model-b ');
    expect(entry.models).toEqual(['model-a', 'model-b']);
  });

  it('saves a policy draft without claiming that the published version has changed', async () => {
    const { component, admin } = await rig();
    await component.selectTab('policies');
    await component.savePolicy();
    expect(admin).toHaveBeenCalledWith(
      'content/provider-policy/runtime',
      'PUT',
      expect.objectContaining({ revision: 4, payload: policyRow.payload })
    );
    expect(component.policyRevision()).toBe(5);
    expect(component.policyActiveRevision()).toBe(2);
    expect(component.message()).toContain('运行版本尚未更改');
  });

  it('creates a template draft and clears structured fields when switching to plain text', async () => {
    const { component, admin } = await rig();
    await component.selectTab('templates');
    component.setTemplateText('没有选择模板');
    expect(component.template()).toBeNull();
    component.editTemplate();
    expect(component.template()?.id).toBe('new-template');
    component.setTemplateText('新的图片描述');
    expect(component.template()).toMatchObject({ prompt: '新的图片描述', fields: [] });
    await component.saveTemplate();
    expect(admin).toHaveBeenCalledWith(
      'content/template/new-template',
      'PUT',
      expect.objectContaining({ revision: 0 })
    );
    expect(component.templateRevision()).toBe(5);
    expect(component.message()).toContain('尚未发布');
  });

  it('edits a cloned published template and preserves its optimistic concurrency revision', async () => {
    const { component } = await rig();
    component.editTemplate(templateRow);
    expect(component.template()).toEqual(templateRow.payload);
    expect(component.template()).not.toBe(templateRow.payload);
    expect(component.templateRevision()).toBe(3);
    component.setTemplateText('修改后的文本');
    expect(templateRow.payload.prompt).not.toBe('修改后的文本');
  });

  it.each([
    [templateRow, false, '模板已发布'],
    [policyRow, false, '下次代理请求'],
    [templateRow, true, '已撤回']
  ] as const)('publishes or withdraws only the selected content revision', async (row, withdraw, message) => {
    const { component, admin } = await rig();
    await component.publish(row, withdraw);
    expect(admin).toHaveBeenCalledWith(
      `content/${row.kind}/${row.key}/${withdraw ? 'withdraw' : 'publish'}`,
      'POST',
      expect.objectContaining({ revision: row.revision })
    );
    expect(component.message()).toContain(message);
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
