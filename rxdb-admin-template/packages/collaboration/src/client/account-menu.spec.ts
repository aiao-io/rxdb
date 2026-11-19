import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError, type Identity } from '../model.js';
import { mountAccount } from './account-menu.js';
import type { AuthSession } from './session.js';

let window: Window;
beforeEach(() => {
  window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
  vi.stubGlobal('Node', window.Node);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
class FakeSession extends EventTarget {
  user: Identity | null = { id: 'alice', email: 'alice@example.test', verified: true };
  online = true;
  logout = vi.fn(async () => {
    this.user = null;
    this.dispatchEvent(new Event('change'));
  });
}
function setup(fake = new FakeSession()) {
  const host = document.createElement('span');
  document.body.append(host);
  const navigate = vi.fn();
  const dispose = mountAccount(host, {
    session: fake as unknown as AuthSession,
    navigate,
    currentUrl: () => '/dashboard?tab=1#top'
  });
  const details = () => host.querySelector<HTMLDetailsElement>('details[data-testid="account-menu"]');
  const item = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
  return { host, fake, navigate, dispose, details, item };
}

describe('顶栏账号菜单', () => {
  it('未登录时是「登录」：带着当前地址去登录页', () => {
    const fake = new FakeSession();
    fake.user = null;
    const { item, navigate, details } = setup(fake);
    expect(details()).toBeNull();
    item('登录').click();
    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fdashboard%3Ftab%3D1%23top');
  });
  it('登录后是头像 + 邮箱，展开后有账号信息、团队协作入口与退出账号', () => {
    const { details, item, navigate } = setup();
    const summary = details()!.querySelector('summary')!;
    expect(summary.getAttribute('aria-label')).toBeNull();
    expect(summary.textContent).toBe('账号：Aalice@example.test');
    expect(summary.querySelector('.avatar, [aria-hidden="true"]')?.textContent).toBe('A');
    expect(details()!.textContent).toContain('已登录');
    details()!.open = true;
    item('团队协作').click();
    expect(details()!.open).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/collaboration');
  });
  it('离线时说明正在使用上次验证过的身份', () => {
    const fake = new FakeSession();
    fake.online = false;
    expect(setup(fake).details()!.textContent).toContain('离线 · 使用上次验证过的身份');
  });
  it('退出账号经全局会话；被拒绝（例如还有没保存的输入）时原因显示在菜单里', async () => {
    const fake = new FakeSession();
    fake.logout.mockRejectedValueOnce(new CollaborationError('unsaved', '先在编辑界面里保存或取消未保存的输入'));
    const { details, item, host } = setup(fake);
    details()!.open = true;
    item('退出账号').click();
    await vi.waitFor(() => expect(host.textContent).toContain('先在编辑界面里保存或取消未保存的输入'));
    expect(details()!.open).toBe(true);
    item('退出账号').click();
    await vi.waitFor(() => expect(details()).toBeNull());
    expect(item('登录')).toBeDefined();
  });
  it('点在菜单外或按 Esc 收起', () => {
    const { details, host } = setup();
    details()!.open = true;
    document.body.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
    expect(details()!.open).toBe(false);
    details()!.open = true;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details()!.open).toBe(false);
  });
});
