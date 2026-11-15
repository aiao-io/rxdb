import type { TaskReport } from '@aiao-media/api-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductClient, type ProductAuthorization } from './product-client';

const userId = '10000000-0000-4000-8000-000000000001';
const invoke = vi.fn(async () => ({ data: { actorId: userId }, error: null }));
const access = {
  config: { url: 'https://account.example', anonKey: 'fixture-public-key' },
  userId,
  session: { access_token: 'fixture-session' }
} as ProductAuthorization;
const edgeAccess = {
  ...access,
  supabase: { functions: { invoke } }
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
  it('keeps Auth Admin routes on the Supabase Edge Function', async () => {
    const client = new ProductClient(async () => edgeAccess);
    const result = await client.admin(`users?page=1`);
    expect(result).toEqual({ actorId: userId });
    expect(invoke).toHaveBeenCalledWith('admin-api', {
      body: { path: 'users?page=1', method: 'GET' },
      headers: { authorization: 'Bearer fixture-session' }
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the ordinary admin session through a protected Supabase RPC', async () => {
    respond(true);
    expect(await new ProductClient(async () => access).admin('session')).toEqual({ actorId: userId });
    expect(fetch).toHaveBeenCalledWith(
      'https://account.example/rest/v1/rpc/media_admin_authorized',
      expect.objectContaining({ method: 'POST', body: '{}' })
    );
  });

  it('uses the current verified session for each administrative request', async () => {
    const authorize = vi.fn(async () => access);
    const client = new ProductClient(authorize);
    respond({ allowed: true });
    expect(await client.authorization()).toBe(access);
    await client.admin('users?page=1', 'PATCH', { revision: 2 });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      'https://account.example/functions/v1/admin-api',
      expect.objectContaining({
        method: 'POST',
        headers: { apikey: 'fixture-public-key', authorization: 'Bearer fixture-session', 'content-type': 'application/json' },
        body: '{"path":"users?page=1","method":"PATCH","payload":{"revision":2}}',
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

  it('writes ordinary content through the protected business RPC', async () => {
    respond({ kind: 'template', key: 'fixture', revision: 2 });
    const result = await new ProductClient(async () => access).admin('content/template/fixture', 'PUT', { revision: 1, requestId: '10000000-0000-4000-8000-000000000009', payload: { id: 'fixture' } });
    expect(result).toEqual({ content: { kind: 'template', key: 'fixture', revision: 2 }, state: 'draft' });
    expect(fetch).toHaveBeenCalledWith(
      'https://account.example/rest/v1/rpc/media_admin_content_self',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_kind: 'template', p_key: 'fixture', p_action: 'save', p_revision: 1, p_request_id: '10000000-0000-4000-8000-000000000009', p_payload: { id: 'fixture' } }) })
    );
  });

  it('reads ordinary task reports directly from PostgREST', async () => {
    respond([]);
    expect(await new ProductClient(async () => access).admin('tasks?status=completed&page=2')).toEqual({ reports: [], limit: 100 });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/rest/v1/media_task_reports?');
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
    [402, '可用积分不足'],
    [409, '数据版本已变化'],
    [500, '产品服务暂不可用']
  ] as const)('redacts HTTP %i failures and preserves the local copy', async (status, message) => {
    respond({ secret: 'private-upstream' }, status);
    await expect(new ProductClient(async () => access).admin('session')).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it.each([
  ['status', 'media_sync_status', {}],
  ['export', 'media_export_sync', {}],
  ['delete', 'media_delete_remote_metadata', { p_request_id: 'operation' }]
] as const)('同步管理 %s 使用当前会话与固定 RPC', async (operation, rpc, payload) => {
  respond({ confirmed: true });
  const client = new ProductClient(async () => access);
  await client.manageSync(operation, 'operation');
  expect(fetch).toHaveBeenCalledWith(
    `https://account.example/rest/v1/rpc/${rpc}`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
  );
});

it('直接 upsert 配置提交和变更，不经 Edge Function', async () => {
  const envelope = {
    commit: {
      id: '10000000-0000-4000-8000-000000000010',
      workspaceId: userId,
      branchId: 'main',
      parentIds: [],
      authorId: userId,
      message: '同步配置',
      operationId: '10000000-0000-4000-8000-000000000011',
      status: 'prepared' as const,
      changes: [],
      contentFingerprint: 'a'.repeat(64)
    },
    changes: [{
      id: '10000000-0000-4000-8000-000000000012',
      sequence: 1,
      entity: 'MediaPromptTemplate',
      entityId: '10000000-0000-4000-8000-000000000013',
      operation: 'update' as const,
      patch: { value: { key: 'hero' } },
      inversePatch: { value: { key: 'old' } },
      expectedRevision: 2,
      contentFingerprint: 'b'.repeat(64)
    }]
  };
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response('', { status: 200 }))
    .mockResolvedValueOnce(new Response('', { status: 200 }))
    .mockResolvedValueOnce(new Response('', { status: 200 }));

  await new ProductClient(async () => access).pushConfigCommit(envelope);

  expect(fetch).toHaveBeenNthCalledWith(
    1,
    'https://account.example/rest/v1/media_config_commits?on_conflict=workspace_id%2Coperation_id',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: envelope.commit.id,
        workspace_id: envelope.commit.workspaceId,
        branch_id: envelope.commit.branchId,
        parent_ids: [],
        author_id: envelope.commit.authorId,
        message: envelope.commit.message,
        operation_id: envelope.commit.operationId,
        content_fingerprint: envelope.commit.contentFingerprint,
        status: 'prepared'
      }),
      headers: expect.objectContaining({ Prefer: 'resolution=ignore-duplicates,return=minimal' })
    })
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    'https://account.example/rest/v1/media_config_commit_changes?on_conflict=commit_id%2Csequence',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify([{
        id: envelope.changes[0]?.id,
        commit_id: envelope.commit.id,
        sequence: 1,
        entity: 'MediaPromptTemplate',
        entity_id: envelope.changes[0]?.entityId,
        operation: 'update',
        patch: { value: { key: 'hero' } },
        inverse_patch: { value: { key: 'old' } },
        expected_revision: 2,
        content_fingerprint: 'b'.repeat(64)
      }])
    })
  );
  expect(fetch).toHaveBeenNthCalledWith(
    3,
    'https://account.example/rest/v1/media_config_commits?id=eq.10000000-0000-4000-8000-000000000010&status=eq.prepared',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'synced' }) })
  );
});

it('直接调用 rollback RPC，保持回滚经过普通管理员身份', async () => {
  respond({ commitId: 'commit', status: 'rolled_back', reused: false });
  await expect(new ProductClient(async () => access).rollbackConfigCommit('commit', 'operation')).resolves.toEqual({
    commitId: 'commit',
    status: 'rolled_back',
    reused: false
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://account.example/rest/v1/rpc/rollback_media_config_commit',
    expect.objectContaining({ body: JSON.stringify({ p_commit_id: 'commit', p_operation_id: 'operation' }) })
  );
});

it('读取配置提交的应用、发布和拒绝状态，仍然直连业务表', async () => {
  respond([{
    id: '10000000-0000-4000-8000-000000000010',
    workspace_id: userId,
    branch_id: 'main',
    parent_ids: [],
    author_id: userId,
    operation_id: '10000000-0000-4000-8000-000000000011',
    status: 'rejected',
    created_at: '2026-11-15T07:00:00Z',
    applied_at: null,
    released_at: null,
    rejection_code: 'revision_conflict'
  }]);
  await expect(new ProductClient(async () => access).latestConfigCommit(userId)).resolves.toEqual({
    id: '10000000-0000-4000-8000-000000000010',
    workspaceId: userId,
    branchId: 'main',
    parentIds: [],
    authorId: userId,
    operationId: '10000000-0000-4000-8000-000000000011',
    status: 'rejected',
    createdAt: '2026-11-15T07:00:00Z',
    appliedAt: null,
    releasedAt: null,
    rejectionCode: 'revision_conflict'
  });
  expect(fetch).toHaveBeenCalledWith(
    `https://account.example/rest/v1/media_config_commits?select=id,workspace_id,branch_id,parent_ids,author_id,operation_id,status,created_at,applied_at,released_at,rejection_code&workspace_id=eq.${userId}&order=created_at.desc&limit=1`,
    expect.objectContaining({ method: 'GET' })
  );
});

it('直接调用 apply RPC，返回幂等回执', async () => {
  respond({ commitId: 'commit', reused: true });
  await expect(new ProductClient(async () => access).applyConfigCommit('commit', 'operation')).resolves.toEqual({ commitId: 'commit', reused: true });
  expect(fetch).toHaveBeenCalledWith(
    'https://account.example/rest/v1/rpc/apply_media_config_commit',
    expect.objectContaining({ body: JSON.stringify({ p_commit_id: 'commit', p_operation_id: 'operation' }) })
  );
});

describe('后台任务筛选与用量范围回归', () => {
  it('列表和汇总都携带同一带时区的起止范围', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('[]'));
    const query = new URLSearchParams({ from: '2026-11-15T00:00:00+08:00', to: '2026-11-16T00:00:00+08:00' });
    const client = new ProductClient(async () => access);
    await client.admin(`tasks?${query}`);
    await client.admin(`usage?${query}`);
    for (const [url] of vi.mocked(fetch).mock.calls) {
      const filters = new URL(String(url)).searchParams.getAll('started_at');
      expect(filters).toEqual(['gte.2026-11-14T16:00:00.000Z', 'lt.2026-11-15T16:00:00.000Z']);
    }
  });

  it.each([
    'from=invalid',
    'from=2026-11-15T00%3A00%3A00',
    'from=2026-11-16T00%3A00%3A00Z&to=2026-11-15T00%3A00%3A00Z',
    'from=2026-02-30T00%3A00%3A00Z',
    'page=0',
    'page=1.5'
  ])('拒绝无效范围或页码 %s', async query => {
    respond([]);
    await expect(new ProductClient(async () => access).admin(`tasks?${query}`)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('连续读取超过 100 条的汇总，保持来源和未知值分开', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, () => ({ payload: report })))))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ payload: { ...report, requestCount: 3 } }])));
    const result = await new ProductClient(async () => access).admin('usage?status=completed');
    expect(result).toMatchObject({
      partial: false,
      receivedRecords: 101,
      sources: {
        application: { records: 101, requestCount: 103, providerUnits: null, unknown: { providerUnits: 101 } }
      }
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map(url => url.searchParams.get('offset'))).toEqual(['0', '100']);
    expect(urls.every(url => url.searchParams.get('status') === 'eq.completed')).toBe(true);
  });

  it.each([false, true])('10000 条边界只有额外存在记录时才标记截断：%s', async extra => {
    vi.mocked(fetch).mockImplementation(async url => {
      const offset = Number(new URL(String(url)).searchParams.get('offset'));
      const count =
        offset < 10000 ? 100
        : extra ? 1
        : 0;
      return new Response(JSON.stringify(Array.from({ length: count }, () => ({ payload: report }))));
    });
    const result = await new ProductClient(async () => access).admin('usage');
    expect(result).toMatchObject({ receivedRecords: 10000, partial: extra });
    expect(fetch).toHaveBeenCalledTimes(101);
  });
});

it('保留模型名称中的空格和加号而不拒绝合法查询', async () => {
  respond([]);
  await new ProductClient(async () => access).admin(`tasks?${new URLSearchParams({ model: 'model + one' })}`);
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.searchParams.get('model')).toBe('eq.model + one');
});
