import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAdmin } from '../deploy/admin-api.mjs';

const userId = '00000000-0000-4000-8000-000000000001';
const env = {
  MEDIA_SUPABASE_URL: 'http://127.0.0.1:54321',
  MEDIA_SUPABASE_ANON_KEY: 'fixture-public',
  MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'fixture-server-private'
};
const request = (path, init = {}) =>
  new Request(`https://app.example.test/api/admin/${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer fixture-user',
      origin: 'https://app.example.test',
      'content-type': 'application/json',
      ...init.headers
    }
  });
test('管理员 API 在服务端确认用户和实时角色前不调用管理接口', async () => {
  const previous = globalThis.fetch,
    called = [];
  globalThis.fetch = async input => {
    const path = new URL(input).pathname;
    called.push(path);
    if (path === '/auth/v1/user') return Response.json({ id: userId, user_metadata: { role: 'admin' } });
    if (path === '/rest/v1/rpc/media_admin_authorized') return Response.json(false);
    throw new Error('Privileged endpoint must not be called');
  };
  try {
    assert.equal((await handleAdmin(request('users'), env)).status, 403);
    assert.deepEqual(called, ['/auth/v1/user', '/rest/v1/rpc/media_admin_authorized']);
  } finally {
    globalThis.fetch = previous;
  }
});
test('用户列表只返回白名单字段，不返回凭据和任意 metadata', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(input).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: userId });
    if (path === '/rest/v1/rpc/media_admin_authorized') return Response.json(true);
    if (path === '/auth/v1/admin/users')
      return Response.json({
        users: [
          {
            id: userId,
            email: 'fixture@example.test',
            encrypted_password: 'private',
            user_metadata: { token: 'private' }
          }
        ],
        total: 1
      });
    if (path === '/rest/v1/media_accounts') return Response.json([]);
    throw new Error('Unexpected request');
  };
  try {
    const response = await handleAdmin(request('users'), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.users[0].id, userId);
    assert.ok(!JSON.stringify(data).includes('private'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = previous;
  }
});
test('角色撤销后下一次调用立即被拒绝，错误不显示服务端响应', async () => {
  const previous = globalThis.fetch;
  let enabled = true;
  globalThis.fetch = async input => {
    const path = new URL(input).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: userId });
    if (path === '/rest/v1/rpc/media_admin_authorized') return Response.json(enabled);
    throw new Error('fixture-server-private');
  };
  try {
    assert.equal((await handleAdmin(request('session'), env)).status, 200);
    enabled = false;
    const denied = await handleAdmin(request('session'), env);
    assert.equal(denied.status, 403);
    assert.ok(!(await denied.text()).includes('fixture-server-private'));
  } finally {
    globalThis.fetch = previous;
  }
});
test('跨 origin 管理写入被拒绝', async () => {
  const response = await handleAdmin(
    request(`users/${userId}`, { method: 'PATCH', headers: { origin: 'https://other.example.test' }, body: '{}' }),
    env
  );
  assert.equal(response.status, 403);
});

test('运行策略实际限制代理启停、模型和画幅，并返回生效版本', async () => {
  const { default: worker } = await import('../deploy/local-first-worker.mjs');
  const previous = globalThis.fetch;
  const target = 'https://provider.example.test/v1';
  let enabled = false,
    available = true,
    providerCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname === '/rest/v1/media_public_content') {
      if (!available) return Response.json({ code: 'unavailable' }, { status: 503 });
      return Response.json([
        {
          revision: 7,
          payload: {
            version: 1,
            providers: [
              {
                id: userId,
                name: 'Fixture',
                baseUrl: target,
                models: ['fixture'],
                sizes: ['1024x1024'],
                direct: false,
                proxy: true,
                enabled
              }
            ]
          }
        }
      ]);
    }
    assert.equal(url.origin, new URL(target).origin);
    providerCalls++;
    return Response.json({ data: [] });
  };
  const relay = model =>
    worker.fetch(
      new Request('https://app.example.test/api/relay', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.test',
          authorization: 'Bearer fixture-user-provider-key',
          'content-type': 'application/json',
          'x-provider-base': target
        },
        body: JSON.stringify({ model, prompt: 'fixture', n: 1, size: '1024x1024' })
      }),
      env
    );
  try {
    assert.equal((await relay('fixture')).status, 403);
    assert.equal(providerCalls, 0);
    enabled = true;
    const allowed = await relay('fixture');
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('x-aiao-policy-version'), '7');
    await allowed.text();
    assert.equal(providerCalls, 1);
    assert.equal((await relay('other')).status, 403);
    assert.equal(providerCalls, 1);
    available = false;
    assert.notEqual((await relay('fixture')).status, 200);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
