import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationApi } from './api.js';
const workspace = { teamId: 'team/one', appId: 'assets', name: 'Team' };
const task = { type: 'task' as const, id: 'task', name: 'Task', expectedHead: null, operationId: 'op' };
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
