import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { adminShell } from './admin-shell';
import { ADMIN_SESSION_STORAGE_KEY, App } from './app';
import { appRoutes } from './app.routes';

const initial = { initialized: false, managed: false, auth: null };
const ready = {
  ...initial,
  initialized: true,
  auth: { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' }
};
afterEach(() => {
  localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  vi.unstubAllGlobals();
  TestBed.resetTestingModule();
});

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(initial))
    );
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(appRoutes), provideAdminShell(adminShell)]
    }).compileComponents();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('后台管理');
  });

  it('首次访问显示初始化且不读取后台数据', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('首次初始化');
    expect(fixture.nativeElement.textContent).not.toContain('安装凭据');
    expect(fixture.nativeElement.querySelector('input[name="token"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="email"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-admin-console')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('自托管配置自动带入，初始化成功后清除秘密并进入登录', async () => {
    const request = vi.mocked(fetch);
    request.mockResolvedValueOnce(Response.json({ ...initial, managed: true }));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    const app = fixture.componentInstance;
    Object.assign(app.form, {
      email: 'owner@example.test',
      password: 'a-long-password',
      confirmation: 'a-long-password',
      bootstrapSecret: 'a'.repeat(32)
    });
    request.mockResolvedValueOnce(Response.json({ initialized: true })).mockResolvedValueOnce(Response.json(ready));
    await app.initialize();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('管理员登录');
    const options = request.mock.calls[1][1]!;
    expect(JSON.parse(String(options.body))).toEqual({
      email: 'owner@example.test',
      password: 'a-long-password',
      bootstrapSecret: 'a'.repeat(32)
    });
    expect(new Headers(options.headers).has('authorization')).toBe(false);
    expect(app.form.password + app.form.bootstrapSecret + app.form.serviceRoleKey).toBe('');
  });

  it('初始化失败显示错误，保留输入以便继续且不显示登录成功', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    Object.assign(fixture.componentInstance.form, { password: 'a-long-password', confirmation: 'a-long-password' });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: '连接失败' }, { status: 503 }));
    await fixture.componentInstance.initialize();
    expect(fixture.componentInstance.message()).toBe('连接失败');
    expect(fixture.componentInstance.installation()?.initialized).toBe(false);
    expect(fixture.componentInstance.form.password).toBe('a-long-password');
  });

  it('登录仅使用经服务端授权的会话，退出后无法继续调用后台', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(ready));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    const app = fixture.componentInstance;
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ accessToken: 'fixture-session', expiresAt: Date.now() + 60000, user: { id: 'owner' } })
    );
    await app.login();
    expect((await app.client.authorization()).session.access_token).toBe('fixture-session');
    app.logout();
    await expect(app.client.authorization()).rejects.toThrow('登录已过期');
    expect(app.session()).toBeNull();
    expect(localStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('登录后保存会话并切换到全屏后台外壳', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(ready));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    const session = { accessToken: 'fixture-session', expiresAt: Date.now() + 60000, user: { id: 'owner' } };
    vi.mocked(fetch).mockImplementation(async input =>
      String(input).endsWith('/api/admin/login') ? Response.json(session) : Response.json({ actorId: 'owner' })
    );
    await fixture.componentInstance.login();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(JSON.parse(localStorage.getItem(ADMIN_SESSION_STORAGE_KEY)!)).toEqual(session);
    expect(fixture.nativeElement.querySelector('.access-shell')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="admin-shell"]')).not.toBeNull();
  });

  it('刷新后恢复未过期的管理员会话', async () => {
    const session = { accessToken: 'stored-session', expiresAt: Date.now() + 60000, user: { id: 'owner' } };
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(ready));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    expect(fixture.componentInstance.session()).toEqual(session);
  });
});
