import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
import { AuthSession, authSession } from './session.js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const sessions: AuthSession[] = [];
function browserStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key)
  };
}
const hour = 3_600_000;
/** Supabase 认证客户端的替身：本机会话是 `user` 的，`getUser` 按 `confirmed` 决定邮箱是否已验证。 */
function authClient(user = 'alice', confirmed = true) {
  let listener: (event: string, session: Session | null) => void = () => undefined;
  const session = {
    access_token: `access-${user}`,
    expires_at: Math.floor((Date.now() + hour) / 1000),
    user: { id: user, email: `${user}@example.test` }
  } as unknown as Session;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({
      data: { user: { id: user, email: `${user}@example.test`, email_confirmed_at: confirmed ? 'now' : null } },
      error: null
    })),
    signInWithOtp: vi.fn(async () => ({ error: null as unknown })),
    verifyOtp: vi.fn(async () => ({ data: { session }, error: null as unknown })),
    refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn((callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    })
  };
  vi.mocked(createClient).mockReturnValue({ auth } as unknown as ReturnType<typeof createClient>);
  return { auth, session, emit: (event: string, value: Session | null) => listener(event, value) };
}
function create(
  base = '/test',
  config = vi.fn(async () => ({ supabaseUrl: 'http://auth.test', supabaseKey: 'public' }))
) {
  const session = new AuthSession(base, config);
  sessions.push(session);
  const events: string[] = [];
  session.addEventListener('identity', () => events.push(session.user?.id ?? 'none'));
  return { session, config, events };
}
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', browserStorage());
});
afterEach(() => {
  sessions.splice(0).forEach(session => session.dispose());
  vi.unstubAllGlobals();
  vi.mocked(createClient).mockReset();
});

describe('全局登录会话', () => {
  it('初始化读取公开配置、建立认证客户端，本机会话经 getUser 确认后写下缓存授权；重复初始化只做一次', async () => {
    const { auth } = authClient();
    const { session, config, events } = create();
    await Promise.all([session.initialize(), session.initialize()]);
    expect(config).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createClient).mock.calls[0]).toEqual([
      'http://auth.test',
      'public',
      {
        auth: {
          storageKey: 'admin-collaboration-auth:http://auth.test',
          detectSessionInUrl: false,
          autoRefreshToken: true
        }
      }
    ]);
    expect(auth.getUser).toHaveBeenCalledWith('access-alice');
    expect(session.user).toEqual({ id: 'alice', email: 'alice@example.test', verified: true });
    expect(session.online).toBe(true);
    expect(JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!).user.id).toBe('alice');
    expect(events).toEqual(['alice']);
  });
  it('读不到公开配置时初始化失败，下一次调用会重新尝试', async () => {
    authClient();
    const config = vi
      .fn()
      .mockRejectedValueOnce(new CollaborationError('unavailable', '服务暂时不可用，请稍后按原请求重试'))
      .mockResolvedValue({ supabaseUrl: 'http://auth.test', supabaseKey: 'public' });
    const { session } = create('/test', config);
    await expect(session.initialize()).rejects.toMatchObject({ code: 'unavailable' });
    await session.initialize();
    expect(session.user?.id).toBe('alice');
  });
  it('邮箱没有验证的账号不算登录：初始化抛出 unauthenticated，身份为空', async () => {
    authClient('alice', false);
    const { session } = create();
    await expect(session.initialize()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(session.user).toBeNull();
    expect(localStorage.getItem('admin-collaboration-grant:/test')).toBeNull();
  });
  it('发送验证码后给出提示；验证码登录成功后清掉提示；GoTrue 的错误换成产品词条', async () => {
    const { auth } = authClient();
    const { session } = create();
    await session.initialize();
    await session.sendCode('alice@example.test');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'alice@example.test',
      options: { shouldCreateUser: true }
    });
    expect([session.message, session.messageTone]).toEqual(['验证码已发送，请检查邮箱', 'success']);
    await session.verify('alice@example.test', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'alice@example.test', token: '123456', type: 'email' });
    expect(session.message).toBe('');
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null as unknown as Session },
      error: Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired', status: 403 })
    });
    await expect(session.verify('alice@example.test', '000000')).rejects.toMatchObject({
      code: 'invalid',
      message: '验证码已过期或无效，请重新获取'
    });
  });
  it('退出：先跑登记过的检查（被拒绝时保持登录），再清除身份与缓存授权、清除本机会话', async () => {
    const { auth } = authClient();
    const { session, events } = create();
    await session.initialize();
    const unguard = session.guardLogout(() => {
      throw new CollaborationError('unsaved', '先在编辑界面里保存或取消未保存的输入');
    });
    await expect(session.logout()).rejects.toMatchObject({ code: 'unsaved' });
    expect(session.user?.id).toBe('alice');
    unguard();
    await session.logout();
    expect(session.user).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem('admin-collaboration-grant:/test')).toBeNull();
    expect(events).toEqual(['alice', 'none']);
  });
  it('同一浏览器的另一个页面退出同一账号时，本页随之退出', async () => {
    authClient();
    const { session } = create();
    await session.initialize();
    const other = create().session;
    await other.initialize();
    await other.logout();
    await vi.waitFor(() => expect(session.user).toBeNull());
  });
  it('离线冷启动只信任未过期的缓存授权，不访问 Auth；过期即保持未登录', async () => {
    const { auth } = authClient();
    await create().session.initialize();
    vi.stubGlobal('navigator', { onLine: false });
    const cold = create();
    await cold.session.initialize();
    expect(cold.session.user?.id).toBe('alice');
    expect(cold.session.online).toBe(false);
    expect(cold.config).not.toHaveBeenCalled();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    const grant = JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!);
    localStorage.setItem('admin-collaboration-grant:/test', JSON.stringify({ ...grant, expiresAt: 1 }));
    const expired = create();
    await expired.session.initialize();
    expect(expired.session.user).toBeNull();
  });
  it('离线时 supabase-js 恢复出本机会话（SIGNED_IN）也绕不过缓存授权：授权过期仍未登录，有效时到期时间以授权为准', async () => {
    const { session: stored, emit } = authClient();
    await create().session.initialize();
    vi.stubGlobal('navigator', { onLine: false });
    const key = 'admin-collaboration-grant:/test';
    const grant = JSON.parse(localStorage.getItem(key)!) as { expiresAt: number };
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    localStorage.setItem(key, JSON.stringify({ ...grant, expiresAt: 1 }));
    const expired = create();
    await expired.session.initialize();
    emit('SIGNED_IN', stored);
    await settle();
    expect(expired.session.user).toBeNull();
    expect(expired.events).toEqual([]);
    localStorage.setItem(key, JSON.stringify(grant));
    const valid = create();
    await valid.session.initialize();
    emit('SIGNED_IN', { ...stored, expires_at: Math.floor((Date.now() + 5 * hour) / 1000) } as Session);
    await settle();
    expect(valid.session.user?.id).toBe('alice');
    expect(valid.session.expiresAt).toBe(grant.expiresAt);
  });
  it('首次使用（没有缓存的公开配置）离线时拒绝', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(create().session.initialize()).rejects.toMatchObject({ code: 'offline' });
  });
  it('离线时会话自然过期（SIGNED_OUT）保留已确认的身份，在线时随之退出', async () => {
    const { emit } = authClient();
    const { session } = create();
    await session.initialize();
    vi.stubGlobal('navigator', { onLine: false });
    emit('SIGNED_OUT', null);
    expect(session.user?.id).toBe('alice');
    vi.stubGlobal('navigator', { onLine: true });
    emit('SIGNED_OUT', null);
    expect(session.user).toBeNull();
  });
  it('联网后刷新会话并重新确认身份', async () => {
    const { auth } = authClient();
    const { session } = create();
    await session.initialize();
    await session.reconnect();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    expect(session.online).toBe(true);
  });
  it('应用共用一个会话：同一接口前缀拿到同一个实例', () => {
    expect(authSession('/shared-test')).toBe(authSession('/shared-test'));
    expect(authSession('/shared-test')).not.toBe(authSession('/another-test'));
    authSession('/shared-test').dispose();
    authSession('/another-test').dispose();
  });
});

describe('本机库的身份（ADMIN-US-222）', () => {
  it('确认身份之后：后端是 Supabase 项目 URL 的 origin，主体是账号 id；退出之后没有身份', async () => {
    authClient('bob');
    const { session } = create();
    await session.initialize();
    expect(session.databaseIdentity()).toEqual({ scope: 'http://auth.test', subject: 'bob' });
    session.signOut();
    expect(session.databaseIdentity()).toBeNull();
  });
  it('初始化之前取本机记下的最近一次确认的身份与公开配置：应用在首屏之前就能按身份建库，不访问网络', async () => {
    authClient('alice');
    await create().session.initialize();
    const fresh = create();
    expect(fresh.session.databaseIdentity()).toEqual({ scope: 'http://auth.test', subject: 'alice' });
    expect(fresh.config).not.toHaveBeenCalled();
  });
  it('从没登录过（本机没有记下的身份或配置）时没有身份', () => {
    expect(create().session.databaseIdentity()).toBeNull();
  });
  it('后端标识与 rxdb-adapter-supabase 的 callerIdentity() 同一口径：只取 URL 的 origin，路径与尾斜杠不算', async () => {
    authClient('alice');
    const config = vi.fn(async () => ({ supabaseUrl: 'https://project.supabase.co/rest/v1/', supabaseKey: 'public' }));
    const { session } = create('/test', config);
    await session.initialize();
    expect(session.databaseIdentity()?.scope).toBe('https://project.supabase.co');
  });
  it('初始化确认出另一个账号时，按确认出的账号给出', async () => {
    authClient('alice');
    await create().session.initialize();
    authClient('carol');
    const next = create();
    await next.session.initialize();
    expect(next.session.databaseIdentity()?.subject).toBe('carol');
  });
  it('按用户取库身份：会话就是这个用户时给出；会话换了人或已退出时按会话失效拒绝，不替别人打开库', async () => {
    authClient('bob');
    const { session } = create();
    await session.initialize();
    expect(session.databaseIdentityFor('bob')).toEqual({ scope: 'http://auth.test', subject: 'bob' });
    expect(() => session.databaseIdentityFor('alice')).toThrow(
      expect.objectContaining({ code: 'unauthenticated', message: '会话已失效，请重新登录' })
    );
    session.signOut();
    expect(() => session.databaseIdentityFor('bob')).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });
});
