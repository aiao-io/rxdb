import { TestBed } from '@angular/core/testing';
import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { provideRouter } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { App } from './app';
import { appRoutes } from './app.routes';
import { adminShell } from './admin-shell';

const initial = { initialized: false, managed: false, auth: null };
const ready = {
  ...initial,
  initialized: true,
  auth: { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' }
};
afterEach(() => {
  sessionStorage.clear();
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
      confirmation: 'a-long-password'
    });
    request.mockResolvedValueOnce(Response.json({ initialized: true })).mockResolvedValueOnce(Response.json(ready));
    await app.initialize();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('管理员登录');
    const options = request.mock.calls[1][1]!;
    expect(JSON.parse(String(options.body))).toEqual({ email: 'owner@example.test', password: 'a-long-password' });
    expect(new Headers(options.headers).has('authorization')).toBe(false);
    expect(app.form.password + app.form.serviceRoleKey).toBe('');
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
    expect(JSON.parse(sessionStorage.getItem('aiao-media-admin-session-v1')!)).toMatchObject({
      accessToken: 'fixture-session'
    });
    app.logout();
    await expect(app.client.authorization()).rejects.toThrow('登录已过期');
    expect(app.session()).toBeNull();
    expect(sessionStorage.getItem('aiao-media-admin-session-v1')).toBeNull();
  });

  it('刷新后恢复当前标签页的管理员会话', async () => {
    const saved = { accessToken: 'stored-session', expiresAt: Date.now() + 60000, user: { id: 'owner' } };
    sessionStorage.setItem('aiao-media-admin-session-v1', JSON.stringify(saved));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(ready));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.installation()).not.toBeNull());
    expect(fixture.componentInstance.session()).toEqual(saved);
  });
});
