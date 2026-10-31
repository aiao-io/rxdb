import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  management,
  managementForConnection,
  managementPermissionMessage,
  accessTokenEmail,
  initializeSupabaseProject,
  profileEmail,
  startSupabaseOAuth
} from './supabase-oauth.mjs';

const env = {
  SUPABASE_OAUTH_CLIENT_ID: 'client-id',
  SUPABASE_OAUTH_CLIENT_SECRET: 'client-secret',
  SUPABASE_OAUTH_COOKIE_SECRET: 'a'.repeat(40),
  SUPABASE_OAUTH_REDIRECT_URI: 'https://media.example.com/api/supabase/oauth/callback'
};
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
      management(new Request('https://media.example.com/api/supabase/oauth/initialize'), 'token', '/projects/ref/database/query'),
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
      management(new Request('https://media.example.com/api/supabase/oauth/initialize'), 'token', '/projects/ref/database/query'),
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
  assert.equal(accessTokenEmail(`${encode({ alg: 'none' })}.${encode({ email: 'owner@example.com' })}.signature`), 'owner@example.com');
  assert.equal(accessTokenEmail('opaque-access-token'), null);
});
test('OAuth management refreshes an expired access token before retrying', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    if (calls.length === 1) return new Response(null, { status: 401 });
    if (calls.length === 2)
      return new Response(JSON.stringify({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 900 }), {
        headers: { 'content-type': 'application/json' }
      });
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
    assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'GET']);
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
      return new Response(JSON.stringify([{ type: 'publishable', api_key: 'anon' }, { type: 'service_role', api_key: 'service' }]), {
        headers: { 'content-type': 'application/json' }
      });
    if (value === 'https://api.supabase.com/v1/profile') return new Response(null, { status: 401 });
    if (value.includes('/database/query')) return new Response(null, { status: 201 });
    if (value.endsWith('/auth/v1/admin/generate_link'))
      return new Response(JSON.stringify({ properties: { hashed_token: 'hash' } }), {
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
      { ...env, MEDIA_SUPABASE_AUTOINIT_SQL: 'select 1' },
      { accessToken: token, expiresAt: Date.now() + 3600000 }
    );
    assert.equal(result.initialized, true);
    assert.equal(calls.some(call => call.url === 'https://api.supabase.com/v1/profile'), true);
    assert.equal(calls.some(call => call.url.includes('/database/query')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
