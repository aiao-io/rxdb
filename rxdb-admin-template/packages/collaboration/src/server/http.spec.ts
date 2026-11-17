import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError, type Command, type Identity, type Workspace } from '../model.js';
import { auditPage, bootstrap, candidateContent, commitContent, execute, sharedRecords, snapshot } from './engine.js';
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
  receipt: vi.fn(async () => ({ status: 'unknown' })),
  readRecords: vi.fn(async () => ({ head: null, records: {} })),
  readCommit: vi.fn(async () => ({ id: 'c1', parent: null, authorId: 'user', message: 'First', records: {} })),
  readCandidate: vi.fn(async () => {
    throw new CollaborationError('not_found', '候选不存在');
  }),
  readAudit: vi.fn(async () => ({ events: [], nextBefore: null }))
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

const get = (path: string, token = 'valid') =>
  fetch(`${url}${path}`, { headers: { authorization: `Bearer ${token}` } });
describe('on-demand read routes', () => {
  it('serves shared records, commits, candidates and audit pages to the authenticated user', async () => {
    const records = await get('/workspaces/team/assets/records');
    expect(records.status).toBe(200);
    expect(await records.json()).toEqual({ head: null, records: {} });
    expect(repository.readRecords).toHaveBeenCalledWith(user, 'team', 'assets');
    const commit = await get('/workspaces/team/assets/commits/c1');
    expect((await commit.json()) as unknown).toMatchObject({ id: 'c1', message: 'First' });
    expect(repository.readCommit).toHaveBeenCalledWith(user, 'team', 'assets', 'c1');
    await get('/workspaces/team/assets/candidates/k1');
    expect(repository.readCandidate).toHaveBeenCalledWith(user, 'team', 'assets', 'k1');
    const audit = await get('/workspaces/team/assets/audit');
    expect(await audit.json()).toEqual({ events: [], nextBefore: null });
    expect(repository.readAudit).toHaveBeenLastCalledWith(user, 'team', 'assets', {});
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.operation).not.toHaveBeenCalled();
  });
  it('passes audit filters and paging parameters through, parsed and validated', async () => {
    await get('/workspaces/team/assets/audit?before=event-1&limit=20&prId=pr-1&threadId=thread_1');
    expect(repository.readAudit).toHaveBeenLastCalledWith(user, 'team', 'assets', {
      before: 'event-1',
      limit: 20,
      prId: 'pr-1',
      threadId: 'thread_1'
    });
    await get('/workspaces/team/assets/audit?limit=100');
    expect(repository.readAudit).toHaveBeenLastCalledWith(user, 'team', 'assets', { limit: 100 });
    await get('/workspaces/team/assets/audit?prId=pr-2');
    expect(repository.readAudit).toHaveBeenLastCalledWith(user, 'team', 'assets', { prId: 'pr-2' });
  });
  it('rejects malformed audit queries as invalid requests without touching the repository', async () => {
    const malformed = [
      'limit=abc',
      'limit=',
      'limit=1.5',
      'limit=-1',
      'limit=1000',
      'limit=1&limit=2',
      'before=',
      'before=a/b',
      'prId=',
      'threadId=a%20b',
      'unknown=1'
    ];
    for (const query of malformed) {
      const response = await get(`/workspaces/team/assets/audit?${query}`);
      expect(response.status, query).toBe(409);
      expect(await response.json(), query).toEqual({ error: 'invalid', message: '请求字段不合法', details: {} });
    }
    expect(repository.readAudit).not.toHaveBeenCalled();
  });
  it('decodes percent-encoded ids and answers behind the collaboration-api prefix', async () => {
    await get('/collaboration-api/workspaces/team%2Done/assets/commits/commit%2D1');
    expect(repository.readCommit).toHaveBeenCalledWith(user, 'team-one', 'assets', 'commit-1');
    await get('/collaboration-api/workspaces/team/assets/records');
    expect(repository.readRecords).toHaveBeenCalledWith(user, 'team', 'assets');
  });
  it('requires an authenticated session before any read', async () => {
    for (const path of ['records', 'commits/c1', 'candidates/k1', 'audit']) {
      expect((await fetch(`${url}/workspaces/team/assets/${path}`)).status, path).toBe(401);
      expect((await get(`/workspaces/team/assets/${path}`, 'invalid')).status, path).toBe(500);
    }
    expect(repository.readRecords).not.toHaveBeenCalled();
    expect(repository.readCommit).not.toHaveBeenCalled();
    expect(repository.readCandidate).not.toHaveBeenCalled();
    expect(repository.readAudit).not.toHaveBeenCalled();
  });
  it('reports an unknown id as not_found without leaking anything else', async () => {
    const response = await get('/workspaces/team/assets/candidates/missing');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_found', message: '候选不存在', details: {} });
  });
  it('treats other methods, extra segments and unknown resources as unknown endpoints', async () => {
    const headers = { authorization: 'Bearer valid', 'content-type': 'application/json' };
    for (const path of ['records', 'commits/c1', 'candidates/k1', 'audit']) {
      const response = await fetch(`${url}/workspaces/team/assets/${path}`, { method: 'POST', headers, body: '{}' });
      expect(response.status, path).toBe(409);
      expect(await response.json(), path).toMatchObject({ error: 'not_found' });
    }
    for (const path of ['records/x', 'commits', 'commits/c1/x', 'candidates', 'audit/x', 'unknown', 'unknown/x']) {
      const response = await get(`/workspaces/team/assets/${path}`);
      expect(response.status, path).toBe(409);
      expect(await response.json(), path).toMatchObject({ error: 'not_found' });
    }
    expect(repository.readRecords).not.toHaveBeenCalled();
    expect(repository.readCommit).not.toHaveBeenCalled();
    expect(repository.readAudit).not.toHaveBeenCalled();
  });
  it('allows the read methods in CORS preflight', async () => {
    const response = await fetch(`${url}/workspaces/team/assets/records`, {
      method: 'OPTIONS',
      headers: { origin: 'https://product.example' }
    });
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

/** 以引擎纯函数实现的内存仓储：验证路由、授权与错误码的端到端映射，不涉及数据库。 */
function memoryRepository(state: Workspace): RepositoryApi {
  const operation = async (actor: Identity, _team: string, _app: string, command: Command) =>
    execute(state, actor, command, { now: 1000, id: () => `event-${state.audit.length + 1}` });
  return {
    ...repository,
    operation,
    readRecords: async actor => sharedRecords(state, actor),
    readCommit: async (actor, _team, _app, id) => commitContent(state, actor, id),
    readCandidate: async (actor, _team, _app, id) => candidateContent(state, actor, id),
    readAudit: async (actor, _team, _app, query) => auditPage(state, actor, query)
  };
}
describe('on-demand reads over the engine', () => {
  const outsider = { id: 'outsider', email: 'outsider@example.test', verified: true };
  let memory: Workspace;
  let remote: Server;
  let base: string;
  const fetchAs = (id: string, path: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${id}` } });
  beforeEach(async () => {
    memory = bootstrap(
      { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin: user },
      { now: 1, id: () => 'bootstrap-event' }
    );
    const api = memoryRepository(memory);
    await api.operation(user, 'team', 'assets', {
      type: 'task',
      id: 'task',
      name: 'Task',
      expectedHead: null,
      operationId: 'operation-1'
    });
    await api.operation(user, 'team', 'assets', {
      type: 'upload',
      taskId: 'task',
      expectedHead: null,
      operationId: 'operation-2',
      commits: [
        {
          id: 'c1',
          parent: null,
          authorId: user.id,
          message: 'First',
          records: { cat: { entity: 'AssetCategory', fields: { name: 'Laptops' } } }
        }
      ]
    });
    remote = collaborationServer({
      repository: api,
      authenticate: async token => ({ id: token, email: `${token}@example.test`, verified: true }),
      origins: [],
      publicConfig: { supabaseUrl: 'https://auth.example', supabaseKey: 'public-key' }
    });
    await new Promise<void>(resolve => remote.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>(resolve => remote.close(() => resolve()));
  });
  it('serves members the real content and an unknown id as not_found', async () => {
    const commit = await fetchAs('user', '/workspaces/team/assets/commits/c1');
    expect(commit.status).toBe(200);
    expect(await commit.json()).toMatchObject({ id: 'c1', records: { cat: { fields: { name: 'Laptops' } } } });
    const records = await fetchAs('user', '/workspaces/team/assets/records');
    expect(await records.json()).toEqual({ head: null, records: {} });
    const missing = await fetchAs('user', '/workspaces/team/assets/commits/constructor');
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ error: 'not_found', message: '提交不存在' });
    const events = (await (await fetchAs('user', '/workspaces/team/assets/audit?limit=2')).json()) as {
      events: { action: string }[];
      nextBefore: string | null;
    };
    expect(events.events.map(event => event.action)).toEqual(['upload', 'task']);
    expect(events.nextBefore).not.toBeNull();
  });
  it('answers non-members with 403 and no content for every read', async () => {
    for (const path of ['records', 'commits/c1', 'candidates/k1', 'audit']) {
      const response = await fetchAs(outsider.id, `/workspaces/team/assets/${path}`);
      expect(response.status, path).toBe(403);
      const text = await response.text();
      expect(text, path).not.toContain('Laptops');
      expect(JSON.parse(text), path).toMatchObject({ error: 'forbidden' });
    }
  });
});
