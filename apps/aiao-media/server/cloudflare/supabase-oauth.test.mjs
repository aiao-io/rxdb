import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessTokenEmail,
  handleSupabaseOAuth,
  initializeSupabaseProject,
  isAutoinitBundle,
  management,
  managementForConnection,
  managementPermissionMessage,
  profileEmail,
  startSupabaseOAuth
} from './supabase-oauth.mjs';

const env = {
  SUPABASE_OAUTH_CLIENT_ID: 'client-id',
  SUPABASE_OAUTH_CLIENT_SECRET: 'client-secret',
  SUPABASE_OAUTH_COOKIE_SECRET: 'a'.repeat(40),
  SUPABASE_OAUTH_REDIRECT_URI: 'https://media.example.com/api/supabase/oauth/callback'
};
/** 与 build-supabase-autoinit.mjs 的产物同形：固定标题、整体事务、专用项目守卫。 */
const bundle = [
  '-- Aiao Media automatic Supabase onboarding bundle.',
  'BEGIN;',
  'DO $aiao_media_autoinit_guard$ BEGIN END $aiao_media_autoinit_guard$;',
  'select 1;',
  'COMMIT;',
  ''
].join('\n');
/** 模拟随部署发布的静态资源绑定；缺失的资源由 SPA 回退返回 HTML，与线上行为一致。 */
const assetsFor = (body = bundle, status = 200) => ({
  requests: [],
  async fetch(request) {
    this.requests.push(request);
    return new Response(body, {
      status,
      headers: { 'content-type': status === 200 ? 'application/sql' : 'text/plain' }
    });
  }
});
const spaFallback = '<!doctype html><title>Aiao Media</title><app-root></app-root>';
test('OAuth start uses PKCE, fixed redirect and HttpOnly state cookie without exposing secrets', async () => {
  const response = await startSupabaseOAuth(new Request('https://media.example.com/api/supabase/oauth/start'), env);
  const data = await response.json();
  const url = new URL(data.url);
  assert.equal(url.origin, 'https://api.supabase.com');
  assert.equal(url.pathname, '/v1/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), env.SUPABASE_OAUTH_REDIRECT_URI);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]+$/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(data), /client-secret|cookie/);
});
test('OAuth start refuses an incomplete deployment configuration', async () => {
  await assert.rejects(
    startSupabaseOAuth(new Request('https://media.example.com/api/supabase/oauth/start'), {
      ...env,
      SUPABASE_OAUTH_COOKIE_SECRET: ''
    }),
    /尚未配置/
  );
});
test('OAuth management permission errors identify the missing operation scope', () => {
  assert.match(managementPermissionMessage('/projects'), /Projects Read/);
  assert.match(managementPermissionMessage('/projects/abcdefghijklmnopqrst/database/query'), /Database Write/);
  assert.match(managementPermissionMessage('/projects/abcdefghijklmnopqrst/api-keys?reveal=true'), /Secrets Read/);
  assert.match(managementPermissionMessage('/profile'), /项目管理权限/);
});
test('OAuth management maps a forbidden database operation to its required scope', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 403 });
  try {
    await assert.rejects(
      management(
        new Request('https://media.example.com/api/supabase/oauth/initialize'),
        'token',
        '/projects/ref/database/query'
      ),
      error => error?.status === 403 && /Database Write/.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('OAuth management maps an unauthorized database operation to its required scope', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    await assert.rejects(
      management(
        new Request('https://media.example.com/api/supabase/oauth/initialize'),
        'token',
        '/projects/ref/database/query'
      ),
      error => error?.status === 401 && /Database Write/.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('OAuth project identity uses the current Supabase profile email field', () => {
  assert.equal(profileEmail({ primary_email: 'owner@example.com' }), 'owner@example.com');
  assert.equal(profileEmail({ email: 'legacy@example.com' }), 'legacy@example.com');
  assert.equal(profileEmail({ primary_email: 'invalid' }), null);
});
test('OAuth project identity can read an email claim from a validated JWT access token', () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.equal(
    accessTokenEmail(`${encode({ alg: 'none' })}.${encode({ email: 'owner@example.com' })}.signature`),
    'owner@example.com'
  );
  assert.equal(accessTokenEmail('opaque-access-token'), null);
});
test('OAuth management refreshes an expired access token before retrying', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    if (calls.length === 1) return new Response(null, { status: 401 });
    if (calls.length === 2)
      return new Response(
        JSON.stringify({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 900 }),
        {
          headers: { 'content-type': 'application/json' }
        }
      );
    return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const connection = { accessToken: 'expired-access', refreshToken: 'refresh', expiresAt: Date.now() - 1 };
    const result = await managementForConnection(
      new Request('https://media.example.com/api/supabase/oauth/projects'),
      env,
      connection,
      '/projects'
    );
    assert.deepEqual(result, []);
    assert.equal(connection.accessToken, 'refreshed-access');
    assert.equal(connection.refreshToken, 'refreshed-refresh');
    assert.equal(connection.refreshed, true);
    assert.deepEqual(
      calls.map(call => call.method),
      ['GET', 'POST', 'GET']
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('OAuth initialization continues when profile is unauthorized but the validated token contains an email', async () => {
  const originalFetch = globalThis.fetch;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ email: 'owner@example.com' })}.signature`;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const value = String(url);
    calls.push({ url: value, method: init?.method ?? 'GET' });
    if (value === 'https://api.supabase.com/v1/projects')
      return new Response(JSON.stringify([{ ref: 'abcdefghijklmnopqrst', name: 'Media', organization_id: 'org' }]), {
        headers: { 'content-type': 'application/json' }
      });
    if (value.includes('/api-keys?reveal=true'))
      return new Response(
        JSON.stringify([
          { type: 'publishable', api_key: 'anon' },
          { type: 'service_role', api_key: 'service' }
        ]),
        {
          headers: { 'content-type': 'application/json' }
        }
      );
    if (value === 'https://api.supabase.com/v1/profile') return new Response(null, { status: 401 });
    if (value.includes('/database/query')) return new Response(null, { status: 201 });
    if (value.endsWith('/auth/v1/admin/generate_link'))
      return new Response(JSON.stringify({ hashed_token: 'hash', verification_type: 'magiclink' }), {
        headers: { 'content-type': 'application/json' }
      });
    if (value.endsWith('/auth/v1/verify'))
      return new Response(JSON.stringify({ access_token: 'project-access', refresh_token: 'project-refresh' }), {
        headers: { 'content-type': 'application/json' }
      });
    throw new Error(`unexpected fetch: ${value}`);
  };
  try {
    const result = await initializeSupabaseProject(
      new Request('https://media.example.com/api/supabase/oauth/initialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectRef: 'abcdefghijklmnopqrst' })
      }),
      { ...env, ASSETS: assetsFor() },
      { accessToken: token, expiresAt: Date.now() + 3600000 }
    );
    assert.equal(result.initialized, true);
    assert.equal(
      calls.some(call => call.url === 'https://api.supabase.com/v1/profile'),
      true
    );
    assert.equal(
      calls.some(call => call.url.includes('/database/query')),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('OAuth initialization never turns a browser-supplied email into a project session', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const value = String(url);
    calls.push({ url: value, method: init?.method ?? 'GET', body: init?.body });
    if (value === 'https://api.supabase.com/v1/projects')
      return new Response(JSON.stringify([{ ref: 'abcdefghijklmnopqrst', name: 'Media', organization_id: 'org' }]), {
        headers: { 'content-type': 'application/json' }
      });
    if (value.includes('/api-keys?reveal=true'))
      return new Response(
        JSON.stringify([
          { type: 'publishable', api_key: 'anon' },
          { type: 'service_role', api_key: 'service' }
        ]),
        {
          headers: { 'content-type': 'application/json' }
        }
      );
    if (value === 'https://api.supabase.com/v1/profile') return new Response(null, { status: 401 });
    if (value.includes('/database/query')) return new Response(null, { status: 201 });
    if (value.endsWith('/auth/v1/admin/generate_link'))
      return new Response(JSON.stringify({ hashed_token: 'hash', verification_type: 'magiclink' }), {
        headers: { 'content-type': 'application/json' }
      });
    if (value.endsWith('/auth/v1/verify'))
      return new Response(JSON.stringify({ access_token: 'project-access', refresh_token: 'project-refresh' }), {
        headers: { 'content-type': 'application/json' }
      });
    throw new Error(`unexpected fetch: ${value}`);
  };
  const initialize = payload =>
    initializeSupabaseProject(
      new Request('https://media.example.com/api/supabase/oauth/initialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      { ...env, ASSETS: assetsFor() },
      { accessToken: 'opaque-access', expiresAt: Date.now() + 3600000 }
    );
  try {
    await assert.rejects(
      initialize({ projectRef: 'abcdefghijklmnopqrst', email: 'victim@example.com' }),
      error => error?.status === 400
    );
    assert.deepEqual(calls, [], 'a supplied email is refused before any management or project request');

    const result = await initialize({ projectRef: 'abcdefghijklmnopqrst' });
    assert.equal(result.initialized, true);
    assert.equal(result.session, null);
    assert.deepEqual(result.config, { url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'anon' });
    assert.equal(JSON.parse(calls.find(call => call.url.includes('/database/query')).body).query, bundle);
    assert.equal(
      calls.some(call => call.url.includes('/auth/v1/')),
      false,
      'without a Supabase-verified account email no project user is created or verified'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const oauthEnv = { ...env, ASSETS: assetsFor() };
const send = (path, init, target = oauthEnv) =>
  handleSupabaseOAuth(new Request(`https://media.example.com/api/supabase/oauth${path}`, init), target);
const post = (path, cookie, payload, target) =>
  send(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload)
    },
    target
  );
const cookieOf = response =>
  response.headers
    .getSetCookie()
    .map(line => line.split(';')[0])
    .find(pair => pair.startsWith('aiao_supabase_management='));

/**
 * 模拟 Supabase 管理接口：刷新令牌一次性有效且刷新后旧访问令牌作废，/profile 对 OAuth 令牌恒为 401。
 * accountEmail 模拟令牌响应里带回了 Supabase 账号邮箱（唯一可信的项目身份来源）。
 */
function rotatingManagement({
  databaseStatus = 201,
  databaseError = null,
  verificationType = 'signup',
  accountEmail = null
} = {}) {
  const originalFetch = globalThis.fetch;
  const double = {
    access: new Set(['access-1']),
    refresh: new Set(['refresh-1']),
    generation: 1,
    refreshGrants: 0,
    urls: [],
    queries: []
  };
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const rotate = () => {
    double.generation += 1;
    double.access = new Set([`access-${double.generation}`]);
    double.refresh.add(`refresh-${double.generation}`);
    return json({
      access_token: `access-${double.generation}`,
      refresh_token: `refresh-${double.generation}`,
      expires_in: 3600
    });
  };
  globalThis.fetch = async (url, init) => {
    const value = String(url);
    double.urls.push(value);
    const bearer = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
    if (value === 'https://api.supabase.com/v1/oauth/token') {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'authorization_code')
        return json({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          ...(accountEmail ? { user: { email: accountEmail } } : {})
        });
      double.refreshGrants += 1;
      return double.refresh.delete(form.get('refresh_token')) ? rotate() : new Response(null, { status: 400 });
    }
    if (value === 'https://api.supabase.com/v1/profile') return new Response(null, { status: 401 });
    if (value.startsWith('https://api.supabase.com/v1/') && !double.access.has(bearer))
      return new Response(null, { status: 401 });
    if (value === 'https://api.supabase.com/v1/projects')
      return json([{ ref: 'abcdefghijklmnopqrst', name: 'Media', organization_id: 'org' }]);
    if (value.includes('/api-keys?reveal=true'))
      return json([
        { type: 'publishable', api_key: 'anon' },
        { type: 'service_role', api_key: 'service' }
      ]);
    if (value.includes('/database/query')) {
      double.queries.push(JSON.parse(init.body).query);
      return databaseError ? json(databaseError, databaseStatus) : new Response(null, { status: databaseStatus });
    }
    if (value.endsWith('/auth/v1/admin/generate_link'))
      return json({
        hashed_token: 'hash',
        verification_type: verificationType,
        action_link: 'https://project.example/verify'
      });
    if (value.endsWith('/auth/v1/verify')) {
      const { token_hash: hash, type } = JSON.parse(init.body);
      return hash === 'hash' && type === verificationType ?
          json({ access_token: 'project-access', refresh_token: 'project-refresh' })
        : new Response(JSON.stringify({ error_code: 'otp_expired' }), { status: 403 });
    }
    throw new Error(`unexpected fetch: ${value}`);
  };
  return Object.assign(double, {
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  });
}

async function authorize() {
  const started = await send('/start');
  const state = new URL((await started.json()).url).searchParams.get('state');
  const stateCookie = started.headers.getSetCookie()[0].split(';')[0];
  const cookie = cookieOf(await send(`/callback?code=code&state=${state}`, { headers: { cookie: stateCookie } }));
  assert.ok(cookie, 'the callback stores the management connection');
  return cookie;
}

test('OAuth initialization without a Supabase-verified account email initializes the project but issues no session', async () => {
  const double = rotatingManagement();
  try {
    const cookie = await authorize();
    const response = await post('/initialize', cookie, { projectRef: 'abcdefghijklmnopqrst' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.initialized, true);
    assert.equal(result.session, null);
    assert.equal(
      double.urls.some(url => url.includes('/auth/v1/')),
      false
    );
    assert.equal(
      double.refreshGrants,
      0,
      'a profile 401 is not an expired token and must not rotate the refresh token'
    );
  } finally {
    double.restore();
  }
});
for (const [marker, message] of [
  ['project is not empty and was not initialized by this application', /不属于本应用/],
  ['project schema is newer than this application', /更新版本/]
]) {
  test(`OAuth initialization reports a dedicated-project guard refusal (${marker}) without creating a project user`, async () => {
    const double = rotatingManagement({
      databaseStatus: 400,
      databaseError: { message: `Failed to run sql query: ERROR:  55006: Refusing automatic onboarding: ${marker}` },
      accountEmail: 'owner@example.com'
    });
    try {
      const response = await post('/initialize', await authorize(), { projectRef: 'abcdefghijklmnopqrst' });
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, message);
      assert.equal(
        double.urls.some(url => url.includes('/auth/v1/')),
        false
      );
    } finally {
      double.restore();
    }
  });
}
test('OAuth failures after a token refresh still return the rotated management cookie', async () => {
  const double = rotatingManagement({ databaseStatus: 403 });
  try {
    let cookie = await authorize();
    double.access.clear();
    const failed = await post('/initialize', cookie, { projectRef: 'abcdefghijklmnopqrst' });
    assert.equal(failed.status, 403);
    assert.equal(double.refreshGrants, 1);
    cookie = cookieOf(failed) ?? cookie;
    assert.equal((await send('/projects', { headers: { cookie } })).status, 200);
    assert.equal(
      double.refreshGrants,
      1,
      'the retry must reuse the rotated tokens instead of refreshing a consumed one'
    );
  } finally {
    double.restore();
  }
});
for (const verificationType of ['signup', 'magiclink']) {
  test(`OAuth initialization reads the one-time link and verifies it with the returned ${verificationType} type`, async () => {
    const double = rotatingManagement({ verificationType, accountEmail: 'owner@example.com' });
    try {
      const cookie = await authorize();
      const response = await post('/initialize', cookie, { projectRef: 'abcdefghijklmnopqrst' });
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys((await response.json()).session).sort(), ['access_token', 'refresh_token']);
    } finally {
      double.restore();
    }
  });
}

test('OAuth status reports availability only when credentials, cookie secret and onboarding SQL are all deployed', async () => {
  const status = async (overrides = {}, assets = assetsFor()) => {
    const response = await send('/status', undefined, { ...env, ASSETS: assets, ...overrides });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.doesNotMatch(JSON.stringify(body), /client-id|client-secret|aaaa/, 'the probe never echoes configuration');
    return body;
  };
  assert.deepEqual(await status(), { available: true });
  for (const name of ['SUPABASE_OAUTH_CLIENT_ID', 'SUPABASE_OAUTH_CLIENT_SECRET', 'SUPABASE_OAUTH_REDIRECT_URI'])
    assert.deepEqual(await status({ [name]: '' }), { available: false }, `${name} missing`);
  assert.deepEqual(await status({ SUPABASE_OAUTH_COOKIE_SECRET: 'too-short' }), { available: false });
  assert.deepEqual(await status({}, assetsFor(spaFallback)), { available: false }, 'SPA fallback HTML is not SQL');
  assert.deepEqual(await status({}, assetsFor('', 404)), { available: false });
  assert.deepEqual(await status({ ASSETS: undefined }), { available: false });
});
test('OAuth status is a read-only GET', async () => {
  assert.equal((await send('/status', { method: 'POST' })).status, 404);
});
test('OAuth initialization runs the onboarding SQL shipped with the deployment without forwarding the management cookie', async () => {
  const double = rotatingManagement();
  const assets = assetsFor();
  try {
    const response = await post(
      '/initialize',
      await authorize(),
      { projectRef: 'abcdefghijklmnopqrst' },
      { ...oauthEnv, ASSETS: assets }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(double.queries, [bundle], 'the Management API receives exactly the bundled SQL');
    assert.equal(assets.requests.length, 1);
    const [request] = assets.requests;
    assert.equal(request.url, 'https://media.example.com/supabase-autoinit.sql');
    assert.equal(request.headers.get('cookie'), null, 'the management cookie never reaches the asset binding');
    assert.equal(request.headers.get('authorization'), null);
  } finally {
    double.restore();
  }
});
for (const [label, assets] of [
  ['an SPA fallback page', assetsFor(spaFallback)],
  ['a missing asset', assetsFor('', 404)],
  ['no asset binding', undefined],
  ['a bundle without the dedicated-project guard', assetsFor(bundle.replaceAll('$aiao_media_autoinit_guard$', '$x$'))]
]) {
  test(`OAuth initialization refuses before any write when the deployment has ${label} instead of the onboarding SQL`, async () => {
    const double = rotatingManagement();
    try {
      const response = await post(
        '/initialize',
        await authorize(),
        { projectRef: 'abcdefghijklmnopqrst' },
        { ...oauthEnv, ASSETS: assets }
      );
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /自动初始化 SQL 尚未配置/);
      assert.deepEqual(double.queries, [], 'nothing is executed on the project');
      assert.equal(
        double.urls.some(url => url.includes('/api-keys') || url.includes('/auth/v1/')),
        false,
        'neither project keys nor a project session are touched'
      );
    } finally {
      double.restore();
    }
  });
}
test('onboarding bundle validation accepts only a complete guarded transaction', () => {
  assert.equal(isAutoinitBundle(bundle), true);
  assert.equal(isAutoinitBundle(spaFallback), false);
  assert.equal(isAutoinitBundle(bundle.replace('COMMIT;\n', '')), false, 'truncated before COMMIT');
  assert.equal(isAutoinitBundle(bundle.replaceAll('BEGIN;', '')), false, 'not wrapped in one transaction');
  assert.equal(isAutoinitBundle(bundle.replaceAll('$aiao_media_autoinit_guard$', '$x$')), false, 'no project guard');
  assert.equal(isAutoinitBundle(bundle.replace('onboarding bundle', 'something else')), false, 'unknown header');
  assert.equal(isAutoinitBundle(undefined), false);
});
