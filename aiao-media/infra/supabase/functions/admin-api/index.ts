import { AdminApiError, createAdminApiHandler, type AdminApiRequest } from './protocol.ts';

interface EdgeEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface SupabaseErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
}

class SupabaseCallError extends AdminApiError {
  constructor(status: number, readonly code: string) {
    super(
      status === 400 ? 400
      : status === 401 ? 401
      : status === 402 ? 402
      : status === 403 ? 403
      : status === 404 ? 404
      : status === 405 ? 405
      : status === 409 ? 409
      : 502,
      status === 400 ? '管理请求参数无效。'
      : status === 401 ? '账号或权限已失效。'
      : status === 402 ? '可用积分不足，请查看当前余额。'
      : status === 403 ? '当前账号没有执行此操作的权限。'
      : status === 404 ? '管理资源不存在。'
      : status === 409 ? '数据版本已变化，请重试。'
      : '管理服务暂不可用，请重试。'
    );
  }
}

function environment(): EdgeEnvironment {
  const scope = globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } };
  return {
    SUPABASE_URL: scope.Deno?.env.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: scope.Deno?.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: scope.Deno?.env.get('SUPABASE_SERVICE_ROLE_KEY')
  };
}

function validUrl(value: string | undefined): string {
  if (!value) throw new Error('Supabase is not configured');
  const url = new URL(value);
  if (url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Invalid Supabase URL');
  return url.origin;
}

function validKey(value: string | undefined): string {
  if (!value) throw new Error('Supabase is not configured');
  return value;
}

async function call<T>(env: EdgeEnvironment, path: string, options: { token: string; method?: string; payload?: unknown }): Promise<T> {
  const origin = validUrl(env.SUPABASE_URL);
  const key = validKey(env.SUPABASE_SERVICE_ROLE_KEY);
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: key,
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json'
    },
    ...(options.payload === undefined ? {} : { body: JSON.stringify(options.payload) }),
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000)
  });
  const body = response.status === 204 ? null : await response.json<SupabaseErrorBody & T>();
  if (!response.ok) {
    const error = body as SupabaseErrorBody;
    throw new SupabaseCallError(response.status, typeof error.code === 'string' ? error.code : error.error_code ?? 'unknown');
  }
  return body as T;
}

async function authenticate(env: EdgeEnvironment, token: string): Promise<{ id: string } | null> {
  try {
    const origin = validUrl(env.SUPABASE_URL);
    const key = validKey(env.SUPABASE_ANON_KEY);
    const response = await fetch(`${origin}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return null;
    const user = await response.json<{ id?: unknown }>();
    return typeof user.id === 'string' ? { id: user.id } : null;
  } catch {
    return null;
  }
}

async function authorize(env: EdgeEnvironment, userId: string): Promise<boolean> {
  try {
    return await call<boolean>(env, '/rest/v1/rpc/media_admin_authorized', {
      token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
      method: 'POST',
      payload: { p_actor: userId }
    });
  } catch {
    return false;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestIdPattern = uuidPattern;

function objectPayload(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SupabaseCallError(400, code);
  return value as Record<string, unknown>;
}

function positiveRevision(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new SupabaseCallError(400, code);
  return value as number;
}

function requestId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !requestIdPattern.test(value)) throw new SupabaseCallError(400, code);
  return value;
}

async function users(env: EdgeEnvironment, path: string, actorId: string): Promise<unknown> {
  const url = new URL(`https://admin.local/${path}`);
  const page = Number(url.searchParams.get('page') ?? 1);
  const perPage = Number(url.searchParams.get('perPage') ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new SupabaseCallError(400, 'invalid_pagination');
  }
  const search = url.searchParams.get('search')?.trim();
  const result = search
    ? await call<{ users: Array<Record<string, unknown>>; total?: number }>(env, '/rest/v1/rpc/media_admin_search_users', {
        token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
        method: 'POST',
        payload: { p_actor: actorId, p_query: search, p_page: page, p_limit: perPage }
      })
    : await call<{ users: Array<Record<string, unknown>>; total?: number }>(
        env,
        `/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        { token: validKey(env.SUPABASE_SERVICE_ROLE_KEY) }
      );
  const rows = Array.isArray(result.users) ? result.users : [];
  const ids = rows.map(user => user['id']).filter((id): id is string => typeof id === 'string' && uuidPattern.test(id));
  const states = ids.length
    ? await call<Array<Record<string, unknown>>>(
        env,
        `/rest/v1/media_accounts?select=user_id,disabled,revision,auth_state&user_id=in.(${ids.join(',')})`,
        { token: validKey(env.SUPABASE_SERVICE_ROLE_KEY) }
      )
    : [];
  return {
    page,
    perPage,
    total: result.total ?? null,
    users: rows.map(user => {
      const state = states.find(candidate => candidate['user_id'] === user['id']);
      return {
        id: user['id'],
        email: typeof user['email'] === 'string' ? user['email'] : null,
        createdAt: typeof user['created_at'] === 'string' ? user['created_at'] : null,
        lastSignInAt: typeof user['last_sign_in_at'] === 'string' ? user['last_sign_in_at'] : null,
        bannedUntil: typeof user['banned_until'] === 'string' ? user['banned_until'] : null,
        disabled: state?.['disabled'] === true,
        revision: typeof state?.['revision'] === 'number' ? state['revision'] : 0,
        authState: typeof state?.['auth_state'] === 'string' ? state['auth_state'] : 'unchanged'
      };
    })
  };
}

async function content(env: EdgeEnvironment, input: AdminApiRequest & { actorId: string }, route: string): Promise<unknown> {
  const match = /^content\/(template|provider-policy)\/([a-z][a-z0-9-]{0,59})(?:\/(publish|withdraw))?$/.exec(route);
  if (!match) throw new SupabaseCallError(404, 'content_not_found');
  const [, kind, key, operation] = match;
  if (kind === 'provider-policy' && key !== 'runtime') throw new SupabaseCallError(400, 'invalid_policy_key');
  const action = operation ?? 'save';
  const expectedMethod = action === 'save' ? 'PUT' : 'POST';
  if (input.method !== expectedMethod) throw new SupabaseCallError(405, 'invalid_content_method');
  const value = objectPayload(input.payload, 'invalid_content_payload');
  const revision = positiveRevision(value['revision'], 'invalid_content_revision');
  const operationId = requestId(value['requestId'], 'invalid_content_request');
  const payload = action === 'save' ? value['payload'] : null;
  if (action === 'save') {
    const contentValue = objectPayload(payload, 'invalid_content_payload');
    if (kind === 'template' && contentValue['id'] !== key) throw new SupabaseCallError(400, 'template_key_mismatch');
  }
  if (action === 'publish') {
    const rows = await call<Array<{ payload: unknown; revision: number }>>(
      env,
      `/rest/v1/media_content_drafts?kind=eq.${encodeURIComponent(kind)}&key=eq.${encodeURIComponent(key)}&select=payload,revision&limit=1`,
      { token: validKey(env.SUPABASE_SERVICE_ROLE_KEY) }
    );
    const draft = rows[0];
    if (!draft || draft.revision !== revision) throw new SupabaseCallError(409, 'content_revision_conflict');
  }
  const result = await call(env, '/rest/v1/rpc/media_admin_content', {
    token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
    method: 'POST',
    payload: {
      p_actor: input.actorId,
      p_kind: kind,
      p_key: key,
      p_action: action,
      p_revision: revision,
      p_request_id: operationId,
      p_payload: payload
    }
  });
  return {
    content: result,
    state: action === 'publish' ? 'active' : action === 'withdraw' ? 'withdrawn' : 'draft'
  };
}

function reportQuery(url: URL): URLSearchParams {
  const query = new URLSearchParams({
    select: 'id,owner_id,workspace_id,task_id,model,channel,status,started_at,payload,received_at',
    order: 'started_at.desc,id',
    limit: '100'
  });
  const names = { userId: 'owner_id', model: 'model', channel: 'channel', status: 'status' };
  for (const [name, column] of Object.entries(names)) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    const valid = name === 'userId' ? uuidPattern.test(value)
      : name === 'model' ? /^[a-zA-Z0-9._:-]{1,128}$/.test(value)
      : name === 'channel' ? ['direct', 'proxy'].includes(value)
      : ['processing', 'completed', 'failed', 'needs_review'].includes(value);
    if (!valid) throw new SupabaseCallError(400, 'invalid_report_filter');
    query.set(column, `eq.${value}`);
  }
  for (const [name, operator] of [['from', 'gte'], ['to', 'lt']] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
      throw new SupabaseCallError(400, 'invalid_report_time');
    query.append('started_at', `${operator}.${new Date(value).toISOString()}`);
  }
  const page = Number(url.searchParams.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new SupabaseCallError(400, 'invalid_report_page');
  query.set('offset', String((page - 1) * 100));
  return query;
}

type UsageBucket = {
  records: number;
  requestCount: number | null;
  providerUnits: number | null;
  verifiedCost: number | null;
  currencies: Record<string, number>;
  unknown: Record<'requestCount' | 'providerUnits' | 'verifiedCost', number>;
};

async function reports(env: EdgeEnvironment, path: string, usage: boolean): Promise<unknown> {
  const url = new URL(`https://admin.local/${path}`);
  const query = reportQuery(url);
  const token = validKey(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!usage) return { reports: await call(env, `/rest/v1/media_task_reports?${query}`, { token }), limit: 100 };
  query.delete('offset');
  const sources: Record<string, UsageBucket> = Object.fromEntries(
    ['application', 'provider', 'verified'].map(source => [source, {
      records: 0,
      requestCount: null,
      providerUnits: null,
      verifiedCost: null,
      currencies: {},
      unknown: { requestCount: 0, providerUnits: 0, verifiedCost: 0 }
    }])
  );
  let offset = 0;
  while (true) {
    query.set('offset', String(offset));
    const rows = await call<Array<{ payload: Record<string, unknown> }>>(env, `/rest/v1/media_task_reports?${query}`, { token });
    for (const row of rows) {
      const payload = row.payload;
      const source = payload['source'];
      const bucket = typeof source === 'string' ? sources[source] : undefined;
      if (!bucket) throw new SupabaseCallError(502, 'invalid_usage_source');
      bucket.records++;
      for (const key of ['requestCount', 'providerUnits'] as const) {
        const value = payload[key];
        if (value === null) bucket.unknown[key]++;
        else if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
        else throw new SupabaseCallError(502, 'invalid_usage_value');
      }
      const verifiedCost = payload['verifiedCost'];
      if (verifiedCost === null) bucket.unknown.verifiedCost++;
      else if (typeof verifiedCost === 'number' && Number.isFinite(verifiedCost)) {
        const currency = payload['currency'];
        if (typeof currency !== 'string') throw new SupabaseCallError(502, 'invalid_usage_currency');
        bucket.currencies[currency] = (bucket.currencies[currency] ?? 0) + verifiedCost;
      } else throw new SupabaseCallError(502, 'invalid_usage_value');
    }
    offset += rows.length;
    if (rows.length < 100) break;
    if (offset >= 10000) return { sources, partial: true, receivedRecords: offset };
  }
  for (const bucket of Object.values(sources))
    if (Object.keys(bucket.currencies).length === 1) bucket.verifiedCost = Object.values(bucket.currencies)[0];
  return { sources, partial: false, receivedRecords: offset };
}

async function credits(env: EdgeEnvironment, input: AdminApiRequest & { actorId: string }, target: string): Promise<unknown> {
  if (!uuidPattern.test(target)) throw new SupabaseCallError(404, 'user_not_found');
  const token = validKey(env.SUPABASE_SERVICE_ROLE_KEY);
  if (input.method === 'GET') {
    const before = new URL(`https://admin.local/${input.path}`).searchParams.get('before');
    if (before !== null && (!/^[1-9]\d*$/.test(before) || !Number.isSafeInteger(Number(before))))
      throw new SupabaseCallError(400, 'invalid_credit_cursor');
    const cursor = before === null ? '' : `&id=lt.${before}`;
    const [accounts, entries] = await Promise.all([
      call<Array<{ balance: number; reserved: number }>>(
        env,
        `/rest/v1/media_credit_accounts?select=balance,reserved&user_id=eq.${target}&limit=1`,
        { token }
      ),
      call(env, `/rest/v1/media_credit_ledger?select=id,user_id,actor_id,delta,balance_after,reason,source,request_id,created_at&user_id=eq.${target}&order=id.desc&limit=50${cursor}`, { token })
    ]);
    const account = accounts[0] ?? { balance: 0, reserved: 0 };
    return { account: { ...account, available: account.balance - account.reserved }, entries };
  }
  if (input.method !== 'POST') throw new SupabaseCallError(405, 'invalid_credit_method');
  const value = objectPayload(input.payload, 'invalid_credit_payload');
  if (!Number.isSafeInteger(value['delta']) || Math.abs(value['delta'] as number) > 1000000 || typeof value['reason'] !== 'string' || value['reason'].trim().length === 0)
    throw new SupabaseCallError(400, 'invalid_credit_payload');
  return {
    entry: await call(env, '/rest/v1/rpc/media_admin_adjust_credits', {
      token,
      method: 'POST',
      payload: {
        p_actor: input.actorId,
        p_target: target,
        p_delta: value['delta'],
        p_reason: value['reason'],
        p_request_id: requestId(value['requestId'], 'invalid_credit_request')
      }
    })
  };
}

export function createAdminApiExecutor(env: EdgeEnvironment) {
  return (input: AdminApiRequest & { actorId: string }): Promise<unknown> => execute(env, input);
}

async function execute(env: EdgeEnvironment, input: AdminApiRequest & { actorId: string }): Promise<unknown> {
  const url = new URL(`https://admin.local/${input.path}`);
  const route = url.pathname.replace(/^\//, '');
  if (input.method === 'GET' && route === 'session') return { actorId: input.actorId };
  if (input.method === 'GET' && route === 'account') {
    const user = await call<{ id: string; email?: string; created_at: string; last_sign_in_at?: string }>(
      env, `/auth/v1/admin/users/${input.actorId}`, { token: validKey(env.SUPABASE_SERVICE_ROLE_KEY) }
    );
    return { userId: user.id, email: user.email ?? null, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null };
  }
  if (input.method === 'GET' && route === 'users') return users(env, input.path, input.actorId);
  if (route === 'content' && input.method === 'GET') {
    const token = validKey(env.SUPABASE_SERVICE_ROLE_KEY);
    const [drafts, published] = await Promise.all([
      call(env, '/rest/v1/media_content_drafts?select=kind,key,payload,revision,updated_at&order=kind,key&limit=200', { token }),
      call(env, '/rest/v1/media_public_content?select=kind,key,revision&order=kind,key&limit=200', { token })
    ]);
    return { drafts, published };
  }
  if (route === 'audit' && input.method === 'GET') {
    return {
      entries: await call(env, '/rest/v1/media_admin_audit?select=id,actor_id,action,target_id,before_data,after_data,created_at&order=id.desc&limit=100', {
        token: validKey(env.SUPABASE_SERVICE_ROLE_KEY)
      })
    };
  }
  if (route.startsWith('content/')) return content(env, input, route);
  if (route === 'tasks' && input.method === 'GET') return reports(env, input.path, false);
  if (route === 'usage' && input.method === 'GET') return reports(env, input.path, true);
  const account = /^users\/([0-9a-f-]+)$/.exec(route)?.[1];
  if (input.method === 'PATCH' && account) {
    if (!uuidPattern.test(account)) throw new SupabaseCallError(404, 'user_not_found');
    const value = objectPayload(input.payload, 'invalid_account_payload');
    if (typeof value['disabled'] !== 'boolean') throw new SupabaseCallError(400, 'invalid_account_payload');
    const revision = positiveRevision(value['revision'], 'invalid_account_payload');
    const operationId = requestId(value['requestId'], 'invalid_account_payload');
    const result = await call<Record<string, unknown>>(env, '/rest/v1/rpc/media_admin_set_account', {
      token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
      method: 'POST',
      payload: { p_actor: input.actorId, p_target: account, p_revision: revision, p_disabled: value['disabled'], p_request_id: operationId }
    });
    try {
      await call(env, `/auth/v1/admin/users/${account}`, {
        token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
        method: 'PUT',
        payload: { ban_duration: value['disabled'] ? '876000h' : 'none' }
      });
      const applied = await call<boolean>(env, '/rest/v1/rpc/media_admin_auth_applied', {
        token: validKey(env.SUPABASE_SERVICE_ROLE_KEY),
        method: 'POST',
        payload: { p_actor: input.actorId, p_target: account, p_revision: result['revision'] }
      });
      return { account: { ...result, auth_state: applied ? 'applied' : 'pending' } };
    } catch {
      return { account: { ...result, auth_state: 'pending' }, message: '产品访问状态已提交；账号登录限制尚待确认，可由管理员重试。' };
    }
  }
  const creditTarget = /^users\/([0-9a-f-]+)\/credits$/.exec(route)?.[1];
  if (creditTarget) return credits(env, input, creditTarget);
  throw new SupabaseCallError(404, 'not_found');
}

const env = environment();
const handler = createAdminApiHandler({
  authenticate: token => authenticate(env, token),
  authorize: userId => authorize(env, userId),
  execute: createAdminApiExecutor(env)
});

const scope = globalThis as unknown as { Deno?: { serve(handler: (request: Request) => Promise<Response>): void } };
if (scope.Deno) scope.Deno.serve(handler);

export { handler };
