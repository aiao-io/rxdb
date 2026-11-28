import { describe, expect, it, vi } from 'vitest';
import { CollaborationError, type Identity } from '../model.js';
import { unavailable } from './availability.js';
import { bodyLimit, commandHandler, errorResponse, type HandlerOptions, type RepositoryApi } from './handler.js';
import type { HealthReport } from './health.js';
import type { Identities } from './identity.js';

/**
 * fetch 风格的命令处理函数（Node 入口与 Edge Function 共用）：直接用 Request / Response 驱动，不经 node:http，
 * Deno 里跑的就是这一个函数。Node 入口的转换与请求时限见 `http.spec.ts`。
 */
const user: Identity = { id: 'user', email: 'user@example.test', verified: true };
const identities: Identities = {
  verify: vi.fn(async (token: string) => {
    if (token !== 'valid') throw new CollaborationError('unauthenticated', '会话已失效，请重新登录');
    return user;
  }),
  confirm: vi.fn(async () => user)
};
const setup = (
  operation: RepositoryApi['operation'],
  options: Pick<HandlerOptions, 'basePath' | 'onError' | 'health'> = {}
) =>
  commandHandler({
    repository: { operation: vi.fn(operation) },
    identities,
    origins: ['https://product.example'],
    publicConfig: { supabaseUrl: 'https://project.supabase.test', supabaseKey: 'public-key' },
    ...options
  });
const command = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
const task = { type: 'task', operationId: 'op', id: 'task', name: 'Task', expectedHead: 'root' };

describe('fetch 风格的命令处理函数', () => {
  it('Edge Function 收到的路径带函数名：去掉它之后与 Node 入口同一套路由，开发代理的 /collaboration-api 前缀也可有可无', async () => {
    const operation = vi.fn(async () => ({ head: 'h' }));
    const handle = setup(operation, { basePath: '/admin-collaboration' });
    for (const path of [
      '/admin-collaboration/workspaces/team/assets/commands',
      '/admin-collaboration/collaboration-api/workspaces/team/assets/commands',
      '/workspaces/team/assets/commands'
    ]) {
      const response = await handle(command(`http://edge.test${path}`, task));
      expect(response.status, path).toBe(200);
      expect(await response.json(), path).toEqual({ head: 'h' });
    }
    expect(operation).toHaveBeenCalledTimes(3);
    const config = await handle(new Request('http://edge.test/admin-collaboration/config'));
    expect(await config.json()).toEqual({ supabaseUrl: 'https://project.supabase.test', supabaseKey: 'public-key' });
    // 只按整段匹配前缀：形似前缀的路径不会被截断成另一个接口
    const lookalike = await handle(
      command('http://edge.test/admin-collaborationx/workspaces/team/assets/commands', task)
    );
    expect(await lookalike.json()).toMatchObject({ error: 'not_found' });
  });
  it('暂时不可用时回 503、Retry-After 与稳定的错误码；跨源调用时暴露 Retry-After 供浏览器读取', async () => {
    const handle = setup(async () => {
      throw unavailable('pool');
    });
    const response = await handle(
      command('http://edge.test/workspaces/team/assets/commands', task, { origin: 'https://product.example' })
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://product.example');
    expect(response.headers.get('access-control-expose-headers')).toBe('Retry-After, Server-Timing');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'unavailable',
      message: '服务暂时不可用，请稍后按原请求重试',
      details: { reason: 'pool', retryAfter: 1 }
    });
    const timeout = errorResponse(unavailable('timeout'));
    expect([timeout.status, timeout.headers.get('retry-after')]).toEqual([503, '2']);
    // 没有给出等待时间的不可用（例如 JWKS 取失败）按 1 秒
    const plain = errorResponse(new CollaborationError('unavailable', '服务暂时不可用，请稍后按原请求重试'));
    expect(plain.headers.get('retry-after')).toBe('1');
  });
  it('GET /health 不要求令牌：全部可用回 200，任一组件不可用回 503，响应体就是健康报告（ADMIN-US-217 AC#7）', async () => {
    const report = (status: HealthReport['status']): HealthReport => ({
      status,
      entry: 'edge',
      release: 'r-1',
      checks: {
        database: { status, latencyMs: 3 },
        auth: { status: 'ok', latencyMs: 2 }
      }
    });
    let current = report('ok');
    const health = vi.fn(async () => current);
    const handle = setup(async () => ({}), { basePath: '/admin-collaboration', health });
    const healthy = await handle(new Request('http://edge.test/admin-collaboration/health'));
    expect(healthy.status).toBe(200);
    expect(healthy.headers.get('cache-control')).toBe('no-store');
    expect(await healthy.json()).toEqual(report('ok'));
    current = report('unavailable');
    // 静态站点把 /collaboration-api/* 改写到函数时，路径带着这个前缀
    const degraded = await handle(new Request('http://edge.test/admin-collaboration/collaboration-api/health'));
    expect(degraded.status).toBe(503);
    expect(await degraded.json()).toEqual(report('unavailable'));
    expect(health).toHaveBeenCalledTimes(2);
    // 没有装配健康检查的处理函数不认这个路径
    const bare = await setup(async () => ({}))(new Request('http://edge.test/health'));
    expect(await bare.json()).toMatchObject({ error: 'unauthenticated' });
  });
  it('内部错误一律 500、不透露细节，只交给记录钩子写运维日志；业务错误不进日志', async () => {
    const onError = vi.fn();
    const failure = new Error('relation "admin_private.secret" does not exist');
    const handle = setup(
      async (_user, _team, app) => {
        if (app === 'broken') throw failure;
        throw new CollaborationError('forbidden', '当前用户没有操作权限');
      },
      { onError }
    );
    const broken = await handle(command('http://edge.test/workspaces/team/broken/commands', task));
    expect(broken.status).toBe(500);
    expect(await broken.json()).toEqual({
      error: 'internal',
      message: '服务暂时不可用，请稍后按原请求重试',
      details: {}
    });
    // 记录钩子拿到错误与请求的方法、路径（不含查询串、请求头与请求体），由上报器脱敏后写运维日志
    expect(onError).toHaveBeenCalledWith(failure, { method: 'POST', path: '/workspaces/team/broken/commands' });
    const denied = await handle(command('http://edge.test/workspaces/team/assets/commands', task));
    expect(denied.status).toBe(403);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('每个响应都带 Server-Timing（命令入口自己的处理耗时，不含网关、冷启动与网络），监控与预算核对据此区分服务端耗时（ADMIN-US-217 AC#6）', async () => {
    const handle = setup(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { head: 'h' };
    });
    const timed = (response: Response) =>
      Number(/^app;dur=(\d+(?:\.\d)?)$/.exec(response.headers.get('server-timing') ?? '')?.[1] ?? Number.NaN);
    const ok = await handle(command('http://edge.test/workspaces/team/assets/commands', task));
    expect(timed(ok)).toBeGreaterThanOrEqual(15);
    const denied = await handle(
      command('http://edge.test/workspaces/team/assets/commands', task, { authorization: '' })
    );
    expect(denied.status).toBe(401);
    expect(timed(denied)).toBeGreaterThanOrEqual(0);
    const config = await handle(new Request('http://edge.test/config'));
    expect(timed(config)).toBeGreaterThanOrEqual(0);
  });
  it('上限装得下一个改动一万条资产记录的提交（交换格式约 2.3 MiB）', async () => {
    const operation = vi.fn(async () => ({}));
    const handle = setup(operation);
    const bulky = JSON.stringify({ ...task, name: 'x'.repeat(3 * 1024 * 1024) });
    const accepted = await handle(command('http://edge.test/workspaces/team/assets/commands', bulky));
    // 请求体被完整读完、交给了命令校验（名称超长由输入校验拒绝），而不是在体积这一关就被拒。
    expect(await accepted.json()).not.toMatchObject({ error: 'limit' });
  });
  it('请求体超过 4 MiB 时停止读取并拒绝；声明的长度超限时不读请求体', async () => {
    const operation = vi.fn(async () => ({}));
    const handle = setup(operation);
    const large = JSON.stringify({ ...task, name: 'x'.repeat(bodyLimit) });
    const streamed = await handle(command('http://edge.test/workspaces/team/assets/commands', large));
    expect(streamed.status).toBe(409);
    expect(await streamed.json()).toMatchObject({ error: 'limit', message: '请求不能超过 4 MiB' });
    const declared = await handle(
      command('http://edge.test/workspaces/team/assets/commands', '{}', { 'content-length': String(bodyLimit + 1) })
    );
    expect(await declared.json()).toMatchObject({ error: 'limit' });
    const malformed = await handle(command('http://edge.test/workspaces/team/assets/commands', '{"type":'));
    expect(await malformed.json()).toMatchObject({ error: 'invalid', message: 'JSON 格式错误' });
    expect(operation).not.toHaveBeenCalled();
  });
  it('邀请令牌先在服务端取 SHA-256 摘要（WebCrypto），与原先 node:crypto 的结果相同', async () => {
    const operation = vi.fn(async () => ({}));
    const handle = setup(operation);
    await handle(
      command('http://edge.test/workspaces/team/assets/commands', {
        type: 'accept_invite',
        operationId: 'op',
        id: 'invite',
        tokenHash: '邀请-token'
      })
    );
    const { createHash } = await import('node:crypto');
    expect(operation).toHaveBeenCalledWith(
      user,
      'team',
      'assets',
      expect.objectContaining({ tokenHash: createHash('sha256').update('邀请-token').digest('hex') })
    );
  });
  it('预检与来源校验：白名单外的来源一律 403，预检回 204 与允许的方法和头', async () => {
    const handle = setup(async () => ({}));
    const preflight = await handle(
      new Request('http://edge.test/admin-collaboration/workspaces/team/assets/commands', {
        method: 'OPTIONS',
        headers: { origin: 'https://product.example' }
      })
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    const foreign = await handle(
      command('http://edge.test/workspaces/team/assets/commands', task, { origin: 'https://evil.example' })
    );
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });
});
