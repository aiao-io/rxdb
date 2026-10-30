import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startSupabaseOAuth } from './supabase-oauth.mjs';

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
  await assert.rejects(startSupabaseOAuth(new Request('https://media.example.com/api/supabase/oauth/start'), { ...env, SUPABASE_OAUTH_COOKIE_SECRET: '' }), /尚未配置/);
});
