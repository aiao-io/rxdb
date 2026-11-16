import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap, snapshot } from './engine.js';
import { collaborationServer, type RepositoryApi } from './http.js';
const user = { id: 'user', email: 'user@example.test', verified: true };
let server: Server;
let url: string;
const data = snapshot(
  bootstrap(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin: user },
    { now: 1, id: () => 'id' }
  ),
  user,
  1
);
const repository: RepositoryApi = {
  list: vi.fn(async () => []),
  read: vi.fn(async () => data),
  operation: vi.fn(async () => ({ head: 'head' })),
  receipt: vi.fn(async () => ({ status: 'unknown' }))
};
const authenticate = vi.fn(async (token: string) => {
  if (token !== 'valid') throw new Error('private provider detail');
  return user;
});
beforeEach(async () => {
  vi.clearAllMocks();
  server = collaborationServer({
    repository,
    authenticate,
    origins: ['https://product.example'],
    publicConfig: { supabaseUrl: 'https://auth.example', supabaseKey: 'public-key' }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});
const post = (body: unknown, headers = {}) =>
  fetch(`${url}/workspaces/team/assets/commands`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
describe('HTTP identity boundary', () => {
  it('requires provider-verified identity for every data request and never leaks provider errors', async () => {
    expect((await fetch(`${url}/workspaces`)).status).toBe(401);
    const failed = await fetch(`${url}/workspaces`, { headers: { authorization: 'Bearer invalid' } });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('private');
    expect((await fetch(`${url}/workspaces`, { headers: { authorization: 'Bearer valid' } })).status).toBe(200);
    expect(authenticate).toHaveBeenCalledWith('valid');
    expect(repository.list).toHaveBeenCalledWith(user);
  });
  it('rejects cross-origin requests and forged actors before any operation', async () => {
    expect(
      (
        await post(
          { type: 'task', operationId: 'op', id: 'task', name: 'Task', expectedHead: null },
          { origin: 'https://attacker.example' }
        )
      ).status
    ).toBe(403);
    expect(
      (await post({ type: 'task', operationId: 'op', id: 'task', name: 'Task', expectedHead: null, userId: 'admin' }))
        .status
    ).toBe(409);
    expect(repository.operation).not.toHaveBeenCalled();
  });
  it('hashes invitation credentials before persistence and passes the verified principal separately', async () => {
    const response = await post({ type: 'accept_invite', operationId: 'op', id: 'invite', tokenHash: 'raw-token' });
    expect(response.status).toBe(200);
    expect(repository.operation).toHaveBeenCalledWith(
      user,
      'team',
      'assets',
      expect.objectContaining({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    );
  });
  it('exposes only public auth configuration and restricts receipts to the authenticated repository', async () => {
    const config = await (await fetch(`${url}/collaboration-api/config`)).json();
    expect(config).toEqual({ supabaseUrl: 'https://auth.example', supabaseKey: 'public-key' });
    await fetch(`${url}/workspaces/team/assets/receipts/op`, { headers: { authorization: 'Bearer valid' } });
    expect(repository.receipt).toHaveBeenCalledWith(user, 'team', 'assets', 'op');
    const cors = await fetch(`${url}/workspaces`, {
      method: 'OPTIONS',
      headers: { origin: 'https://product.example' }
    });
    expect(cors.status).toBe(204);
    expect(cors.headers.get('access-control-allow-origin')).toBe('https://product.example');
  });
});
/** 不经 fetch 的原始请求：fetch 会规范化请求目标，发不出 `//` 这类连 URL 都构不成的目标。 */
const rawGet = (path: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    request({ host: '127.0.0.1', port, path, headers: { authorization: 'Bearer valid' } }, response => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      );
    })
      .on('error', reject)
      .end();
  });
describe('HTTP request hygiene', () => {
  it('answers a malformed percent-encoding as an invalid request, not an internal error', async () => {
    for (const path of ['/workspaces/%zz/assets', '/workspaces/team/%', '/collaboration-api/workspaces/%E0%A4%A']) {
      const response = await fetch(`${url}${path}`, { headers: { authorization: 'Bearer valid' } });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'invalid', message: '请求格式错误', details: {} });
    }
    expect(authenticate).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });
  it('answers a request target that cannot form a URL as an invalid request, not an internal error', async () => {
    const response = await rawGet('//');
    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid', message: '请求格式错误', details: {} });
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('keeps decoding valid percent-encoded path segments', async () => {
    await fetch(`${url}/workspaces/team%2Done/assets`, { headers: { authorization: 'Bearer valid' } });
    expect(repository.read).toHaveBeenCalledWith(user, 'team-one', 'assets');
  });
  it('bounds slow clients with explicit, tight and enabled request timeouts', () => {
    const checking = (server as Server & { connectionsCheckingInterval: number }).connectionsCheckingInterval;
    expect(server.headersTimeout).toBeGreaterThan(0);
    expect(server.headersTimeout).toBeLessThanOrEqual(10_000);
    expect(server.requestTimeout).toBeGreaterThan(0);
    expect(server.requestTimeout).toBeLessThanOrEqual(60_000);
    expect(server.headersTimeout).toBeLessThanOrEqual(server.requestTimeout);
    expect(checking).toBeGreaterThan(0);
    expect(checking).toBeLessThanOrEqual(5_000);
  });
});
