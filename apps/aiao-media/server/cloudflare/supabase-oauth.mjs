import { body, endpoint, fields, originAllowed, reject } from './product-http.mjs';

const stateCookie = 'aiao_supabase_oauth_state';
const connectionCookie = 'aiao_supabase_management';
const oauthApi = 'https://api.supabase.com/v1';
const maxAge = 600;
const base64 = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = value =>
  Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)),
    char => char.charCodeAt(0)
  );
const random = (size = 32) => base64(crypto.getRandomValues(new Uint8Array(size)));

async function cryptoKey(env) {
  if (!env.SUPABASE_OAUTH_COOKIE_SECRET || env.SUPABASE_OAUTH_COOKIE_SECRET.length < 32)
    reject(503, 'Supabase 授权服务尚未配置。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SUPABASE_OAUTH_COOKIE_SECRET));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cryptoKey(env),
    new TextEncoder().encode(JSON.stringify(value))
  );
  return `${base64(iv)}.${base64(encrypted)}`;
}
async function unseal(env, value) {
  try {
    const [iv, encrypted] = String(value).split('.');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(iv) },
      await cryptoKey(env),
      decode(encrypted)
    );
    const result = JSON.parse(new TextDecoder().decode(plain));
    if (!result || typeof result !== 'object' || result.expiresAt < Date.now()) throw new Error();
    return result;
  } catch {
    reject(401, 'Supabase 授权已过期，请重新连接。');
  }
}
function cookie(name, value, maxAgeValue = maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeValue}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie(name) {
  return cookie(name, '', 0);
}
function responseHtml(origin, extraHeaders = []) {
  const bodyText = `<!doctype html><meta charset="utf-8"><title>Supabase 已连接</title><script>window.opener?.postMessage({type:'aiao-supabase-oauth-complete'},${JSON.stringify(origin)});window.close();</script><p>Supabase 已连接，可以关闭此窗口。</p>`;
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`
  });
  for (const [name, value] of extraHeaders) headers.append(name, value);
  return new Response(bodyText, { headers });
}
function configured(env) {
  if (!env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET || !env.SUPABASE_OAUTH_REDIRECT_URI)
    reject(503, 'Supabase OAuth 尚未配置。');
  return {
    clientId: env.SUPABASE_OAUTH_CLIENT_ID,
    clientSecret: env.SUPABASE_OAUTH_CLIENT_SECRET,
    redirectUri: env.SUPABASE_OAUTH_REDIRECT_URI
  };
}
async function management(request, token, path, init = {}) {
  const result = await fetch(`${oauthApi}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });
  if (result.status >= 300 && result.status < 400) reject(502, 'Supabase 管理接口禁止重定向。');
  if (!result.ok) {
    await result.body?.cancel();
    reject(result.status === 403 ? 403 : 502, 'Supabase 管理授权不允许此项目操作。');
  }
  return result.status === 204 ? null : result.json();
}
async function managementConnection(request, env) {
  const value = request.headers.get('cookie')?.match(new RegExp(`${connectionCookie}=([^;]+)`))?.[1];
  if (!value) reject(401, '请先连接 Supabase。');
  return unseal(env, decodeURIComponent(value));
}
async function projectRequest(config, path, key, init = {}) {
  const result = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers ?? {})
    },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });
  if (!result.ok) {
    await result.body?.cancel();
    reject(502, '目标 Supabase 项目身份引导失败。');
  }
  return result.status === 204 ? null : result.json();
}
export async function startSupabaseOAuth(request, env) {
  const config = configured(env),
    origin = new URL(request.url).origin;
  if (request.headers.get('origin') && !originAllowed(request, env)) reject(403, '仅允许同源授权。');
  const verifier = random(48),
    challenge = base64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
    state = random(32);
  const url = new URL(`${oauthApi}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();
  return new Response(JSON.stringify({ url: url.href }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': cookie(
        stateCookie,
        await seal(env, { state, verifier, origin, expiresAt: Date.now() + maxAge * 1000 })
      )
    }
  });
}
export async function finishSupabaseOAuth(request, env) {
  const config = configured(env),
    url = new URL(request.url),
    stateValue = request.headers.get('cookie')?.match(new RegExp(`${stateCookie}=([^;]+)`))?.[1];
  if (!stateValue || !url.searchParams.get('code') || !url.searchParams.get('state'))
    return responseHtml(url.origin, [['set-cookie', clearCookie(stateCookie)]]);
  const state = await unseal(env, decodeURIComponent(stateValue));
  if (state.state !== url.searchParams.get('state')) reject(400, 'Supabase 授权状态无效。');
  const result = await fetch(`${oauthApi}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      redirect_uri: config.redirectUri,
      code_verifier: state.verifier
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  });
  if (!result.ok) return responseHtml(state.origin, [['set-cookie', clearCookie(stateCookie)]]);
  const tokens = await result.json();
  if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string')
    return responseHtml(state.origin, [['set-cookie', clearCookie(stateCookie)]]);
  const connection = await seal(env, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Math.min(Number(tokens.expires_in ?? 3600), 3600) * 1000
  });
  return responseHtml(state.origin, [
    ['set-cookie', clearCookie(stateCookie)],
    ['set-cookie', cookie(connectionCookie, connection, 3600)]
  ]);
}
export async function listSupabaseProjects(request, env) {
  const connection = await managementConnection(request, env);
  const projects = await management(request, connection.accessToken, '/projects');
  return {
    projects:
      Array.isArray(projects) ?
        projects.map(project => ({
          id: project.id ?? project.ref,
          ref: project.ref ?? project.id,
          name: project.name ?? '',
          organizationId: project.organization_id ?? null,
          status: project.status ?? null
        }))
      : []
  };
}
export async function initializeSupabaseProject(request, env) {
  const connection = await managementConnection(request, env);
  const value = fields(await body(request, 8192), ['projectRef']);
  if (typeof value.projectRef !== 'string' || !/^[a-z]{20}$/.test(value.projectRef))
    reject(400, 'Supabase 项目标识无效。');
  const projects = await management(request, connection.accessToken, '/projects');
  const project = projects.find(item => (item.ref ?? item.id) === value.projectRef);
  if (!project) reject(404, '该项目不在当前授权范围内。');
  if (!env.MEDIA_SUPABASE_AUTOINIT_SQL) reject(503, '自动初始化 SQL 尚未配置，项目未修改。');
  await management(request, connection.accessToken, `/projects/${value.projectRef}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: env.MEDIA_SUPABASE_AUTOINIT_SQL, read_only: false })
  });
  const keys = await management(request, connection.accessToken, `/projects/${value.projectRef}/api-keys?reveal=true`);
  const publicKey =
    Array.isArray(keys) ?
      keys.find(item => item.type === 'publishable' || item.name === 'anon' || item.name === 'publishable')?.api_key
    : null;
  const serviceKey =
    Array.isArray(keys) ?
      keys.find(item => item.name === 'service_role' || item.type === 'service_role' || item.type === 'secret')?.api_key
    : null;
  if (typeof publicKey !== 'string' || typeof serviceKey !== 'string')
    reject(502, '项目初始化完成，但未能读取公开项目 Key；没有返回管理密钥。');
  const profile = await management(request, connection.accessToken, '/profile');
  if (typeof profile?.email !== 'string' || !profile.email.includes('@'))
    reject(409, 'Supabase 管理账号没有可用于项目身份引导的邮箱。');
  const config = { url: `https://${value.projectRef}.supabase.co`, anonKey: publicKey };
  const link = await projectRequest(config, '/auth/v1/admin/generate_link', serviceKey, {
    method: 'POST',
    body: JSON.stringify({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: new URL(request.url).origin }
    })
  });
  const tokenHash = link?.properties?.hashed_token;
  if (typeof tokenHash !== 'string') reject(502, '项目身份引导未返回一次性链接。');
  const session = await projectRequest(config, '/auth/v1/verify', publicKey, {
    method: 'POST',
    body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' })
  });
  if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string')
    reject(502, '项目身份引导未返回会话。');
  return {
    project: { ref: value.projectRef, name: project.name ?? '', organizationId: project.organization_id ?? null },
    config,
    session,
    initialized: true,
    imageSyncRequiresConfirmation: true
  };
}
export async function revokeSupabaseOAuth(request, env) {
  const connection = await managementConnection(request, env);
  await fetch(`${oauthApi}/oauth/revoke`, {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ token: connection.refreshToken }),
    signal: AbortSignal.timeout(15000)
  }).catch(() => undefined);
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearCookie(connectionCookie), 'cache-control': 'no-store' }
  });
}
export function handleSupabaseOAuth(request, env) {
  return (async () => {
    try {
      const path = new URL(request.url).pathname.replace('/api/supabase/oauth', '');
      if (path === '/start' && request.method === 'GET') return await startSupabaseOAuth(request, env);
      if (path === '/callback' && request.method === 'GET') return await finishSupabaseOAuth(request, env);
      if (path === '/projects' && request.method === 'GET')
        return Response.json(await listSupabaseProjects(request, env), { headers: { 'cache-control': 'no-store' } });
      if (path === '/initialize' && request.method === 'POST')
        return Response.json(await initializeSupabaseProject(request, env), {
          headers: { 'cache-control': 'no-store' }
        });
      if (path === '/revoke' && request.method === 'POST') return await revokeSupabaseOAuth(request, env);
      reject(404, 'Supabase 授权接口不存在。');
    } catch (error) {
      return endpoint(() => {
        throw error;
      });
    }
  })();
}
