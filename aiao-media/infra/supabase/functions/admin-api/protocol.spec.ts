import { describe, expect, it } from 'vitest';
import { createAdminApiHandler, type AdminApiDependencies } from './protocol.js';

const userId = '10000000-0000-4000-8000-000000000001';
const request = (headers: Record<string, string> = {}, body: unknown = { path: 'session', method: 'GET' }) =>
  new Request('https://project.supabase.co/functions/v1/admin-api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
const dependencies = (authorized = true): AdminApiDependencies => ({
  authenticate: async token => (token === 'valid-token' ? { id: userId } : null),
  authorize: async () => authorized,
  execute: async input => ({ actorId: input.actorId, path: input.path, requestId: input.requestId })
});

describe('admin-api edge boundary', () => {
  it('rejects anonymous calls without invoking privileged execution', async () => {
    const execute = async () => ({ ok: true });
    const response = await createAdminApiHandler({ ...dependencies(), execute })(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: '请先登录。' });
  });

  it('rejects authenticated non-admin calls with 403', async () => {
    const response = await createAdminApiHandler(dependencies(false))(request({ authorization: 'Bearer valid-token' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: '需要有效的管理员权限。' });
  });

  it('passes a stable requestId to the privileged executor and response', async () => {
    const response = await createAdminApiHandler(dependencies())(
      request({ authorization: 'Bearer valid-token', 'x-request-id': 'request-1' }, { path: 'users', method: 'GET' })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('request-1');
    expect(await response.json()).toMatchObject({ actorId: userId, requestId: 'request-1', path: 'users' });
  });

  it('does not expose dependency errors or service credentials', async () => {
    const response = await createAdminApiHandler({
      ...dependencies(),
      execute: async () => {
        throw new Error('service_role=secret');
      }
    })(request({ authorization: 'Bearer valid-token' }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ error: '管理服务暂不可用，请重试。' }));
    expect(JSON.stringify(body)).not.toContain('service_role');
  });
});
