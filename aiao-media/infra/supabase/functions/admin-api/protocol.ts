export interface AdminApiUser {
  id: string;
}

export interface AdminApiRequest {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload?: unknown;
  requestId: string;
}

export interface AdminApiDependencies {
  authenticate(token: string): Promise<AdminApiUser | null>;
  authorize(userId: string): Promise<boolean>;
  execute(input: AdminApiRequest & { actorId: string }): Promise<unknown>;
}

export class AdminApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 402 | 403 | 404 | 405 | 409 | 502,
    message: string
  ) {
    super(message);
  }
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const pathPattern = /^[a-z0-9/?=&,._%:-]+$/i;
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function json(data: unknown, status: number, requestId: string): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json', 'x-request-id': requestId }
  });
}

function requestId(request: Request): string {
  const value = request.headers.get('x-request-id');
  return value && requestIdPattern.test(value) ? value : crypto.randomUUID();
}

function parseBody(value: unknown, fallbackRequestId: string): AdminApiRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminApiError(400, '管理请求格式无效。');
  const data = value as Record<string, unknown>;
  if (typeof data['path'] !== 'string' || data['path'].startsWith('/') || !pathPattern.test(data['path']))
    throw new AdminApiError(400, '管理请求路径无效。');
  if (typeof data['method'] !== 'string' || !methods.includes(data['method'] as (typeof methods)[number]))
    throw new AdminApiError(400, '管理请求方法无效。');
  const valueRequestId = data['requestId'];
  if (valueRequestId !== undefined && (typeof valueRequestId !== 'string' || !requestIdPattern.test(valueRequestId)))
    throw new AdminApiError(400, '管理请求标识无效。');
  return {
    path: data['path'],
    method: data['method'] as AdminApiRequest['method'],
    ...(data['payload'] === undefined ? {} : { payload: data['payload'] }),
    requestId: typeof valueRequestId === 'string' ? valueRequestId : fallbackRequestId
  };
}

export function createAdminApiHandler(dependencies: AdminApiDependencies): (request: Request) => Promise<Response> {
  return async request => {
    const id = requestId(request);
    try {
      if (request.method !== 'POST') throw new AdminApiError(405, '管理函数只接受 POST。');
      const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
      if (!token) throw new AdminApiError(401, '请先登录。');
      const user = await dependencies.authenticate(token);
      if (!user) throw new AdminApiError(401, '当前账号无效。');
      if (!(await dependencies.authorize(user.id))) throw new AdminApiError(403, '需要有效的管理员权限。');
      const input = parseBody(await request.json(), id);
      return json(await dependencies.execute({ ...input, actorId: user.id }), 200, id);
    } catch (error) {
      if (error instanceof AdminApiError) return json({ error: error.message }, error.status, id);
      return json({ error: '管理服务暂不可用，请重试。' }, 502, id);
    }
  };
}
