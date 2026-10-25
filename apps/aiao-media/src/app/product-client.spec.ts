import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskReport } from '../contracts/product-data.mjs';
import { ProductClient } from './product-client';
import type { ProductAuthorization } from './supabase-auth';

const userId = '10000000-0000-4000-8000-000000000001';
const access = {
  config: { url: 'https://account.example', anonKey: 'fixture-public-key' },
  userId,
  session: { access_token: 'fixture-session' }
} as ProductAuthorization;
const workspace = { id: 'workspace', owner_id: userId, request_id: 'operation', created: true };
const report: TaskReport = {
  id: '10000000-0000-4000-8000-000000000002',
  taskId: '10000000-0000-4000-8000-000000000003',
  workspaceId: userId,
  model: 'fixture-model',
  providerId: '10000000-0000-4000-8000-000000000004',
  channel: 'direct',
  status: 'completed',
  startedAt: '2026-10-25T00:00:00Z',
  source: 'application',
  requestCount: 1,
  providerUnits: null,
  verifiedCost: null,
  currency: null
};
const respond = (value: unknown, status = 200) =>
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(value), { status }));
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('product authorization and response boundaries', () => {
  it('uses the current verified session for each administrative request', async () => {
    const authorize = vi.fn(async () => access);
    const client = new ProductClient(authorize);
    respond({ allowed: true });
    expect(await client.authorization()).toBe(access);
    await client.admin('users?page=1', 'PATCH', { revision: 2 });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/users?page=1',
      expect.objectContaining({
        method: 'PATCH',
        headers: { authorization: 'Bearer fixture-session', 'content-type': 'application/json' },
        body: '{"revision":2}',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store'
      })
    );
  });

  it.each(['/session', 'session<script>', 'users#fragment', 'users\nheader'])(
    'rejects invalid administrative path %s before requesting authorization',
    async path => {
      const authorize = vi.fn(async () => access);
      await expect(new ProductClient(authorize).admin(path)).rejects.toThrow('路径无效');
      expect(authorize).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('does not send an administrative request if verification fails', async () => {
    const client = new ProductClient(async () => {
      throw new Error('unverified');
    });
    await expect(client.admin('session')).rejects.toThrow('unverified');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads only the authorized owner workspace and allowlists receipt fields', async () => {
    respond([{ ...workspace, private: 'omitted' }]);
    const client = new ProductClient(async () => access);
    expect(await client.ownWorkspace(access)).toEqual(workspace);
    expect(fetch).toHaveBeenCalledWith(
      `https://account.example/rest/v1/media_workspaces?select=id,owner_id,request_id&owner_id=eq.${userId}`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          apikey: 'fixture-public-key',
          authorization: 'Bearer fixture-session',
          'content-type': 'application/json'
        }
      })
    );
    respond([]);
    expect(await client.ownWorkspace(access)).toBeNull();
  });

  it.each([{}, [workspace, workspace], [null], [{ ...workspace, owner_id: 'other-user' }], [{ owner_id: userId }]])(
    'rejects ambiguous or mismatched workspace receipts',
    async value => {
      respond(value);
      await expect(new ProductClient(async () => access).ownWorkspace(access)).rejects.toThrow();
    }
  );

  it('sends the same explicit operation ID when ensuring a remote workspace', async () => {
    respond(workspace);
    const client = new ProductClient(async () => access);
    expect(await client.ensureWorkspace(access, 'operation')).toEqual(workspace);
    expect(fetch).toHaveBeenCalledWith(
      'https://account.example/rest/v1/rpc/media_ensure_workspace',
      expect.objectContaining({
        method: 'POST',
        body: '{"p_request_id":"operation"}'
      })
    );
  });

  it('validates task reports before dispatch and checks the returned IDs', async () => {
    const client = new ProductClient(async () => access);
    respond([report.id]);
    expect(await client.submitReports(access, [report])).toEqual([report.id]);
    expect(fetch).toHaveBeenCalledWith(
      'https://account.example/rest/v1/rpc/media_submit_task_reports',
      expect.objectContaining({ method: 'POST' })
    );
    respond({ unexpected: true });
    await expect(client.submitReports(access, [report])).rejects.toThrow('回执无效');
    respond([12]);
    await expect(client.submitReports(access, [report])).rejects.toThrow('回执无效');
    vi.mocked(fetch).mockClear();
    await expect(client.submitReports(access, [{ ...report, requestCount: -1 }])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, '账号或权限已失效'],
    [403, '账号或权限已失效'],
    [409, '数据版本已变化'],
    [500, '产品服务暂不可用']
  ] as const)('redacts HTTP %i failures and preserves the local copy', async (status, message) => {
    respond({ secret: 'private-upstream' }, status);
    await expect(new ProductClient(async () => access).admin('session')).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
