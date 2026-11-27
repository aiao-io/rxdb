import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { Toasts } from '../toasts';
import { CatalogMembersPanel } from './catalog-members-panel';
import type { CallerGrant, TenantMember } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

const remote = vi.hoisted(() => ({
  fetchTenantMembers: vi.fn(),
  setMemberPermissions: vi.fn()
}));

vi.mock('./catalog-remote', () => remote);

const client = {};
const TENANTS = [
  { id: 'jiguang', name: '极光百货' },
  { id: 'xinghe', name: '星河零售' }
];

/** Bob：极光百货的管理员，在星河零售当员工 */
const BOB_GRANTS: CallerGrant[] = [
  { scope: 'tenant:jiguang', permissions: ['read', 'edit', 'manage'] },
  { scope: 'tenant:xinghe', permissions: ['read'] },
  { scope: 'user:u-bob', permissions: ['read', 'edit'] }
];

const MEMBERS: TenantMember[] = [
  { userId: 'u-bob-0000-4000', email: 'bob@example.com', permissions: ['read', 'edit', 'manage'] },
  { userId: 'u-anon-1111-4000', email: null, permissions: ['read'] }
];

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

async function renderPanel(grants: CallerGrant[] = BOB_GRANTS) {
  const managed = signal(['jiguang']);
  const refresh = vi.fn(async () => managed.set([...managed()]));
  TestBed.configureTestingModule({
    imports: [CatalogMembersPanel],
    providers: [
      {
        provide: DemoSession,
        useValue: { signedIn: true, prepared: { client, identity: { subject: 'u-bob-0000-4000' } } }
      },
      {
        provide: CatalogRemoteState,
        useValue: {
          $grants: signal(grants),
          $managedTenantIds: managed,
          tenantName: (tenantId: string) => TENANTS.find(tenant => tenant.id === tenantId)?.name ?? tenantId,
          refresh
        }
      }
    ]
  });
  const fixture = TestBed.createComponent(CatalogMembersPanel);
  await settle(fixture);

  const root = fixture.nativeElement as HTMLElement;
  const tenant = (id: string) =>
    root.querySelector<HTMLElement>(`[data-testid="tenant-members"][data-tenant-id="${id}"]`)!;
  const member = (userId: string) =>
    root.querySelector<HTMLElement>(`[data-testid="tenant-member"][data-user-id="${userId}"]`)!;
  const button = (scope: ParentNode, name: string) =>
    [...scope.querySelectorAll('button')].find(element => element.textContent?.trim() === name) ?? null;
  const click = async (target: HTMLElement | null) => {
    target!.click();
    await settle(fixture);
  };
  return { fixture, root, tenant, member, button, click, refresh };
}

describe('CatalogMembersPanel：成员与权限（US-234）', () => {
  beforeEach(() => {
    for (const fn of Object.values(remote)) fn.mockReset();
    remote.fetchTenantMembers.mockResolvedValue(MEMBERS);
    remote.setMemberPermissions.mockResolvedValue(undefined);
  });

  it('管理员的租户列出全部成员：邮箱或「匿名用户」，标出自己，每人一个「管理员 / 员工」切换', async () => {
    const { tenant, member, button } = await renderPanel();

    expect(remote.fetchTenantMembers).toHaveBeenCalledWith(client, 'jiguang');
    expect(remote.fetchTenantMembers).not.toHaveBeenCalledWith(client, 'xinghe');
    expect(tenant('jiguang').textContent).toContain('极光百货 · 管理员');
    expect(member('u-bob-0000-4000').textContent).toContain('bob@example.com · u-bob-00（你）');
    expect(member('u-anon-1111-4000').textContent).toContain('匿名用户 · u-anon-1');
    expect(button(member('u-anon-1111-4000'), '员工')?.getAttribute('aria-pressed')).toBe('true');
    expect(button(member('u-anon-1111-4000'), '管理员')?.getAttribute('aria-pressed')).toBe('false');
  });

  // AC#14：X 的「成员与权限」里没有改权限的按钮
  it('员工的租户只显示自己的角色，没有改权限的按钮，也不去读成员列表', async () => {
    const { tenant, button } = await renderPanel();

    expect(tenant('xinghe').textContent).toContain('星河零售 · 员工');
    expect(tenant('xinghe').querySelector('[data-testid="tenant-member"]')).toBeNull();
    expect(button(tenant('xinghe'), '管理员')).toBeNull();
  });

  it('把员工设为管理员：经服务端改权限，重读授权与成员列表，弹一条消息', async () => {
    const { member, button, click, refresh } = await renderPanel();

    await click(button(member('u-anon-1111-4000'), '管理员'));

    expect(remote.setMemberPermissions).toHaveBeenCalledWith(client, 'jiguang', 'u-anon-1111-4000', [
      'read',
      'edit',
      'manage'
    ]);
    expect(refresh).toHaveBeenCalled();
    expect(remote.fetchTenantMembers).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(Toasts).list()).toEqual([
      expect.objectContaining({
        kind: 'success',
        message: expect.stringContaining('匿名用户 · u-anon-1 在极光百货改为管理员')
      })
    ]);
  });

  it('点当前的角色什么都不做', async () => {
    const { member, button, click } = await renderPanel();

    await click(button(member('u-anon-1111-4000'), '员工'));

    expect(remote.setMemberPermissions).not.toHaveBeenCalled();
  });

  // AC#8：最后一个管理员撤不掉自己的 manage，服务端拒绝的原因原样显示
  it('服务端拒绝（最后一个管理员）：原因显示在面板里，不弹成功消息', async () => {
    remote.setMemberPermissions.mockRejectedValue(new Error('不能撤掉最后一个管理员：租户 jiguang 至少要留一个管理员'));
    const { root, member, button, click } = await renderPanel();

    await click(button(member('u-bob-0000-4000'), '员工'));

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('不能撤掉最后一个管理员');
    expect(TestBed.inject(Toasts).list()).toEqual([]);
  });

  it('不在任何租户里：只有一句说明', async () => {
    const { root } = await renderPanel([]);

    expect(root.querySelector('[data-testid="tenant-members"]')).toBeNull();
    expect(root.textContent).toContain('还不在任何租户里');
  });
});
