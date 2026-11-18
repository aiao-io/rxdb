import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
import type { ErrorReport } from './monitor.js';
import { collaborationRuntime, edgeEntry, nodeEntry, type CollaborationRuntime } from './runtime.js';

/** 公开 anon key 的形状（载荷 role 为 anon），签名与测试无关。 */
const jwt = (role: string) =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ role })).replaceAll('=', '')}.signature`;
const anonKey = jwt('anon');
const database = (user: string) => {
  const url = new URL('postgres://db.internal:6543/postgres');
  url.username = user;
  url.password = 'not-a-real-password';
  return url.href;
};
const edgeEnvironment = {
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_ANON_KEY: anonKey,
  ADMIN_JWKS_URL: 'https://project.supabase.test/auth/v1/.well-known/jwks.json',
  ADMIN_JWT_ISSUER: 'https://project.supabase.test/auth/v1',
  ADMIN_DATABASE_URL: database('admin_collaboration.projectref'),
  ADMIN_ALLOWED_ORIGINS: 'https://app.example, https://admin.example',
  // 平台注入的变量：函数不读它们
  SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
  SUPABASE_DB_URL: database('postgres'),
  SUPABASE_JWT_SECRET: 'platform-injected-legacy-secret'
};
const runtimes: CollaborationRuntime[] = [];
const build = (...args: Parameters<typeof collaborationRuntime>) => {
  const runtime = collaborationRuntime(...args);
  runtimes.push(runtime);
  return runtime;
};
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.pool.end()));
});
const configurationError = (work: () => unknown) => {
  try {
    work();
    return 'none';
  } catch (error) {
    return error instanceof CollaborationError ? `${error.code}: ${error.message}` : String(error);
  }
};

describe('两个入口共用一份装配，只是变量名与连接池不同（ADMIN-US-220）', () => {
  it('Edge Function 只从 ADMIN_ 前缀读身份校验设置：平台注入的 SUPABASE_JWT_SECRET 不会让它报两种密钥都配置了', () => {
    const { rules, pool } = build(edgeEnvironment, edgeEntry);
    expect(rules).toEqual({
      keys: { kind: 'jwks', url: 'https://project.supabase.test/auth/v1/.well-known/jwks.json' },
      issuer: 'https://project.supabase.test/auth/v1'
    });
    expect(pool.options).toMatchObject({ max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
    // 超时不经启动参数传递（transaction 模式的连接池不转发它们），改由每个事务的 SET LOCAL 设置
    expect(pool.options).not.toHaveProperty('statement_timeout');
  });
  it('Node 入口沿用 SUPABASE_ 前缀的变量名，ADMIN_ 前缀的设置对它不算数', () => {
    const rest: Record<string, string> = { ...edgeEnvironment };
    for (const name of ['ADMIN_JWKS_URL', 'ADMIN_JWT_ISSUER', 'SUPABASE_JWT_SECRET']) delete rest[name];
    expect(configurationError(() => build({ ...rest, ADMIN_JWT_SECRET: 'x' }, nodeEntry))).toBe(
      'configuration: 身份校验必须且只能配置一种签名密钥'
    );
    const { rules, pool } = build({ ...rest, SUPABASE_JWT_SECRET: 'local-secret' }, nodeEntry);
    expect(rules.keys).toEqual({ kind: 'secret', secret: 'local-secret' });
    expect(pool.options).toMatchObject({ max: 10, connectionTimeoutMillis: 5000 });
  });
  it('只接受协作专用数据库角色的连接串：直连的角色名或经 Supavisor 的 <角色>.<项目 ref>', () => {
    for (const user of ['admin_collaboration', 'admin_collaboration.abcdefghijklmnopqrst'])
      expect(
        configurationError(() => build({ ...edgeEnvironment, ADMIN_DATABASE_URL: database(user) }, edgeEntry))
      ).toBe('none');
    for (const user of [
      'postgres',
      'postgres.abcdefghijklmnopqrst',
      'service_role',
      'admin_collaboration_x',
      'admin_collaboration.'
    ])
      expect(
        configurationError(() => build({ ...edgeEnvironment, ADMIN_DATABASE_URL: database(user) }, edgeEntry)),
        user
      ).toBe('configuration: 命令入口的数据库连接必须使用协作专用数据库角色');
    expect(configurationError(() => build({ ...edgeEnvironment, ADMIN_DATABASE_URL: 'not a url' }, edgeEntry))).toBe(
      'configuration: 命令入口的数据库连接必须使用协作专用数据库角色'
    );
  });
  it('从不读取平台注入的 service role key 与 postgres 连接串，公开配置也拒绝 service role key', async () => {
    const read = new Set<string>();
    const watched = new Proxy(edgeEnvironment, {
      get(target, name, receiver) {
        if (typeof name === 'string') read.add(name);
        return Reflect.get(target, name, receiver) as unknown;
      }
    });
    const { handler } = build(watched, edgeEntry);
    const config = await handler(new Request('https://edge.test/admin-collaboration/config'));
    expect(await config.json()).toEqual({ supabaseUrl: 'https://project.supabase.test', supabaseKey: anonKey });
    expect([...read].sort()).toEqual(
      [
        'ADMIN_ALLOWED_ORIGINS',
        'ADMIN_DATABASE_URL',
        'ADMIN_ERROR_REPORT_URL',
        'ADMIN_JWKS_URL',
        'ADMIN_JWT_ISSUER',
        'ADMIN_JWT_SECRET',
        'ADMIN_PUBLIC_SUPABASE_URL',
        'ADMIN_RELEASE',
        'SUPABASE_ANON_KEY',
        'SUPABASE_URL'
      ].sort()
    );
    expect(
      configurationError(() => build({ ...edgeEnvironment, SUPABASE_ANON_KEY: jwt('service_role') }, edgeEntry))
    ).toBe('configuration: SUPABASE_ANON_KEY 必须是公开 anon 或 publishable key');
  });
  it('入口访问 Supabase 的地址与浏览器不同（自托管的内部网络）时，公开配置下发 ADMIN_PUBLIC_SUPABASE_URL', async () => {
    const internal = build({ ...edgeEnvironment, SUPABASE_URL: 'http://kong:8000' }, edgeEntry);
    const split = build(
      { ...edgeEnvironment, SUPABASE_URL: 'http://kong:8000', ADMIN_PUBLIC_SUPABASE_URL: 'https://api.example' },
      edgeEntry
    );
    const config = async (runtime: CollaborationRuntime) =>
      (await (await runtime.handler(new Request('https://edge.test/admin-collaboration/config'))).json()) as unknown;
    expect(await config(internal)).toMatchObject({ supabaseUrl: 'http://kong:8000' });
    expect(await config(split)).toMatchObject({ supabaseUrl: 'https://api.example' });
  });
  it('GET /health 探数据库与 Auth：Auth 经公开 key 访问 GoTrue 健康接口，数据库不可达时 503，报告带入口与发布标识（ADMIN-US-217 AC#7）', async () => {
    const requests: Request[] = [];
    const { handler } = build(
      {
        ...edgeEnvironment,
        SUPABASE_URL: 'http://kong:8000',
        ADMIN_RELEASE: 'r-20261118-7',
        // 不可达的数据库：本机 1 号端口没有服务，连接立即被拒
        ADMIN_DATABASE_URL: database('admin_collaboration').replace('db.internal:6543', '127.0.0.1:1')
      },
      edgeEntry,
      {
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          return new Response('{}', { status: 200 });
        }
      }
    );
    const response = await handler(new Request('https://edge.test/admin-collaboration/health'));
    expect(response.status).toBe(503);
    const report = (await response.json()) as Record<string, unknown>;
    expect(report).toMatchObject({
      status: 'unavailable',
      entry: 'edge',
      release: 'r-20261118-7',
      checks: { database: { status: 'unavailable', reason: 'error' }, auth: { status: 'ok' } }
    });
    expect(JSON.stringify(report)).not.toContain('not-a-real-password');
    expect(requests.map(request => [request.url, request.headers.get('apikey')])).toEqual([
      ['http://kong:8000/auth/v1/health', anonKey]
    ]);
  });
  it('未处理错误交给注入的上报器：连接池里空闲连接的错误同样上报，报告已脱敏（ADMIN-US-217 AC#7）', async () => {
    const reports: ErrorReport[] = [];
    const { pool } = build({ ...edgeEnvironment, ADMIN_RELEASE: 'r-9' }, edgeEntry, {
      reporter: { report: async report => void reports.push(report) }
    });
    pool.emit('error', new Error('terminating connection for invitee@example.com'));
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toMatchObject({
      entry: 'edge',
      release: 'r-9',
      source: 'pool',
      request: null,
      error: { message: 'terminating connection for [email]' }
    });
  });
  it('缺少任何一项必需的变量时启动即失败', () => {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_DATABASE_URL', 'ADMIN_ALLOWED_ORIGINS']) {
      const rest: Record<string, string> = { ...edgeEnvironment };
      delete rest[name];
      expect(
        configurationError(() => build(rest, edgeEntry)),
        name
      ).toMatch(/^configuration: /);
    }
  });
});
