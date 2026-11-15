import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminApiExecutor } from './index.ts';

const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
};
const operationId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function requestBody(call: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = call.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => vi.restoreAllMocks());

describe('admin-api privileged executor', () => {
  it('routes content save through the privileged RPC with an operation id', async () => {
    const fetchMock = vi.fn(async () => response({ id: 'template-one', revision: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const execute = createAdminApiExecutor(env);
    const result = await execute({
      actorId: userId,
      path: 'content/template/template-one',
      method: 'PUT',
      requestId: operationId,
      payload: {
        revision: 1,
        requestId: operationId,
        payload: { id: 'template-one', title: '模板' }
      }
    });
    expect(result).toEqual({ content: { id: 'template-one', revision: 2 }, state: 'draft' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestBody(fetchMock)).toMatchObject({
      p_actor: userId,
      p_kind: 'template',
      p_key: 'template-one',
      p_action: 'save',
      p_revision: 1,
      p_request_id: operationId
    });
  });

  it('checks the draft revision before publishing content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ payload: { id: 'template-one' }, revision: 4 }]))
      .mockResolvedValueOnce(response({ id: 'template-one', revision: 5 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createAdminApiExecutor(env)({
      actorId: userId,
      path: 'content/template/template-one/publish',
      method: 'POST',
      requestId: operationId,
      payload: { revision: 4, requestId: operationId }
    });
    expect(result).toEqual({ content: { id: 'template-one', revision: 5 }, state: 'active' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock)).toMatchObject({ p_action: 'publish', p_payload: null });
  });

  it('keeps task and usage reports on the privileged read path', async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal('fetch', fetchMock);
    const execute = createAdminApiExecutor(env);
    const tasks = await execute({ actorId: userId, path: 'tasks?status=completed&page=2', method: 'GET', requestId: operationId });
    const usage = await execute({ actorId: userId, path: 'usage?status=completed', method: 'GET', requestId: operationId });
    expect(tasks).toEqual({ reports: [], limit: 100 });
    expect(usage).toMatchObject({ sources: {}, partial: false, receivedRecords: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith(`${env.SUPABASE_URL}/rest/v1/media_task_reports`))).toBe(true);
  });

  it('rejects invalid credit mutations before calling Supabase', async () => {
    const fetchMock = vi.fn(async () => response({}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createAdminApiExecutor(env)({
        actorId: userId,
        path: `users/${userId}/credits`,
        method: 'POST',
        requestId: operationId,
        payload: { delta: 1, reason: '补发', requestId: 'bad-request-id' }
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
