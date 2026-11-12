import assert from 'node:assert/strict';
import { test } from 'node:test';
import { developmentAccounts, seedDevelopmentAccounts } from './seed-accounts.mjs';

const local = { url: 'http://127.0.0.1:54421', env: { SERVICE_ROLE_KEY: 'local-service-role' } };

/** 只实现准备账号用到的 GoTrue 管理接口：分页列出、创建、按 ID 更新。 */
function gotrue(users = []) {
  const accounts = users.map(user => ({ ...user }));
  const calls = [];
  async function request(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    calls.push({ method, pathname, apikey: headers.get('apikey'), authorization: headers.get('authorization') });
    const body = init.body ? JSON.parse(init.body) : {};
    if (pathname === '/auth/v1/admin/users' && method === 'GET') {
      const page = Number(searchParams.get('page'));
      const perPage = Number(searchParams.get('per_page'));
      return Response.json({ users: accounts.slice((page - 1) * perPage, page * perPage), aud: 'authenticated' });
    }
    if (pathname === '/auth/v1/admin/users' && method === 'POST') {
      const user = {
        id: `user-${accounts.length}`,
        email: body.email,
        password: body.password,
        confirmed: body.email_confirm
      };
      accounts.push(user);
      return Response.json(user);
    }
    const id = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(pathname)?.[1];
    const user = accounts.find(account => account.id === id);
    if (user && method === 'PUT') {
      Object.assign(user, { password: body.password, confirmed: body.email_confirm });
      return Response.json(user);
    }
    return Response.json({ msg: 'not found' }, { status: 404 });
  }
  return { accounts, calls, request };
}

test('测试账号已确认、可重复准备：再次启动保留账号 ID，密码恢复默认值', async () => {
  const { accounts, calls, request } = gotrue();
  await seedDevelopmentAccounts(local, request);
  assert.equal(accounts.length, developmentAccounts.length);
  for (const account of developmentAccounts) {
    const user = accounts.find(candidate => candidate.email === account.email);
    assert.equal(user.password, account.password);
    assert.equal(user.confirmed, true);
  }
  const ids = accounts.map(user => user.id);
  accounts[0].password = 'changed-by-developer';
  await seedDevelopmentAccounts(local, request);
  assert.deepEqual(
    accounts.map(user => user.id),
    ids
  );
  assert.equal(accounts[0].password, developmentAccounts[0].password);
  assert.equal(calls.filter(call => call.method === 'POST').length, developmentAccounts.length);
  for (const call of calls) {
    assert.equal(call.apikey, local.env.SERVICE_ROLE_KEY);
    assert.equal(call.authorization, `Bearer ${local.env.SERVICE_ROLE_KEY}`);
  }
});

test('已有用户超过一页时不重复创建测试账号', async () => {
  const users = Array.from({ length: 1000 }, (_, index) => ({
    id: `existing-${index}`,
    email: `user-${index}@example.test`
  }));
  users.push({ id: 'existing-designer', email: developmentAccounts[0].email });
  const { accounts, calls, request } = gotrue(users);
  await seedDevelopmentAccounts(local, request);
  assert.equal(calls.filter(call => call.method === 'GET').length, 2);
  assert.equal(calls.filter(call => call.method === 'POST').length, developmentAccounts.length - 1);
  assert.equal(accounts.find(user => user.email === developmentAccounts[0].email).id, 'existing-designer');
});

test('管理接口出错时停止准备并报出状态', async () => {
  const calls = [];
  const failing = async (url, init = {}) => {
    calls.push(init.method ?? 'GET');
    return Response.json({ msg: 'Auth unavailable' }, { status: 503 });
  };
  await assert.rejects(seedDevelopmentAccounts(local, failing), /503/);
  assert.deepEqual(calls, ['GET']);
});

test('只往本机 Supabase 写测试账号', async () => {
  const { calls, request } = gotrue();
  for (const url of ['https://example.supabase.co', 'http://192.168.1.20:54421'])
    await assert.rejects(seedDevelopmentAccounts({ ...local, url }, request), /本机/);
  assert.equal(calls.length, 0);
});
