import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccess } from '../admin/admin-access';
import { AuthService } from '../auth/auth.service';
import { P2PWorkspace, type DemoFaults, type WorkspacePhase } from '../p2p/p2p-workspace.service';
import WorkspacePage from './workspace.page';

const findButton = (root: HTMLElement, text: string): HTMLButtonElement => {
  const button = [...root.querySelectorAll('button')].find(element => element.textContent?.trim() === text);
  if (!button) throw new Error(`找不到按钮：${text}`);
  return button;
};

describe('WorkspacePage', () => {
  const faults = signal<DemoFaults>({ deny: false, corrupt: false, delayMs: 0 });
  const workspace = {
    phase: signal<WorkspacePhase>('ready'),
    device: signal({ id: 'device', name: '我的电脑' }),
    signalingState: signal('online'),
    sync: signal({ phase: 'idle', error: null as string | null }),
    startError: signal<string | null>(null),
    faults,
    start: vi.fn(async () => undefined),
    setFaults: vi.fn((patch: Partial<DemoFaults>) => faults.update(current => ({ ...current, ...patch })))
  };
  const auth = {
    session: signal({ user: { email: 'person@example.com' } }),
    signOut: vi.fn(async () => undefined)
  };
  const admin = { isAdmin: signal(false), check: vi.fn<() => Promise<boolean>>() };
  let fixture: ComponentFixture<WorkspacePage>;
  let root: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace.start.mockReset().mockResolvedValue(undefined);
    auth.signOut.mockReset().mockResolvedValue(undefined);
    admin.isAdmin.set(false);
    admin.check.mockReset().mockResolvedValue(false);
    workspace.phase.set('ready');
    workspace.startError.set(null);
    workspace.signalingState.set('online');
    workspace.sync.set({ phase: 'idle', error: null });
    faults.set({ deny: false, corrupt: false, delayMs: 0 });
    TestBed.configureTestingModule({
      imports: [WorkspacePage],
      providers: [
        provideRouter([]),
        { provide: P2PWorkspace, useValue: workspace },
        { provide: AuthService, useValue: auth },
        { provide: AdminAccess, useValue: admin }
      ]
    });
    fixture = TestBed.createComponent(WorkspacePage);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the startup failure reason and lets the user reload', async () => {
    workspace.phase.set('failed');
    workspace.startError.set('无法打开本地文件库');
    workspace.start.mockRejectedValueOnce(new Error('无法打开本地文件库'));
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('无法打开本地文件库');
    findButton(root, '重新加载').click();
    expect(reload).toHaveBeenCalledOnce();
    expect(workspace.start).toHaveBeenCalledOnce();
  });

  it('keeps fault simulation visible across pages and restores every option with one action', () => {
    faults.set({ deny: true, corrupt: true, delayMs: 200 });
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="fault-warning"]')?.textContent).toContain('故障模拟已开启');
    findButton(root, '恢复正常共享').click();
    fixture.detectChanges();

    expect(workspace.setFaults).toHaveBeenCalledExactlyOnceWith({ deny: false, corrupt: false, delayMs: 0 });
    expect(faults()).toEqual({ deny: false, corrupt: false, delayMs: 0 });
    expect(root.querySelector('[data-testid="fault-warning"]')).toBeNull();
  });

  it('shows sign-out errors and enables the button for a retry', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('退出失败，请重试'));
    fixture.detectChanges();

    findButton(root, '退出').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('退出失败，请重试');
    expect(findButton(root, '退出').disabled).toBe(false);
    findButton(root, '退出').click();
    await fixture.whenStable();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });

  it('handles a rejected startup promise while the service publishes its state', async () => {
    workspace.phase.set('starting');
    workspace.start.mockRejectedValueOnce(new Error('network unavailable'));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(workspace.start).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('正在准备你的设备和共享文件');
    expect(root.querySelector('router-outlet')).toBeNull();
  });

  it('shows the administration entry only to a confirmed administrator', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(admin.check).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-testid="admin-entry"]')).toBeNull();

    admin.isAdmin.set(true);
    fixture.detectChanges();

    const entry = root.querySelector('[data-testid="admin-entry"]');
    expect(entry?.getAttribute('href')).toBe('/admin');
    expect(entry?.textContent).toContain('管理后台');
  });

  it('keeps the entry hidden and the workspace working when the administrator check fails', async () => {
    admin.check.mockRejectedValueOnce(new Error('管理接口返回 HTTP 502'));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="admin-entry"]')).toBeNull();
    expect(workspace.start).toHaveBeenCalledOnce();
    expect(root.querySelector('router-outlet')).not.toBeNull();
  });

  it('explains synchronization failures without hiding file navigation', () => {
    workspace.sync.set({ phase: 'error', error: '远端暂时不可达' });
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('文件列表同步失败');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('远端暂时不可达');
    expect(root.querySelector('[data-testid="manage-entry"]')?.getAttribute('href')).toBe('/manage');
    expect(root.querySelector('router-outlet')).not.toBeNull();
  });
});
