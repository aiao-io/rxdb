import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationApi } from './api.js';
const workspace = { teamId: 'team/one', appId: 'assets', name: 'Team' };
const task = { type: 'task' as const, id: 'task', name: 'Task', expectedHead: 'root', operationId: 'op' };
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('command HTTP client', () => {
  it('fetches public config without a token and obtains fresh auth for each command', async () => {
    const token = vi.fn().mockResolvedValue('verified-token');
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({})));
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', token);
    await api.config();
    expect(token).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith('/api/config', expect.objectContaining({ method: 'GET', headers: {} }));
    await api.command(workspace, { type: 'read_notice', id: 'n', operationId: 'op' });
    await api.command(workspace, task);
    expect(token).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/workspaces/team%2Fone/assets/commands',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      })
    );
  });
  it('has no read endpoints: reads go to Supabase through the RLS projections', () => {
    const api = new CollaborationApi('/api', async () => 'token');
    for (const name of [
      'workspaces',
      'snapshot',
      'records',
      'commit',
      'candidate',
      'schema',
      'audit',
      'history',
      'receipt'
    ])
      expect(name in api, name).toBe(false);
  });
  it('rejects stale identities before sending a command', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', async () => {
      throw new Error('session expired');
    });
    await expect(api.command(workspace, task)).rejects.toThrow('session expired');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('distinguishes missing service configuration from structured command failures', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(
        Response.json({ error: 'forbidden', message: 'revoked', details: { team: 'team' } }, { status: 403 })
      )
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', async () => 'token');
    await expect(api.config()).rejects.toMatchObject({ code: 'configuration' });
    await expect(api.command(workspace, task)).rejects.toMatchObject({
      code: 'forbidden',
      message: 'revoked',
      details: { team: 'team' }
    });
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'http', message: '请求失败' });
  });
  it('translates uncertain command results in the English collaboration catalog', async () => {
    const { collaborationEnMessages } = await import('../messages.js');
    expect(collaborationEnMessages['collaboration.请求结果不确定，请确认或重试原请求']).toBe(
      'The request result is uncertain. Confirm or retry the original request.'
    );
  });
  it('marks a non-JSON command response as uncertain so the caller can recover its idempotency key', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })
        )
    );
    const api = new CollaborationApi('/api', async () => 'token');
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'uncertain' });
  });
  it('cancels an unissued command if the account or workspace changes while obtaining its token', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    let generation = 1;
    let finish: (value: string) => void = () => undefined;
    const api = new CollaborationApi(
      '/api',
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
      () => generation
    );
    const pending = api.command(workspace, task);
    generation++;
    finish('new-account-token');
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('retryable unavailability (ADMIN-US-220 AC#5)', () => {
  const unavailable = (retryAfter?: string) =>
    Response.json(
      {
        error: 'unavailable',
        message: '服务暂时不可用，请稍后按原请求重试',
        details: { reason: 'pool', retryAfter: 1 }
      },
      { status: 503, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter } }
    );
  const waits = () => {
    const delays: number[] = [];
    return { delays, sleep: async (ms: number) => void delays.push(ms) };
  };

  it('resends the same command with the same idempotency key after the Retry-After the service asked for', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(unavailable('2'))
      .mockResolvedValueOnce(unavailable('1'))
      .mockResolvedValueOnce(Response.json({ head: 'head' }));
    vi.stubGlobal('fetch', fetcher);
    const token = vi.fn().mockResolvedValue('token');
    const { delays, sleep } = waits();
    const api = new CollaborationApi('/api', token, () => undefined, sleep);
    await expect(api.command(workspace, task)).resolves.toEqual({ head: 'head' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const call of fetcher.mock.calls) expect(call[1].body).toBe(JSON.stringify(task));
    expect(delays).toEqual([2000, 1000]);
    // 每次重发都重新取会话令牌：等待期间令牌可能已刷新
    expect(token).toHaveBeenCalledTimes(3);
  });
  it('treats platform cold-start, gateway and worker-limit failures as retryable, backing off when no Retry-After is given', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ code: 'BOOT_ERROR', message: 'Worker failed to boot' }, { status: 503 }))
      .mockResolvedValueOnce(new Response('<html>Gateway Timeout</html>', { status: 504 }))
      .mockResolvedValueOnce(Response.json({ code: 'WORKER_LIMIT' }, { status: 546 }))
      .mockResolvedValueOnce(Response.json({ head: 'head' }));
    vi.stubGlobal('fetch', fetcher);
    const { delays, sleep } = waits();
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => undefined,
      sleep
    );
    await expect(api.command(workspace, task)).resolves.toEqual({ head: 'head' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([500, 1000, 2000]);
  });
  it('gives up after a bounded number of attempts with the stable unavailable code, keeping the request for a later retry', async () => {
    const fetcher = vi.fn().mockImplementation(async () => unavailable('30'));
    vi.stubGlobal('fetch', fetcher);
    const { delays, sleep } = waits();
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => undefined,
      sleep
    );
    await expect(api.command(workspace, task)).rejects.toMatchObject({
      code: 'unavailable',
      message: '服务暂时不可用，请稍后按原请求重试',
      details: { reason: 'pool' }
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    // 等待时间有上限：服务端给出过长的 Retry-After 也不会让页面一直挂着
    expect(delays).toEqual([10000, 10000, 10000]);
  });
  it('reports a platform failure that never recovers as unavailable, and leaves other gateway errors uncertain', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response('<html>Gateway Timeout</html>', { status: 504 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => undefined,
      async () => undefined
    );
    await expect(api.command(workspace, task)).rejects.toMatchObject({
      code: 'unavailable',
      message: '服务暂时不可用，请稍后按原请求重试'
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    // 502 不在可重试之列：结果不确定，只发一次，交给调用方按原幂等键确认或重试（见上面的「uncertain」用例）
    fetcher.mockImplementation(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
    fetcher.mockClear();
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('shows a platform error that is not in the service format (Edge Runtime WORKER_ERROR) as a plain failure, without retrying', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: 'WORKER_ERROR', message: 'Function exited due to an error (please check logs)' },
          { status: 500 }
        )
      );
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => undefined,
      async () => undefined
    );
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'http', message: '请求失败' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry ordinary failures: business errors, internal errors and unknown non-JSON responses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'forbidden', message: 'no', details: {} }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ error: 'internal', message: 'x', details: {} }, { status: 500 }))
      .mockResolvedValueOnce(new Response('<html>Teapot</html>', { status: 418 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => undefined,
      async () => undefined
    );
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'internal' });
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('stops retrying when the account or workspace changes while waiting', async () => {
    const fetcher = vi.fn().mockImplementation(async () => unavailable('1'));
    vi.stubGlobal('fetch', fetcher);
    let generation = 1;
    const api = new CollaborationApi(
      '/api',
      async () => 'token',
      () => generation,
      async () => {
        generation++;
      }
    );
    await expect(api.command(workspace, task)).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
