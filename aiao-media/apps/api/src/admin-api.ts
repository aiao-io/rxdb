import { manageCredits } from './credits-api.ts';
import { manageContent } from './product-content.ts';
import type { BackendClient } from './product-http.ts';
import {
  administrator,
  backend,
  body,
  endpoint,
  fields,
  ProductApiError,
  reject,
  sameOriginWrite,
  uuid
} from './product-http.ts';
import { reports } from './product-reports.ts';
import type { WorkerEnv } from './worker-env.ts';

type AuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  banned_until?: string;
};
type AccountState = { user_id: string; disabled: boolean; revision: number; auth_state: string };

const accountQueues = new Map<string, Promise<unknown>>();
const loginFailures = new Map<string, { count: number; resetAt: number; blockedUntil: number }>();
const loginWindowMs = 60_000;
const loginFailureLimit = 5;
const loginBlockMs = 60_000;

function loginKey(request: Request, email: string) {
  const source =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `${source}:${email.trim().toLowerCase()}`;
}
function checkLogin(key: string) {
  const now = Date.now();
  for (const [candidate, state] of loginFailures)
    if (state.resetAt <= now && state.blockedUntil <= now) loginFailures.delete(candidate);
  const state = loginFailures.get(key);
  if (state?.blockedUntil && state.blockedUntil > now) reject(429, '登录尝试过多，请稍后重试。');
}
function recordLoginFailure(key: string) {
  const now = Date.now();
  const state = loginFailures.get(key);
  const next =
    !state || state.resetAt <= now ?
      { count: 1, resetAt: now + loginWindowMs, blockedUntil: 0 }
    : { ...state, count: state.count + 1 };
  if (next.count >= loginFailureLimit) next.blockedUntil = now + loginBlockMs;
  loginFailures.set(key, next);
}
function clearLoginFailures(key: string) {
  loginFailures.delete(key);
}

function accountLock<T>(targetId: string, operation: () => Promise<T>) {
  const previous = accountQueues.get(targetId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  accountQueues.set(targetId, current);
  return current.finally(() => {
    if (accountQueues.get(targetId) === current) accountQueues.delete(targetId);
  });
}

function pageNumber(value: string | null, fallback: number, max: number) {
  const number = value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) reject(400, '分页参数无效。');
  return number;
}
async function users(client: BackendClient, url: URL, actorId: string) {
  const page = pageNumber(url.searchParams.get('page'), 1, 1000000);
  const perPage = pageNumber(url.searchParams.get('perPage'), 25, 100);
  const search = url.searchParams.get('search')?.trim();
  if (search && search.length > 254) reject(400, '搜索内容过长。');
  const result =
    search ?
      await client.call<{ users: AuthUser[]; total?: number }>('/rest/v1/rpc/media_admin_search_users', {
        method: 'POST',
        payload: { p_actor: actorId, p_query: search, p_page: page, p_limit: perPage }
      })
    : await client.call<{ users: AuthUser[]; total?: number }>(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
  if (!Array.isArray(result.users)) reject(502, '用户列表暂不可读。');
  const ids = result.users.map(user => user.id);
  if (!ids.every(uuid)) reject(502, '用户标识无效。');
  const states =
    ids.length ?
      await client.call<AccountState[]>(
        `/rest/v1/media_accounts?select=user_id,disabled,revision,auth_state&user_id=in.(${ids.join(',')})`
      )
    : [];
  return {
    page,
    perPage,
    total: result.total ?? null,
    users: result.users.map(user => ({
      id: user.id,
      email: typeof user.email === 'string' ? user.email : null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      bannedUntil: user.banned_until ?? null,
      disabled: states.find(state => state.user_id === user.id)?.disabled ?? false,
      revision: states.find(state => state.user_id === user.id)?.revision ?? 0,
      authState: states.find(state => state.user_id === user.id)?.auth_state ?? 'unchanged'
    }))
  };
}
async function setAccount(request: Request, client: BackendClient, actorId: string, targetId: string) {
  return accountLock(targetId, async () => {
    const value = fields<{ disabled: boolean; revision: number; requestId: string }>(await body(request, 4096), [
      'disabled',
      'revision',
      'requestId'
    ]);
    if (
      typeof value.disabled !== 'boolean' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      !uuid(value.requestId)
    )
      reject(400, '账号修改参数无效。');
    const account = await client.call<AccountState>('/rest/v1/rpc/media_admin_set_account', {
      method: 'POST',
      payload: {
        p_actor: actorId,
        p_target: targetId,
        p_revision: value.revision,
        p_disabled: value.disabled,
        p_request_id: value.requestId
      }
    });
    try {
      await client.call(`/auth/v1/admin/users/${targetId}`, {
        method: 'PUT',
        payload: { ban_duration: value.disabled ? '876000h' : 'none' }
      });
      const applied = await client.call('/rest/v1/rpc/media_admin_auth_applied', {
        method: 'POST',
        payload: { p_actor: actorId, p_target: targetId, p_revision: account.revision }
      });
      if (applied) return { account: { ...account, auth_state: 'applied' } };

      const latest = await client.call<AccountState[]>(
        `/rest/v1/media_accounts?select=disabled,revision&user_id=eq.${targetId}&limit=1`
      );
      const current = Array.isArray(latest) ? latest[0] : null;
      if (current && Number.isSafeInteger(current.revision) && current.revision > account.revision) {
        await client.call(`/auth/v1/admin/users/${targetId}`, {
          method: 'PUT',
          payload: { ban_duration: current.disabled ? '876000h' : 'none' }
        });
        const reconciled = await client.call('/rest/v1/rpc/media_admin_auth_applied', {
          method: 'POST',
          payload: { p_actor: actorId, p_target: targetId, p_revision: current.revision }
        });
        return { account: { ...current, auth_state: reconciled ? 'applied' : 'pending' } };
      }
      return { account: { ...account, auth_state: 'pending' } };
    } catch {
      return {
        account: { ...account, auth_state: 'pending' },
        message: '产品访问状态已提交；账号登录限制尚待确认，可由管理员重试。'
      };
    }
  });
}
/** 验证管理员权限后执行产品管理接口。 */
export function handleAdmin(request: Request, env: WorkerEnv) {
  return endpoint(async () => {
    if (new URL(request.url).pathname === '/api/admin/login' && request.method === 'POST') {
      sameOriginWrite(request);
      const value = fields<{ email: string; password: string }>(await body(request, 4096), ['email', 'password']);
      if (
        typeof value.email !== 'string' ||
        typeof value.password !== 'string' ||
        value.email.length > 254 ||
        value.password.length > 128
      )
        reject(400, '登录参数无效。');
      const key = loginKey(request, value.email);
      checkLogin(key);
      try {
        const session = await backend(env).call<{
          access_token: string;
          expires_in: number;
          user: { id: string; email?: string };
        }>('/auth/v1/token?grant_type=password', { method: 'POST', privileged: false, payload: value });
        if (!session.access_token || !Number.isFinite(session.expires_in) || session.expires_in <= 0)
          reject(502, '登录会话无效。');
        const headers = new Headers(request.headers);
        headers.set('authorization', `Bearer ${session.access_token}`);
        await administrator(new Request(request.url, { headers }), env);
        clearLoginFailures(key);
        return {
          accessToken: session.access_token,
          expiresAt: Date.now() + session.expires_in * 1000,
          user: { id: session.user.id, email: session.user.email }
        };
      } catch (error) {
        if (error instanceof ProductApiError && [401, 403].includes(error.status)) recordLoginFailure(key);
        throw error;
      }
    }
    const { client, actorId } = await administrator(request, env);
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/admin\//, '');
    if (path.startsWith('content/')) return manageContent(request, client, actorId, path);
    if (path === 'content' && request.method === 'GET')
      return {
        drafts: await client.call(
          '/rest/v1/media_content_drafts?select=kind,key,payload,revision,updated_at&order=kind,key&limit=200'
        ),
        published: await client.call('/rest/v1/media_public_content?select=kind,key,revision&order=kind,key&limit=200')
      };
    if (['tasks', 'usage'].includes(path) && request.method === 'GET') return reports(client, url, path === 'usage');
    if (path === 'session' && request.method === 'GET') return { actorId };
    if (path === 'users' && request.method === 'GET') return users(client, url, actorId);
    const creditTarget = /^users\/([0-9a-f-]+)\/credits$/.exec(path)?.[1];
    if (creditTarget && uuid(creditTarget)) return manageCredits(request, client, actorId, creditTarget);
    const target = /^users\/([0-9a-f-]+)$/.exec(path)?.[1];
    if (target && uuid(target) && request.method === 'PATCH') return setAccount(request, client, actorId, target);
    if (path === 'audit' && request.method === 'GET')
      return {
        entries: await client.call(
          '/rest/v1/media_admin_audit?select=id,actor_id,action,target_id,before_data,after_data,created_at&order=id.desc&limit=100'
        )
      };
    return reject(404, '管理接口不存在。');
  });
}
