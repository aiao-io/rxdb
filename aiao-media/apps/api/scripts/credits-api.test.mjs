import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAdmin } from '../src/admin-api.ts';
import { handleCredits } from '../src/credits-api.ts';

const owner = '00000000-0000-4000-8000-000000000001';
const target = '00000000-0000-4000-8000-000000000002';
const env = {
  MEDIA_SUPABASE_URL: 'http://127.0.0.1:54321',
  MEDIA_SUPABASE_ANON_KEY: 'public',
  MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'private-secret'
};
const request = (path, method = 'GET', payload, origin = 'https://app.test') =>
  new Request(`https://app.test/api/${path}`, {
    method,
    headers: { authorization: 'Bearer user-token', origin, 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
async function fixture(run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input),
      path = url.pathname;
    calls.push({ url, init });
    if (path === '/auth/v1/user') return Response.json({ id: owner });
    if (path.endsWith('/media_admin_authorized')) return Response.json(true);
    if (path.endsWith('/media_accounts')) return Response.json([]);
    if (path.endsWith('/media_credit_accounts')) return Response.json([{ balance: 12, reserved: 3 }]);
    if (path.endsWith('/media_credit_ledger'))
      return Response.json([{ user_id: url.searchParams.get('user_id').slice(3), delta: 12 }]);
    if (path.endsWith('/media_admin_adjust_credits'))
      return Response.json({ request_id: JSON.parse(init.body).p_request_id });
    throw new Error('Unexpected endpoint');
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}
test('用户积分查询只读取会话本人，返回可用余额、流水和禁止缓存头', async () =>
  fixture(async calls => {
    const result = await handleCredits(request(`credits?owner=${target}`), env);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      account: { balance: 12, reserved: 3, available: 9 },
      entries: [{ user_id: owner, delta: 12 }]
    });
    assert.equal(result.headers.get('cache-control'), 'no-store');
    for (const call of calls.filter(item => item.url.pathname.includes('media_credit_')))
      assert.equal(call.url.searchParams.get('user_id'), `eq.${owner}`);
  }));
test('后台积分调整使用实时管理员身份，字段不能伪造，原请求标识原样传递', async () =>
  fixture(async calls => {
    const requestId = crypto.randomUUID();
    const result = await handleAdmin(
      request(`admin/users/${target}/credits`, 'POST', { delta: 7, reason: ' 验收 ', requestId }),
      env
    );
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
      p_actor: owner,
      p_target: target,
      p_delta: 7,
      p_reason: '验收',
      p_request_id: requestId
    });
    assert.ok(!(await result.text()).includes('private-secret'));
    const invalid = [
      { delta: 0, reason: '调整', requestId },
      { delta: 1.5, reason: '调整', requestId },
      { delta: 1, reason: ' ', requestId },
      { delta: 1, reason: '调整', requestId, actorId: target }
    ];
    for (const value of invalid)
      assert.equal((await handleAdmin(request(`admin/users/${target}/credits`, 'POST', value), env)).status, 400);
  }));
test('匿名、角色伪造与跨站调整不访问账本，积分不足保留 402 语义', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const path = new URL(input).pathname;
    calls.push(path);
    if (path.endsWith('/user')) return Response.json({ id: owner, user_metadata: { role: 'admin' } });
    if (path.endsWith('/media_admin_authorized')) return Response.json(false);
    throw new Error('Ledger access forbidden');
  };
  try {
    assert.equal((await handleAdmin(request(`admin/users/${target}/credits`), env)).status, 403);
    assert.equal(
      (await handleAdmin(request(`admin/users/${target}/credits`, 'POST', {}, 'https://other.test'), env)).status,
      403
    );
    assert.equal((await handleCredits(new Request('https://app.test/api/credits'), env)).status, 401);
    assert.ok(calls.every(path => !path.includes('media_credit_')));
    globalThis.fetch = async input => {
      const path = new URL(input).pathname;
      if (path.endsWith('/user')) return Response.json({ id: owner });
      if (path.endsWith('/media_admin_authorized')) return Response.json(true);
      return Response.json({ code: 'PT402', message: 'private-secret' }, { status: 402 });
    };
    const denied = await handleAdmin(
      request(`admin/users/${target}/credits`, 'POST', { delta: -1, reason: '回收', requestId: crypto.randomUUID() }),
      env
    );
    assert.equal(denied.status, 402);
    assert.ok(!(await denied.text()).includes('private-secret'));
  } finally {
    globalThis.fetch = previous;
  }
});

test('账本分页只接受有界流水标识，空账户显示零，写方法受到限制', async () =>
  fixture(async calls => {
    const result = await handleAdmin(request(`admin/users/${target}/credits?before=71`), env);
    assert.equal(result.status, 200);
    assert.equal(calls.at(-1).url.searchParams.get('id'), 'lt.71');
    assert.equal((await handleCredits(request('credits?before=-1'), env)).status, 400);
    assert.equal((await handleCredits(request('credits', 'POST', {}), env)).status, 405);
    assert.equal((await handleAdmin(request(`admin/users/${target}/credits`, 'DELETE'), env)).status, 405);
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) =>
      new URL(input).pathname.endsWith('/media_credit_accounts') ? Response.json([]) : original(input, init);
    const empty = await handleCredits(request('credits'), env);
    assert.deepEqual((await empty.json()).account, { balance: 0, reserved: 0, available: 0 });
  }));
