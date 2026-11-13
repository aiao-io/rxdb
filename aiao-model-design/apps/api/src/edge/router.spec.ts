import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeRequest, type EdgeEnvironment } from './router';

const upstream = vi.fn<typeof fetch>();
const assets = vi.fn<(request: Request) => Promise<Response>>();
const user = { id: 'user-1', email: 'designer@example.com' };
const session = { user, access_token: 'user-jwt', refresh_token: 'refresh-jwt', expires_in: 3600 };
const env: EdgeEnvironment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  TRIGGER_SECRET_KEY: 'tr_secret',
  TRIGGER_API_URL: 'https://trigger.example.com',
  ASSETS: { fetch: assets }
};
const chatId = 'md-user-1-session-1';
const request = (path: string, init?: RequestInit) => new Request(`https://designer.example${path}`, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
const run = (req: Request, config = env) => routeRequest(req, config);
const triggerCalls = () => upstream.mock.calls.filter(([url]) => String(url).startsWith('https://trigger.example.com'));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', upstream);
  assets.mockImplementation(async () => new Response('frontend'));
  upstream.mockImplementation(async input =>
    String(input).startsWith('https://trigger.example.com') ?
      Response.json({ publicAccessToken: 'session-pat' })
    : Response.json(user)
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('只暴露智能体会话签发和必要认证', () => {
  it('设计器和登录页交给静态资源', async () => {
    expect(await (await run(request('/model-designer/canvas'))).text()).toBe('frontend');
    expect(await (await run(request('/login.html'))).text()).toBe('frontend');
  });
  it('健康检查不请求上游', async () => {
    expect(await (await run(request('/health'))).json()).toEqual({ ok: true });
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    '/api/ai/model/generate',
    '/api/ai/model/chat',
    '/api/ai/chat',
    '/api/model-designer/sql/execute',
    '/api/model-designer/client-packages/publish',
    '/bff/missing'
  ])('已删除或无关的接口 %s 返回 404', async path => {
    expect((await run(post(path, {}, { cookie: 'access_token=user-jwt' }))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
  });
  it('配置接口只读，未配置时不可用', async () => {
    expect(await (await run(request('/api/agent/config'))).json()).toEqual({
      enabled: true,
      apiUrl: 'https://trigger.example.com',
      task: 'model-designer'
    });
    expect(await (await run(request('/api/agent/config'), { ...env, TRIGGER_SECRET_KEY: undefined })).json()).toEqual({
      enabled: false
    });
    const response = await run(post('/api/agent/config', {}));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
  it('只接受 POST 会话请求', async () => {
    const response = await run(request('/api/agent/session'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
  it('未登录不能签发会话', async () => {
    expect((await run(post('/api/agent/session', { chatId }))).status).toBe(401);
    expect(triggerCalls()).toHaveLength(0);
  });
  it('验证 cookie 后为本人的 chatId 签发会话令牌', async () => {
    const response = await run(post('/api/agent/session', { chatId }, { cookie: 'access_token=user-jwt' }));
    expect(await response.json()).toEqual({ publicAccessToken: 'session-pat' });
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer user-jwt');
    expect(JSON.parse(String(triggerCalls()[0][1]?.body))).toMatchObject({ externalId: chatId });
  });
  it('不为别人的 chatId 签发令牌', async () => {
    const response = await run(
      post('/api/agent/session', { chatId: 'md-user-2-x' }, { cookie: 'access_token=user-jwt' })
    );
    expect(response.status).toBe(403);
    expect(triggerCalls()).toHaveLength(0);
  });
  it('支持 Bearer，cookie 通道优先', async () => {
    await run(post('/api/agent/session', { chatId }, { authorization: 'Bearer bearer-token' }));
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer bearer-token');
    await run(
      post('/api/agent/session', { chatId }, { authorization: 'Bearer ignored', cookie: 'access_token=cookie-token' })
    );
    expect(new Headers(upstream.mock.calls[2][1]?.headers).get('authorization')).toBe('Bearer cookie-token');
  });
  it('无效 JWT 不能签发会话并清除 cookie', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await run(post('/api/agent/session', { chatId }, { cookie: 'access_token=invalid' }));
    expect(response.status).toBe(401);
    expect(triggerCalls()).toHaveLength(0);
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });
  it('跨站写入在认证和签发前拒绝', async () => {
    expect((await run(post('/api/agent/session', { chatId }, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await run(post('/api/agent/session', { chatId }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('同源写入通过', async () => {
    const response = await run(
      post('/api/agent/session', { chatId }, { origin: 'https://designer.example', cookie: 'access_token=user-jwt' })
    );
    expect(response.status).toBe(200);
  });
  it('实例故障不泄漏内部信息', async () => {
    upstream.mockImplementation(async input => {
      if (String(input).startsWith('https://trigger.example.com')) throw new Error('private-key-details');
      return Response.json(user);
    });
    const response = await run(post('/api/agent/session', { chatId }, { cookie: 'access_token=user-jwt' }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-key-details');
  });
  it('认证服务抛出运行时异常时返回通用错误', async () => {
    upstream.mockImplementation(() => {
      throw new TypeError('private-runtime-details');
    });
    const response = await run(post('/api/agent/session', { chatId }, { cookie: 'access_token=user-jwt' }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-runtime-details');
  });
});

describe('同源 Supabase 登录会话', () => {
  it('登录写入 HttpOnly Secure cookie，响应不含 JWT', async () => {
    upstream.mockResolvedValue(Response.json(session));
    const response = await run(post('/bff/auth/signin', { email: user.email, password: 'password' }));
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('Secure');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Max-Age=3600');
    expect(await response.text()).not.toContain('user-jwt');
    expect(String(upstream.mock.calls[0][0])).toBe('https://project.supabase.co/auth/v1/token?grant_type=password');
  });
  it('本地 HTTP cookie 不使用 Secure', async () => {
    upstream.mockResolvedValue(Response.json(session));
    const req = new Request('http://localhost:8788/bff/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'password' })
    });
    expect((await run(req)).headers.getSetCookie()[0]).not.toContain('Secure');
  });
  it('错误凭证返回 401', async () => {
    upstream.mockResolvedValue(Response.json({ msg: 'Invalid login credentials' }, { status: 400 }));
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'wrong' }))).status).toBe(401);
  });
  it.each([
    {},
    { email: user.email },
    { email: '', password: 'x' },
    { email: user.email, password: '' },
    { email: 1, password: 'x' }
  ])('拒绝无效登录参数 %j', async body => {
    expect((await run(post('/bff/auth/signin', body))).status).toBe(400);
  });
  it('拒绝损坏的登录 JSON', async () => {
    expect((await run(request('/bff/auth/signin', { method: 'POST', body: '{' }))).status).toBe(400);
  });
  it('缺少 Supabase 配置返回 503', async () => {
    expect(
      (
        await run(post('/bff/auth/signin', { email: user.email, password: 'password' }), {
          ...env,
          SUPABASE_URL: undefined
        })
      ).status
    ).toBe(503);
  });
  it('会话接口只返回用户', async () => {
    expect(
      await (await run(request('/bff/auth/session', { headers: { cookie: 'access_token=user-jwt' } }))).json()
    ).toEqual({ user });
  });
  it('缺失或损坏的 cookie 返回空会话', async () => {
    expect(await (await run(request('/bff/auth/session'))).json()).toEqual({ user: null });
    expect(
      await (
        await run(request('/bff/auth/session', { headers: { cookie: 'other=value; access_token=%invalid' } }))
      ).json()
    ).toEqual({ user: null });
  });
  it('刷新过期会话并写回新 cookie', async () => {
    upstream
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ...session, access_token: 'new-jwt' }));
    const response = await run(
      request('/bff/auth/session', { headers: { cookie: 'access_token=expired; refresh_token=refresh-jwt' } })
    );
    expect(await response.json()).toEqual({ user });
    expect(response.headers.getSetCookie()[0]).toContain('new-jwt');
    expect(String(upstream.mock.calls[1][0])).toContain('grant_type=refresh_token');
  });
  it('无效 refresh token 清除会话', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await run(request('/bff/auth/session', { headers: { cookie: 'refresh_token=expired' } }));
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });
  it('登出通知 Supabase 并清除 cookie', async () => {
    const response = await run(post('/bff/auth/signout', {}, { cookie: 'access_token=user-jwt' }));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().every(value => value.includes('Max-Age=0'))).toBe(true);
    expect(String(upstream.mock.calls[0][0])).toContain('/auth/v1/logout');
  });
  it('认证服务不可达仍能清除本地登录', async () => {
    upstream.mockRejectedValue(new Error('network'));
    expect((await run(post('/bff/auth/signout', {}, { cookie: 'access_token=user-jwt' }))).status).toBe(200);
  });
  it('匿名登出不请求上游', async () => {
    expect((await run(post('/bff/auth/signout', {}))).status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('未知认证路径或错误方法返回 404', async () => {
    expect((await run(request('/bff/auth/signin'))).status).toBe(404);
    expect((await run(request('/bff/auth/unknown'))).status).toBe(404);
  });
  it.each(['signin', 'session'])('认证服务故障返回 502: %s', async path => {
    upstream.mockResolvedValue(new Response(null, { status: 503 }));
    const req =
      path === 'signin' ?
        post('/bff/auth/signin', { email: user.email, password: 'x' })
      : request('/bff/auth/session', { headers: { cookie: 'access_token=jwt' } });
    expect((await run(req)).status).toBe(502);
  });
  it('网络失败返回 502', async () => {
    upstream.mockRejectedValue(new Error('connection refused'));
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'password' }))).status).toBe(502);
  });
  it('认证响应损坏返回 502', async () => {
    upstream.mockResolvedValue(Response.json({ unexpected: true }));
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'x' }))).status).toBe(502);
    upstream.mockResolvedValue(Response.json({ unexpected: true }));
    expect((await run(request('/bff/auth/session', { headers: { cookie: 'access_token=jwt' } }))).status).toBe(502);
  });
  it('刷新服务故障保留原会话，返回 502', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 503 }));
    const response = await run(request('/bff/auth/session', { headers: { cookie: 'refresh_token=jwt' } }));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
