import type { WorkerEnv } from './worker-env.ts';

/** 产品后端调用的认证方式与请求正文。 */
export interface BackendOptions {
  method?: string;
  payload?: unknown;
  token?: string;
  privileged?: boolean;
}

/** 产品后端的泛型 JSON 调用契约。 */
export type BackendClient = ReturnType<typeof backend>;

/** 携带可公开状态码和提示的产品接口错误。 */
export class ProductApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
/** 判断外部标识是否为受支持的 UUID。 */
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
/** 生成禁止缓存的产品接口 JSON 响应。 */
export const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    }
  });
/** 中断当前操作并返回可公开的接口错误。 */
export function reject(status: number, message: string): never {
  throw new ProductApiError(status, message);
}
/** 统一包装接口结果并隐藏内部异常。 */
export async function endpoint(operation: () => unknown) {
  try {
    const value = await operation();
    return value instanceof Response ? value : response(value);
  } catch (error) {
    return response(
      { error: error instanceof ProductApiError ? error.message : '服务暂不可用，请重试。' },
      error instanceof ProductApiError ? error.status : 502
    );
  }
}
/** 判断请求是否来自同源页面或已启用的桌面端。 */
export function originAllowed(request: Request, env: WorkerEnv = {}) {
  const origin = request.headers.get('origin');
  return (
    origin === new URL(request.url).origin ||
    (env.MEDIA_ALLOW_DESKTOP_ORIGIN === 'true' && origin === 'tauri://localhost')
  );
}
/** 限制写请求的来源。 */
export function sameOriginWrite(request: Request, env: WorkerEnv = {}) {
  if (!['GET', 'HEAD'].includes(request.method) && !originAllowed(request, env)) reject(403, '仅允许同源操作。');
}
/** 检查对象及字段白名单；具体字段值由调用方校验。 */
export function fields<T extends object = Record<string, unknown>>(value: unknown, allowed: readonly string[]): T {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(key => !allowed.includes(key))
  )
    reject(400, '请求包含无效字段。');
  return value as T;
}
/** 有界读取响应正文；超过上限时取消读取并抛错。 */
export async function bounded(result: Response, max: number) {
  const reader = result.body?.getReader();
  if (!reader) throw new Error('empty');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > max) throw new Error('oversize');
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
/** 有界读取 JSON 请求，内容结构由调用方校验。 */
export async function body<T = Record<string, unknown>>(request: Request, limit = 262144): Promise<T> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) reject(400, '需要 JSON 请求。');
  const reader = request.body?.getReader();
  if (!reader) reject(400, '请求为空。');
  const chunks = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      reject(413, '请求过大。');
    }
    chunks.push(part.value);
  }
  const value = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    value.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(value));
  } catch {
    return reject(400, 'JSON 无效。');
  }
}
/** 创建只向已配置产品后端发起请求的客户端。 */
export function backend(env: WorkerEnv) {
  let origin;
  try {
    const url = new URL(env.MEDIA_SUPABASE_URL!);
    if (
      url.href !== `${url.origin}/` ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error();
    origin = url.origin;
  } catch {
    reject(503, '产品服务未配置。');
  }
  if (!env.MEDIA_SUPABASE_ANON_KEY) reject(503, '产品服务未配置。');
  return {
    async call<T = unknown>(
      path: string,
      { method = 'GET', payload, token, privileged = true }: BackendOptions = {}
    ): Promise<T> {
      const key = privileged ? env.MEDIA_SUPABASE_SERVICE_ROLE_KEY : env.MEDIA_SUPABASE_ANON_KEY;
      if (!key) reject(503, '管理服务未配置。');
      const result = await fetch(`${origin}${path}`, {
        method,
        headers: { apikey: key, authorization: `Bearer ${token ?? key}`, 'content-type': 'application/json' },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer'
      });
      if (result.status >= 300 && result.status < 400) reject(502, '产品服务禁止重定向。');
      const data = result.status === 204 ? null : await result.json<{ code?: string | number; error_code?: string }>();
      if (result.ok) return data as T;
      const code =
        typeof data?.error_code === 'string' ? data.error_code
        : typeof data?.code === 'string' ? data.code
        : '';
      if (code === 'invalid_credentials') reject(401, '邮箱或密码错误，请使用该账号的原密码。');
      if (result.status === 401) reject(401, '账号会话已失效。');
      if (result.status === 403 || code === '42501') reject(403, '没有此操作权限。');
      if (code === 'email_exists' || code === 'user_already_exists') reject(409, '账号已存在，请验证原密码。');
      if (code === 'PT402') reject(402, '可用积分不足，请查看当前余额。');
      if (code === 'PT404') reject(404, '任务不存在。');
      if (code === '23503') reject(404, '目标记录已不存在。');
      if (result.status === 409 || ['40001', '23505', '23514', 'PT409'].includes(code))
        reject(409, '数据版本或管理员状态已变化，请重新载入。');
      if (code.startsWith('22')) reject(400, '请求数据无效。');
      reject(502, '产品服务操作失败，未确认成功。');
    }
  };
}
/** 验证账号会话与当前管理员权限。 */
export async function administrator(request: Request, env: WorkerEnv) {
  sameOriginWrite(request, env);
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) reject(401, '请先登录。');
  const client = backend(env);
  const user = await client.call<{ id: string }>('/auth/v1/user', { token, privileged: false });
  if (!uuid(user?.id)) reject(401, '当前账号无效。');
  const authorized = await client.call('/rest/v1/rpc/media_admin_authorized', {
    method: 'POST',
    payload: { p_actor: user.id }
  });
  if (authorized !== true) reject(403, '需要有效的管理员权限。');
  return { client, actorId: user.id };
}

/** 验证平台会话与当前账号状态。 */
export async function member(request: Request, env: WorkerEnv) {
  sameOriginWrite(request, env);
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) reject(401, '请先登录平台账号。');
  const client = backend(env);
  const user = await client.call<{ id: string }>('/auth/v1/user', { token, privileged: false });
  if (!uuid(user?.id)) reject(401, '账号无效。');
  const accounts = await client.call<{ disabled: boolean }[]>(
    `/rest/v1/media_accounts?select=disabled&user_id=eq.${user.id}`
  );
  if (!Array.isArray(accounts) || accounts.some(account => account.disabled)) reject(403, '账号已禁用。');
  return { client, userId: user.id };
}
