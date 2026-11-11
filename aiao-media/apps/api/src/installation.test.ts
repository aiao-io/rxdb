import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, mock, test } from 'node:test';
import { handleAdmin } from './admin-api.ts';
import { Installation } from './installation.ts';
import worker from './local-first-worker.ts';
import type { WorkerSql } from './worker-env.ts';

const origin = 'https://media.example.test';
const actor = '12345678-1234-4234-8234-123456789012';
const input = {
  email: 'owner@example.test',
  password: 'a-long-owner-password',
  bootstrapSecret: 'deployment-bootstrap-secret-1234567890',
  supabaseUrl: 'https://project.supabase.co',
  anonKey: 'sb_publishable_fixture',
  serviceRoleKey: 'sb_secret_fixture'
};
function rig() {
  const db = new DatabaseSync(':memory:');
  const sql: WorkerSql = {
    exec: <Row extends Record<string, SqlStorageValue>>(query: string, ...values: SqlStorageValue[]) =>
      db
        .prepare(query)
        .all(...values.map(value => (value instanceof ArrayBuffer ? new Uint8Array(value) : value))) as unknown as Row[]
  };
  const env = { MEDIA_INSTALLATION_BOOTSTRAP_SECRET: input.bootstrapSecret };
  let instance = new Installation({ storage: { sql } }, env);
  const send = (method = 'GET', payload: unknown = input, source = origin) =>
    instance.fetch(
      new Request(`${origin}/api/installation`, {
        method,
        headers: { origin: source, 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: JSON.stringify(payload) })
      })
    );
  return {
    db,
    send,
    restart: () => {
      instance = new Installation({ storage: { sql } }, env);
    }
  };
}
afterEach(() => mock.restoreAll());
function upstream(failGrant = false) {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const path = String(url);
    if (path.includes('/media_installation_state?')) return Response.json([]);
    if (path.includes('/media_admin_memberships?')) return Response.json([]);
    if (path.endsWith('/auth/v1/settings')) return Response.json({});
    if (path.endsWith('/auth/v1/admin/users')) return Response.json({ id: actor });
    if (path.endsWith('/auth/v1/token?grant_type=password'))
      return Response.json({ access_token: 'session', user: { id: actor } });
    if (path.endsWith('/rpc/media_bootstrap_admin'))
      return failGrant ? Response.json({}, { status: 503 }) : Response.json(actor);
    throw new Error(`Unexpected request: ${path}`);
  });
}
test('跨站初始化在任何外部请求或持久写入之前被拒绝', async () => {
  const r = rig(),
    calls = upstream();
  try {
    assert.equal((await r.send('POST', input, 'https://other.test')).status, 403);
    assert.equal(calls.mock.callCount(), 0);
    assert.equal(r.db.prepare('SELECT count(*) AS count FROM media_installation').get()!.count, 0);
    assert.equal((await r.send()).status, 200);
    assert.equal(((await (await r.send()).json()) as { initialized: boolean }).initialized, false);
  } finally {
    r.db.close();
  }
});
test('需要部署初始化密钥，重启后关闭安装且不保存密码', async () => {
  const r = rig();
  upstream();
  try {
    assert.equal((await r.send('POST')).status, 200);
    r.restart();
    const status = await (await r.send()).text();
    assert.equal(JSON.parse(status).initialized, true);
    assert.equal(JSON.parse(status).auth.url, input.supabaseUrl);
    assert.ok(!status.includes(input.serviceRoleKey));
    assert.equal((await r.send('POST')).status, 409);
    const stored = JSON.stringify(r.db.prepare('SELECT * FROM media_installation').all());
    assert.ok(!stored.includes(input.password));
  } finally {
    r.db.close();
  }
});
test('并发初始化只执行一次，部分失败重启后可以修正邮箱继续', async () => {
  const r = rig();
  const failing = upstream(true);
  try {
    assert.equal((await r.send('POST')).status, 502);
    r.restart();
    failing.mock.restore();
    const calls = upstream();
    const corrected = { ...input, email: 'correct-owner@example.test' };
    const responses = await Promise.all([r.send('POST', corrected), r.send('POST', corrected)]);
    assert.deepEqual(
      responses.map(response => response.status),
      [200, 409]
    );
    assert.equal(
      calls.mock.calls.filter(call => String(call.arguments[0]).endsWith('/rpc/media_bootstrap_admin')).length,
      1
    );
    const created = calls.mock.calls.find(call => String(call.arguments[0]).endsWith('/auth/v1/admin/users'));
    assert.ok(created);
    assert.equal(JSON.parse(String((created.arguments[1] as RequestInit).body)).email, corrected.email);
  } finally {
    r.db.close();
  }
});

test('账号创建结果未知时不锁死邮箱，修正后的账号使用新的操作标识', async () => {
  const r = rig();
  const failing = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).endsWith('/auth/v1/admin/users')) return Response.json({}, { status: 503 });
    return Response.json([]);
  });
  try {
    assert.equal((await r.send('POST', { ...input, email: 'typo@example.test' })).status, 502);
    const before = JSON.parse(String(r.db.prepare('SELECT payload FROM media_installation').get()!.payload));
    r.restart();
    failing.mock.restore();
    upstream();
    assert.equal((await r.send('POST')).status, 200);
    const after = JSON.parse(String(r.db.prepare('SELECT payload FROM media_installation').get()!.payload));
    assert.equal(after.email, input.email);
    assert.notEqual(after.requestId, before.requestId);
    assert.equal(after.initialized, true);
    assert.ok(!JSON.stringify(after).includes(input.password));
  } finally {
    r.db.close();
  }
});

test('授权成功但回执丢失后，修改邮箱不能创建另一管理员，原账号可确认完成', async () => {
  const r = rig();
  let granted = false;
  const calls = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path.includes('/media_admin_memberships?')) return Response.json(granted ? [{ user_id: actor }] : []);
    if (path.endsWith('/auth/v1/admin/users')) return Response.json({ id: actor });
    if (path.endsWith('/auth/v1/token?grant_type=password')) {
      const payload = JSON.parse(String(init?.body));
      const id = payload.email === input.email ? actor : '22345678-1234-4234-8234-123456789012';
      return Response.json({ user: { id } });
    }
    if (path.endsWith('/rpc/media_admin_authorized'))
      return Response.json(JSON.parse(String(init?.body)).p_actor === actor);
    if (path.endsWith('/rpc/media_bootstrap_admin')) {
      if (granted) return Response.json(actor);
      granted = true;
      return Response.json({}, { status: 503 });
    }
    return Response.json([]);
  });
  try {
    assert.equal((await r.send('POST')).status, 502);
    r.restart();
    const denied = await r.send('POST', { ...input, email: 'another@example.test' });
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /原管理员/);
    assert.equal(calls.mock.calls.filter(call => String(call.arguments[0]).endsWith('/auth/v1/admin/users')).length, 1);
    assert.equal((await r.send('POST')).status, 200);
  } finally {
    r.db.close();
  }
});
test('非法公开 Key、短密码和非 HTTPS 地址不能开始初始化', async () => {
  const r = rig(),
    calls = upstream();
  try {
    for (const value of [
      { password: 'short' },
      { anonKey: input.serviceRoleKey },
      { supabaseUrl: 'http://external.test' }
    ])
      assert.equal((await r.send('POST', { ...input, ...value })).status, 400);
    assert.equal(calls.mock.callCount(), 0);
  } finally {
    r.db.close();
  }
});

test('账号已存在时验证原密码，不修改账号；数据库未就绪不会开始写安装状态', async () => {
  const r = rig();
  const calls = upstream();
  calls.mock.mockImplementation(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/admin/users'))
      return Response.json({ code: 422, error_code: 'email_exists', msg: 'private upstream detail' }, { status: 422 });
    if (
      path.endsWith('/auth/v1/settings') ||
      path.includes('/media_installation_state?') ||
      path.includes('/media_admin_memberships?')
    )
      return Response.json([]);
    if (path.endsWith('/auth/v1/token?grant_type=password')) return Response.json({ user: { id: actor } });
    if (path.endsWith('/rpc/media_bootstrap_admin')) return Response.json(actor);
    throw new Error('Unexpected request');
  });
  try {
    assert.equal((await r.send('POST')).status, 200);
    assert.ok(calls.mock.calls.every(call => (call.arguments[1] as RequestInit)?.method !== 'PUT'));
  } finally {
    r.db.close();
  }
  const missing = rig();
  calls.mock.mockImplementation(async () => Response.json({}, { status: 404 }));
  try {
    assert.equal((await missing.send('POST')).status, 503);
    assert.equal(missing.db.prepare('SELECT count(*) AS count FROM media_installation').get()!.count, 0);
  } finally {
    missing.db.close();
  }
});

test('Worker 使用持久对象统一检查首次访问并加载安装后的服务端配置', async () => {
  const r = rig();
  upstream();
  const setup = new Installation(
    {
      storage: {
        sql: {
          exec: <Row extends Record<string, SqlStorageValue>>(query: string, ...values: SqlStorageValue[]) =>
            r.db
              .prepare(query)
              .all(
                ...values.map(value => (value instanceof ArrayBuffer ? new Uint8Array(value) : value))
              ) as unknown as Row[]
        }
      }
    },
    {}
  );
  const env = {
    MEDIA_INSTALLATION: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: (input: RequestInfo | URL, init?: RequestInit) => setup.fetch(new Request(input, init)) })
    },
    ASSETS: {
      fetch: async () => new Response('app', { headers: { 'content-security-policy': "connect-src 'self' https:;" } })
    }
  };
  try {
    assert.equal((await worker.fetch(new Request(origin), env)).headers.get('location'), `${origin}/admin/`);
    assert.equal((await r.send('POST')).status, 200);
    const page = await worker.fetch(new Request(origin), env);
    assert.equal(page.status, 200);
    assert.ok(page.headers.get('content-security-policy')?.includes('wss://project.supabase.co'));
    const publicState = await worker.fetch(new Request(`${origin}/api/installation`), env);
    assert.equal(((await publicState.json()) as { initialized: boolean }).initialized, true);
    assert.equal((await worker.fetch(new Request(`${origin}/api/admin/session`), env)).status, 401);
  } finally {
    r.db.close();
  }
});

test('后台登录拒绝跨站和普通用户，只返回已授权管理员的有限会话', async () => {
  let allowed = false;
  const calls = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).includes('/token?'))
      return Response.json({
        access_token: 'session-token',
        refresh_token: 'private-refresh',
        expires_in: 3600,
        user: { id: actor, email: input.email }
      });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: actor });
    return Response.json(allowed);
  });
  const env = {
    MEDIA_SUPABASE_URL: input.supabaseUrl,
    MEDIA_SUPABASE_ANON_KEY: input.anonKey,
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: input.serviceRoleKey
  };
  const login = (source = origin) =>
    handleAdmin(
      new Request(`${origin}/api/admin/login`, {
        method: 'POST',
        headers: { origin: source, 'content-type': 'application/json' },
        body: JSON.stringify({ email: input.email, password: input.password })
      }),
      env
    );
  assert.equal((await login('https://other.test')).status, 403);
  assert.equal(calls.mock.callCount(), 0);
  assert.equal((await login()).status, 403);
  allowed = true;
  const result = await login();
  assert.equal(result.status, 200);
  const session = await result.text();
  assert.ok(session.includes('session-token'));
  assert.ok(!session.includes('private-refresh'));
  assert.ok(!session.includes(input.serviceRoleKey));
});

test('明确授权失败后可以修正管理员账号，未知结果仍保留原进度', async () => {
  const r = rig();
  const calls = upstream();
  calls.mock.mockImplementation(async (url: string | URL | Request) => {
    if (String(url).endsWith('/rpc/media_bootstrap_admin')) return Response.json({ code: '42501' }, { status: 403 });
    if (String(url).endsWith('/auth/v1/token?grant_type=password')) return Response.json({ user: { id: actor } });
    return Response.json([]);
  });
  try {
    const denied = await r.send('POST');
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /原管理员/);
    assert.equal(r.db.prepare('SELECT count(*) AS count FROM media_installation').get()!.count, 0);
    calls.mock.restore();
    upstream();
    assert.equal((await r.send('POST', { ...input, email: 'correct-owner@example.test' })).status, 200);
  } finally {
    r.db.close();
  }
});

test('真实 Auth 错误格式下，重复账号密码错误可修正重试且不改写密码', async () => {
  const r = rig();
  const calls = upstream();
  let valid = false;
  calls.mock.mockImplementation(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/admin/users'))
      return Response.json({ code: 422, error_code: 'email_exists' }, { status: 422 });
    if (path.endsWith('/auth/v1/token?grant_type=password'))
      return valid ?
          Response.json({ user: { id: actor } })
        : Response.json({ code: 400, error_code: 'invalid_credentials', msg: 'private' }, { status: 400 });
    if (path.endsWith('/rpc/media_bootstrap_admin')) return Response.json(actor);
    return Response.json([]);
  });
  try {
    const denied = await r.send('POST');
    assert.equal(denied.status, 401);
    assert.match(await denied.text(), /邮箱或密码错误/);
    assert.equal(r.db.prepare('SELECT count(*) AS count FROM media_installation').get()!.count, 0);
    valid = true;
    assert.equal((await r.send('POST', { ...input, password: 'correct-original-password' })).status, 200);
    assert.ok(calls.mock.calls.every(call => (call.arguments[1] as RequestInit)?.method !== 'PUT'));
  } finally {
    r.db.close();
  }
});

test('已有管理员先验证原账号，普通账号不能接管且不会额外创建账号', async () => {
  const r = rig();
  const calls = upstream();
  let authorized = false;
  calls.mock.mockImplementation(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.includes('/media_admin_memberships?')) return Response.json([{ user_id: actor }]);
    if (path.endsWith('/auth/v1/token?grant_type=password')) return Response.json({ user: { id: actor } });
    if (path.endsWith('/rpc/media_admin_authorized')) return Response.json(authorized);
    if (path.endsWith('/rpc/media_bootstrap_admin')) return Response.json(actor);
    if (path.endsWith('/auth/v1/admin/users')) throw new Error('Must not create another account');
    return Response.json([]);
  });
  try {
    const denied = await r.send('POST');
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /原管理员/);
    assert.equal(calls.mock.calls.filter(call => String(call.arguments[0]).endsWith('/auth/v1/admin/users')).length, 0);
    assert.equal(
      calls.mock.calls.filter(call => String(call.arguments[0]).endsWith('/rpc/media_bootstrap_admin')).length,
      0
    );
    authorized = true;
    assert.equal((await r.send('POST', { ...input, email: 'original-admin@example.test' })).status, 200);
  } finally {
    r.db.close();
  }
});
