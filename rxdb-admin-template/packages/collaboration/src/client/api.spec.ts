import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationApi } from './api.js';
const workspace = { teamId: 'team/one', appId: 'assets', name: 'Team' };
afterEach(() => { vi.unstubAllGlobals(); });
describe('authenticated HTTP client', () => {
  it('fetches public config without a token and obtains fresh auth for each data request', async () => {
    const token = vi.fn().mockResolvedValue('verified-token');
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}))); vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', token);
    await api.config();
    expect(token).not.toHaveBeenCalled();
    await api.workspaces();
    await api.snapshot(workspace);
    await api.receipt(workspace, 'receipt/id');
    await api.command(workspace, { type: 'read_notice', id: 'n', operationId: 'op' });
    expect(token).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenCalledWith('/api/workspaces/team%2Fone/assets/receipts/receipt%2Fid', expect.objectContaining({ cache: 'no-store', headers: { Authorization: 'Bearer verified-token' } }));
    expect(fetcher).toHaveBeenLastCalledWith('/api/workspaces/team%2Fone/assets/commands', expect.objectContaining({ method: 'POST', body: JSON.stringify({ type: 'read_notice', id: 'n', operationId: 'op' }) }));
  });
  it('rejects stale identities before sending requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', async () => { throw new Error('session expired'); });
    await expect(api.snapshot(workspace)).rejects.toThrow('session expired');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('distinguishes missing service configuration from structured permission failures', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(Response.json({ error: 'forbidden', message: 'revoked', details: { team: 'team' } }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));
    vi.stubGlobal('fetch', fetcher);
    const api = new CollaborationApi('/api', async () => 'token');
    await expect(api.config()).rejects.toMatchObject({ code: 'configuration' });
    await expect(api.workspaces()).rejects.toMatchObject({ code: 'forbidden', message: 'revoked', details: { team: 'team' } });
    await expect(api.workspaces()).rejects.toMatchObject({ code: 'http', message: '请求失败' });
  });
  it('cancels an unissued request if the account or workspace changes while obtaining its token', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let generation = 1;
    let finish: (value: string) => void = () => undefined;
    const api = new CollaborationApi('/api', () => new Promise(resolve => { finish = resolve; }), () => generation);
    const pending = api.snapshot(workspace);
    generation++;
    finish('new-account-token');
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });

});
