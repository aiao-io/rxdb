import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeRequest, type EdgeEnvironment } from './router';

const api = vi.fn<(request: Request) => Promise<Response>>();
const upstream = vi.fn<typeof fetch>();
const assets = vi.fn<(request: Request) => Promise<Response>>();
const user = { id: 'user-1', email: 'designer@example.com' };
const session = { user, access_token: 'user-jwt', refresh_token: 'refresh-jwt', expires_in: 3600 };
const env: EdgeEnvironment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  MODEL_DESIGNER_BACKEND_TOKEN: 'internal-only-token',
  ASSETS: { fetch: assets }
};
const request = (path: string, init?: RequestInit) => new Request(`https://designer.example${path}`, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const run = (req: Request, config = env) => routeRequest(req, config, api);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', upstream);
  api.mockResolvedValue(Response.json({ ok: true }));
  assets.mockResolvedValue(new Response('frontend'));
  upstream.mockResolvedValue(Response.json(user));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Cloudflare 路由和代理', () => {
  it('前端路由交给静态资源绑定', async () => {
    expect(await (await run(request('/model-designer/canvas'))).text()).toBe('frontend');
    expect(api).not.toHaveBeenCalled();
  });
  it('健康检查和 OpenAI 兼容入口保留原路径', async () => {
    await run(request('/health'));
    await run(request('/v1/models', { headers: { authorization: 'Bearer jwt' } }));
    expect(api.mock.calls.map(([req]) => new URL(req.url).pathname)).toEqual(['/health', '/v1/models']);
    expect(api.mock.calls[1][0].headers.get('authorization')).toBe('Bearer jwt');
  });
  it('不存在的 BFF 返回 404', async () => {
    expect((await run(request('/bff/missing'))).status).toBe(404);
    expect(assets).not.toHaveBeenCalled();
  });
  it('未登录不能调用 SQL 或私有 npm 发布', async () => {
    expect((await run(request('/bff/model-designer/sql/remote-schema'))).status).toBe(401);
    expect((await run(post('/api/model-designer/client-packages/publish', {}))).status).toBe(401);
    expect(api).not.toHaveBeenCalled();
  });
  it('签名无效或过期的会话不能换取内部 token', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await run(request('/bff/model-designer/sql/remote-schema', { headers: { cookie: 'access_token=invalid' } }))).status).toBe(401);
    expect(api).not.toHaveBeenCalled();
  });
  it('SQL BFF 验证用户后改写路径并注入内部 bearer', async () => {
    const body = { sql: 'CREATE TABLE example (id uuid);', confirmDestructive: false };
    const response = await run(post('/bff/model-designer/sql/dry-run', body, { cookie: 'access_token=user-jwt' }));
    expect(response.status).toBe(200);
    const forwarded = api.mock.calls[0][0];
    expect(new URL(forwarded.url).pathname).toBe('/api/model-designer/sql/dry-run');
    expect(forwarded.headers.get('authorization')).toBe('Bearer internal-only-token');
    expect(await forwarded.json()).toEqual(body);
    expect(response.headers.get('authorization')).toBeNull();
  });
  it('直接访问 SQL 和客户端包接口同样需要会话', async () => {
    await run(post('/api/model-designer/client-packages/archive', {}, { authorization: 'Bearer user-jwt' }));
    expect(api.mock.calls[0][0].headers.get('authorization')).toBe('Bearer internal-only-token');
  });
  it('缺少内部 token 返回 503', async () => {
    expect((await run(request('/bff/model-designer/sql/remote-schema', { headers: { cookie: 'access_token=user-jwt' } }), { ...env, MODEL_DESIGNER_BACKEND_TOKEN: undefined })).status).toBe(503);
    expect(api).not.toHaveBeenCalled();
  });
  it('跨站写入在调用上游前拒绝', async () => {
    expect((await run(post('/bff/model-designer/sql/execute', {}, { origin: 'https://evil.example', cookie: 'access_token=user-jwt' }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });
  it('代理保留流、状态码及 npm 下载头', async () => {
    api.mockResolvedValue(new Response('stream-data', { status: 201, headers: { 'content-type': 'text/event-stream', 'x-design-revision': 'revision' } }));
    const result = await run(request('/v1/messages'));
    expect(result.status).toBe(201);
    expect(result.headers.get('x-design-revision')).toBe('revision');
    expect(await result.text()).toBe('stream-data');
  });
  it('容器不可达时返回 502', async () => {
    api.mockRejectedValue(new Error('private-runtime-details'));
    const response = await run(request('/health'));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-runtime-details');
  });
  it('移除客户端伪造的容器目标端口', async () => {
    await run(request('/health', { headers: { 'cf-container-target-port': '9999' } }));
    expect(api.mock.calls[0][0].headers.has('cf-container-target-port')).toBe(false);
  });
});

describe('同源 Supabase 登录会话', () => {
  it('登录写入 HttpOnly Secure cookie，响应不含 token', async () => {
    upstream.mockResolvedValue(Response.json(session));
    const response = await run(post('/bff/auth/signin', { email: user.email, password: 'password' }, { origin: 'https://designer.example' }));
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
  it('本地 HTTP 登录不写 Secure', async () => {
    upstream.mockResolvedValue(Response.json(session));
    const response = await run(new Request('http://localhost:8788/bff/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'password' }) }));
    expect(response.headers.getSetCookie()[0]).not.toContain('Secure');
  });
  it('拒绝跨站登录', async () => {
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'password' }, { origin: 'https://evil.example' }))).status).toBe(403);
  });
  it('错误凭证返回 401', async () => {
    upstream.mockResolvedValue(Response.json({ msg: 'Invalid login credentials' }, { status: 400 }));
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'wrong' }))).status).toBe(401);
  });
  it('拒绝缺失或格式错误的登录参数', async () => {
    expect((await run(post('/bff/auth/signin', { email: user.email }))).status).toBe(400);
    expect((await run(request('/bff/auth/signin', { method: 'POST', body: '{' }))).status).toBe(400);
  });
  it('未配置 Supabase 返回 503', async () => {
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'password' }), { ...env, SUPABASE_URL: undefined })).status).toBe(503);
  });
  it('会话接口返回用户，响应不暴露 JWT', async () => {
    const response = await run(request('/bff/auth/session', { headers: { cookie: 'access_token=user-jwt' } }));
    expect(await response.json()).toEqual({ user });
  });
  it('未登录返回空会话，损坏的 cookie 不触发 500', async () => {
    expect(await (await run(request('/bff/auth/session'))).json()).toEqual({ user: null });
    expect(await (await run(request('/bff/auth/session', { headers: { cookie: 'access_token=%invalid' } }))).json()).toEqual({ user: null });
  });
  it('过期 access token 使用 refresh token 换新 cookie', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(Response.json({ ...session, access_token: 'new-user-jwt' }));
    const response = await run(request('/bff/auth/session', { headers: { cookie: 'access_token=expired; refresh_token=refresh-jwt' } }));
    expect(await response.json()).toEqual({ user });
    expect(response.headers.getSetCookie()[0]).toContain('new-user-jwt');
    expect(String(upstream.mock.calls[1][0])).toContain('grant_type=refresh_token');
  });
  it('刷新失败清除会话', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await run(request('/bff/auth/session', { headers: { cookie: 'refresh_token=expired' } }));
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });
  it('登出通知 Supabase 并清除本地 cookie', async () => {
    const response = await run(post('/bff/auth/signout', {}, { cookie: 'access_token=user-jwt; refresh_token=refresh-jwt' }));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0'))).toBe(true);
    expect(String(upstream.mock.calls[0][0])).toContain('/auth/v1/logout');
  });
  it('Supabase 不可达返回 502', async () => {
    upstream.mockRejectedValue(new Error('connection refused'));
    expect((await run(post('/bff/auth/signin', { email: user.email, password: 'password' }))).status).toBe(502);
  });
});
