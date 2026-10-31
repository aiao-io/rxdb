export class ProductApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const uuid = value =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const response = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    }
  });
export const reject = (status, message) => {
  throw new ProductApiError(status, message);
};
export async function endpoint(operation) {
  try {
    return response(await operation());
  } catch (error) {
    return response(
      { error: error instanceof ProductApiError ? error.message : '服务暂不可用，请重试。' },
      error instanceof ProductApiError ? error.status : 502
    );
  }
}
export function originAllowed(request, env = {}) {
  const origin = request.headers.get('origin');
  return (
    origin === new URL(request.url).origin ||
    (env.MEDIA_ALLOW_DESKTOP_ORIGIN === 'true' && origin === 'tauri://localhost')
  );
}
export function sameOriginWrite(request, env = {}) {
  if (!['GET', 'HEAD'].includes(request.method) && !originAllowed(request, env)) reject(403, '仅允许同源操作。');
}
export function fields(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(key => !allowed.includes(key))
  )
    reject(400, '请求包含无效字段。');
  return value;
}
export async function body(request, limit = 262144) {
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
export function backend(env) {
  let origin;
  try {
    const url = new URL(env.MEDIA_SUPABASE_URL);
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
    async call(path, { method = 'GET', payload, token, privileged = true } = {}) {
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
      const data = result.status === 204 ? null : await result.json();
      if (result.ok) return data;
      if (result.status === 401) reject(401, '账号会话已失效。');
      if (result.status === 403 || data?.code === '42501') reject(403, '没有此操作权限。');
      if (data?.code === '23503') reject(404, '目标记录已不存在。');
      if (result.status === 409 || ['40001', '23505', '23514', 'PT409'].includes(data?.code))
        reject(409, '数据版本或管理员状态已变化，请重新载入。');
      if (String(data?.code ?? '').startsWith('22')) reject(400, '请求数据无效。');
      reject(502, '产品服务操作失败，未确认成功。');
    }
  };
}
export async function administrator(request, env) {
  sameOriginWrite(request, env);
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) reject(401, '请先登录。');
  const client = backend(env);
  const user = await client.call('/auth/v1/user', { token, privileged: false });
  if (!uuid(user?.id)) reject(401, '当前账号无效。');
  const authorized = await client.call('/rest/v1/rpc/media_admin_authorized', {
    method: 'POST',
    payload: { p_actor: user.id }
  });
  if (authorized !== true) reject(403, '需要有效的管理员权限。');
  return { client, actorId: user.id };
}
