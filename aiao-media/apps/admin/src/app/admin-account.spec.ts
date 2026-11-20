import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAccount } from './admin-account';
import { AdminAccountState } from './admin-account-state';
import { ProductClient } from './product-client';

const profile = {
  userId: 'owner',
  displayName: '旧名称',
  revision: 1,
  updatedAt: '2026-11-15T00:00:00Z',
  adminEnabled: true,
  accessDisabled: false
};
afterEach(() => TestBed.resetTestingModule());

describe('管理员账户详情', () => {
  it('只允许修改自己的名称，服务端确认后同步资料状态', async () => {
    await TestBed.configureTestingModule({ imports: [AdminAccount] }).compileComponents();
    const client = new ProductClient(async () => {
      throw new Error('unexpected authorization');
    });
    vi.spyOn(client, 'adminProfile').mockResolvedValue(profile);
    vi.spyOn(client, 'saveAdminProfile').mockResolvedValue({ ...profile, displayName: '新名称', revision: 2 });
    vi.spyOn(client, 'adminAccountIdentity').mockResolvedValue({
      userId: 'owner',
      email: 'owner@example.test',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: null
    });
    const state = new AdminAccountState(client);
    await state.connect('owner');
    const fixture = TestBed.createComponent(AdminAccount);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('client', client);
    fixture.componentRef.setInput('user', { id: 'owner', email: 'owner@example.test' });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('owner@example.test');
    expect(root.textContent).toContain('已启用');
    expect(root.querySelectorAll('input')).toHaveLength(1);
    const input = root.querySelector('input')!;
    input.value = '新名称';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(state.profile()?.displayName).toBe('新名称');
    expect(root.textContent).toContain('名称已保存');
  });

  it('只读身份信息失败可重试，销毁后的回执不会恢复过期资料', async () => {
    await TestBed.configureTestingModule({ imports: [AdminAccount] }).compileComponents();
    const client = new ProductClient(async () => {
      throw new Error('unexpected authorization');
    });
    vi.spyOn(client, 'adminProfile').mockResolvedValue(profile);
    const read = vi.spyOn(client, 'adminAccountIdentity').mockRejectedValueOnce(new Error('network'));
    const state = new AdminAccountState(client);
    await state.connect('owner');
    const fixture = TestBed.createComponent(AdminAccount);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('client', client);
    fixture.componentRef.setInput('user', { id: 'owner', email: 'owner@example.test' });
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.identityError()).toContain('账号信息暂时无法读取'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('账号信息暂时无法读取');
    read.mockResolvedValueOnce({
      userId: 'owner',
      email: 'owner@example.test',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: null
    });
    await fixture.componentInstance.retryIdentity();
    await fixture.whenStable();
    expect(root.textContent).not.toContain('账号信息暂时无法读取');
    let resolveRead!: (value: Awaited<ReturnType<ProductClient['adminAccountIdentity']>>) => void;
    read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRead = resolve;
        })
    );
    const pending = fixture.componentInstance.retryIdentity();
    fixture.destroy();
    resolveRead({
      userId: 'owner',
      email: 'stale@example.test',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: null
    });
    await pending;
    expect(fixture.componentInstance.identity()).toBeNull();
  });
});
