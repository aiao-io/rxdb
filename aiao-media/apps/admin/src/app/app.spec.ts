import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { App } from './app';

const initial = { initialized: false, available: true, managed: false, auth: null };
const ready = {
  ...initial,
  initialized: true,
  auth: { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' }
};
afterEach(() => {
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
      imports: [App]
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
      token: 'private-setup-token',
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
    expect(options.headers).toMatchObject({ authorization: 'Bearer private-setup-token' });
    expect(app.form.password + app.form.token + app.form.serviceRoleKey).toBe('');
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
  });
});
