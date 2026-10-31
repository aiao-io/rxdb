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
async function sealedConnection(env, connection) {
  return seal(env, {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt,
    ...(connection.email ? { email: connection.email } : {})
  });
}
function responseHtml(origin, extraHeaders = []) {
  const returnUrl = `${origin}/providers?supabase_oauth=complete`;
  const bodyText = `<!doctype html><meta charset="utf-8"><title>Supabase 已连接</title><script>if(window.opener){window.opener.postMessage({type:'aiao-supabase-oauth-complete'},${JSON.stringify(origin)});window.close()}else{location.replace(${JSON.stringify(returnUrl)})}</script><p>Supabase 已连接，可以关闭此窗口。</p>`;
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
export function managementPermissionMessage(path) {
  if (path === '/projects')
    return '无法读取 Supabase 项目列表。请在 OAuth App 启用 Projects Read（projects:read）并重新授权；如果已启用，请确认当前账号可访问目标组织。';
  if (path.includes('/database/query'))
    return '无法写入 Supabase 项目数据库。请在 OAuth App 启用 Database Write（database:write）并重新授权，同时确认当前账号拥有该项目的管理权限。';
  if (path.includes('/api-keys'))
    return '无法读取 Supabase 项目 Key。请在 OAuth App 启用 Secrets Read（secrets:read）并重新授权，同时确认当前账号拥有该项目的管理权限。';
  return 'Supabase 管理账号没有此项目的操作权限，请确认当前账号属于项目所在组织并拥有项目管理权限。';
}
function managementUnauthorizedMessage(path) {
  if (path.includes('/database/query'))
    return 'Supabase 拒绝执行数据库初始化（401）。请确认当前账号是目标项目的 Owner 或 Administrator，项目处于运行状态；OAuth App 的 Database Write（database:write）不能提升账号本身的项目权限。';
  if (path.includes('/api-keys'))
    return 'Supabase 拒绝读取项目 Key（401）。请确认当前账号是目标项目的 Owner 或 Administrator，项目处于运行状态；OAuth App 的 Secrets Read（secrets:read）不能提升账号本身的项目权限。';
  if (path === '/profile') return 'Supabase 管理账号资料读取失败（401）。请重新授权，并确认当前账号可以访问目标组织。';
  return 'Supabase 管理授权已失效，请重新连接。';
}
export function profileEmail(profile) {
  const email = profile?.primary_email ?? profile?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}
export function accessTokenEmail(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    return profileEmail(payload);
  } catch {
    return null;
  }
}
export async function management(request, token, path, init = {}) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(init.headers ?? {})
  };
  const result = await fetch(`${oauthApi}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });
  if (result.status >= 300 && result.status < 400) reject(502, 'Supabase 管理接口禁止重定向。');
  if (!result.ok) {
    const detail = await result.clone().json().catch(() => ({}));
    const code = typeof detail?.code === 'string' ? detail.code.slice(0, 80) : null;
    console.warn('Supabase 管理接口请求失败', { path, status: result.status, code });
    await result.body?.cancel();
    if (result.status === 401) reject(401, managementUnauthorizedMessage(path));
    if (result.status === 403) reject(403, managementPermissionMessage(path));
    if (result.status === 404) reject(404, 'Supabase 管理接口找不到目标项目或操作。');
    if (result.status === 429) reject(429, 'Supabase 管理接口请求过于频繁，请稍后重试。');
    if (path.includes('/database/query'))
      reject(502, 'Supabase 项目数据库初始化失败，目标项目可能已有冲突对象或 SQL 与项目状态不兼容。请使用独立空项目并审阅初始化 SQL。');
    if (path.includes('/api-keys')) reject(502, 'Supabase 项目 Key 读取失败，请确认项目状态正常后重试。');
    reject(502, 'Supabase 管理接口暂时不可用，请稍后重试。');
  }
  return result.status === 204 || !result.body ? null : result.json();
}
async function refreshManagementToken(env, connection) {
  if (typeof connection.refreshToken !== 'string') return false;
  const config = configured(env);
  const result = await fetch(`${oauthApi}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refreshToken }),
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });
  if (!result.ok) {
    await result.body?.cancel();
    return false;
  }
  const tokens = await result.json();
  if (typeof tokens.access_token !== 'string') return false;
  connection.accessToken = tokens.access_token;
  if (typeof tokens.refresh_token === 'string') connection.refreshToken = tokens.refresh_token;
  connection.expiresAt = Date.now() + Math.min(Number(tokens.expires_in ?? 3600), 3600) * 1000;
  connection.refreshed = true;
  return true;
}
export async function managementForConnection(request, env, connection, path, init = {}) {
  try {
    return await management(request, connection.accessToken, path, init);
  } catch (error) {
    if (error?.status !== 401 || !(await refreshManagementToken(env, connection))) throw error;
    return management(request, connection.accessToken, path, init);
  }
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
  return result.status === 204 || !result.body ? null : result.json();
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
  const email = profileEmail(tokens) ?? profileEmail(tokens.user) ?? accessTokenEmail(tokens.access_token);
  const connection = await sealedConnection(env, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Math.min(Number(tokens.expires_in ?? 3600), 3600) * 1000,
    ...(email ? { email } : {})
  });
  return responseHtml(state.origin, [
    ['set-cookie', clearCookie(stateCookie)],
    ['set-cookie', cookie(connectionCookie, connection, 3600)]
  ]);
}
export async function listSupabaseProjects(request, env, suppliedConnection) {
  const connection = suppliedConnection ?? (await managementConnection(request, env));
  const projects = await managementForConnection(request, env, connection, '/projects');
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
export async function initializeSupabaseProject(request, env, suppliedConnection) {
  const connection = suppliedConnection ?? (await managementConnection(request, env));
  const value = fields(await body(request, 8192), ['projectRef', 'email']);
  if (typeof value.projectRef !== 'string' || !/^[a-z]{20}$/.test(value.projectRef))
    reject(400, 'Supabase 项目标识无效。');
  const requestedEmail = value.email === undefined ? null : profileEmail({ email: value.email });
  if (value.email !== undefined && !requestedEmail) reject(400, '项目身份邮箱格式无效。');
  const projects = await managementForConnection(request, env, connection, '/projects');
  const project = projects.find(item => (item.ref ?? item.id) === value.projectRef);
  if (!project) reject(404, '该项目不在当前授权范围内。');
  const initSql =
    env.MEDIA_SUPABASE_AUTOINIT_SQL ||
    (env.MEDIA_SUPABASE_AUTOINIT_SQL_B64 ? new TextDecoder().decode(decode(env.MEDIA_SUPABASE_AUTOINIT_SQL_B64)) : '');
  if (!initSql) reject(503, '自动初始化 SQL 尚未配置，项目未修改。');
  const keys = await managementForConnection(request, env, connection, `/projects/${value.projectRef}/api-keys?reveal=true`);
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
  let profile;
  try {
    profile = await managementForConnection(request, env, connection, '/profile');
  } catch (error) {
    if (error?.status !== 401) throw error;
    profile = { primary_email: connection.email ?? accessTokenEmail(connection.accessToken) };
  }
  const email = profileEmail(profile) ?? requestedEmail ?? connection.email ?? accessTokenEmail(connection.accessToken);
  if (!email)
    reject(409, 'Supabase 管理 API 未返回账号邮箱。请输入刚才授权的 Supabase 账号邮箱后重试。');
  await managementForConnection(request, env, connection, `/projects/${value.projectRef}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: initSql, read_only: false })
  });
  const config = { url: `https://${value.projectRef}.supabase.co`, anonKey: publicKey };
  const link = await projectRequest(config, '/auth/v1/admin/generate_link', serviceKey, {
    method: 'POST',
    body: JSON.stringify({
      type: 'magiclink',
      email,
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
      if (path === '/projects' && request.method === 'GET') {
        const connection = await managementConnection(request, env);
        const result = await listSupabaseProjects(request, env, connection);
        const headers = new Headers({ 'cache-control': 'no-store' });
        if (connection.refreshed)
          headers.set('set-cookie', cookie(connectionCookie, await sealedConnection(env, connection), 3600));
        return Response.json(result, { headers });
      }
      if (path === '/initialize' && request.method === 'POST') {
        const connection = await managementConnection(request, env);
        const result = await initializeSupabaseProject(request, env, connection);
        const headers = new Headers({ 'cache-control': 'no-store' });
        if (connection.refreshed)
          headers.set('set-cookie', cookie(connectionCookie, await sealedConnection(env, connection), 3600));
        return Response.json(result, { headers });
      }
      if (path === '/revoke' && request.method === 'POST') return await revokeSupabaseOAuth(request, env);
      reject(404, 'Supabase 授权接口不存在。');
    } catch (error) {
      return endpoint(() => {
        throw error;
      });
    }
  })();
}
