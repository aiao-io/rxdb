import { createHmac } from 'node:crypto';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taskCommit } from '../commit.testing.js';
import { CollaborationError, type Identity } from '../model.js';
import { diffAssets } from '../schema.testing.js';
import { collaborationServer, type RepositoryApi } from './http.js';
import { createIdentities, type AuthLookup, type Identities } from './identity.js';
const user: Identity = { id: 'user', email: 'user@example.test', verified: true };
const confirmed: Identity = { id: 'user', email: 'confirmed@example.test', verified: true };
let server: Server;
let url: string;
const repository: RepositoryApi = { operation: vi.fn(async () => ({ head: 'head' })) };
/** 身份校验的替身：`valid` 是有效令牌；接受邀请时的 Auth 确认返回以 Auth 为准的邮箱。 */
const identities: Identities = {
  verify: vi.fn(async (token: string) => {
    if (token !== 'valid') throw new CollaborationError('unauthenticated', '会话已失效，请重新登录');
    return user;
  }),
  confirm: vi.fn(async () => confirmed)
};
async function start(options: { identities: Identities } = { identities }) {
  server = collaborationServer({
    repository,
    identities: options.identities,
    origins: ['https://product.example'],
    publicConfig: { supabaseUrl: 'https://auth.example', supabaseKey: 'public-key' }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeEach(async () => {
  vi.clearAllMocks();
  await start();
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});
const post = (body: unknown, headers: Record<string, string> = {}, path = '/workspaces/team/assets/commands') =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
const task = { type: 'task', operationId: 'op', id: 'task', name: 'Task', expectedHead: 'root' };
describe('HTTP identity boundary', () => {
  it('verifies every command locally and answers a bad token as unauthenticated without detail', async () => {
    expect((await post(task, { authorization: '' })).status).toBe(401);
    const failed = await post(task, { authorization: 'Bearer invalid' });
    expect(failed.status).toBe(401);
    expect(await failed.json()).toEqual({ error: 'unauthenticated', message: '会话已失效，请重新登录', details: {} });
    expect((await post(task)).status).toBe(200);
    expect(identities.verify).toHaveBeenCalledWith('valid');
    expect(identities.confirm).not.toHaveBeenCalled();
    expect(repository.operation).toHaveBeenCalledTimes(1);
    expect(repository.operation).toHaveBeenCalledWith(
      user,
      'team',
      'assets',
      expect.objectContaining({ type: 'task' })
    );
  });
  it('rejects cross-origin requests and forged actors before any operation', async () => {
    expect((await post(task, { origin: 'https://attacker.example' })).status).toBe(403);
    expect((await post({ ...task, userId: 'admin' })).status).toBe(409);
    expect(repository.operation).not.toHaveBeenCalled();
  });
  it('confirms the email with Auth only when accepting an invitation, and hashes the invitation token first', async () => {
    const response = await post({ type: 'accept_invite', operationId: 'op', id: 'invite', tokenHash: 'raw-token' });
    expect(response.status).toBe(200);
    expect(identities.confirm).toHaveBeenCalledTimes(1);
    expect(identities.confirm).toHaveBeenCalledWith('valid', user);
    expect(repository.operation).toHaveBeenCalledWith(
      confirmed,
      'team',
      'assets',
      expect.objectContaining({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    );
  });
  it('hands an upload of exchange records to the repository and refuses old-protocol commits before it', async () => {
    const commit = taskCommit({
      id: 'c1',
      parent: 'root',
      authorId: user.id,
      message: 'First',
      changes: diffAssets({}, { cat: { entity: 'AssetCategory', fields: { name: 'Laptops' } } })
    });
    const upload = (commits: unknown[]) =>
      post({ type: 'upload', operationId: 'op', taskId: 'task', expectedHead: 'root', commits });
    expect((await upload([commit])).status).toBe(200);
    expect(repository.operation).toHaveBeenCalledWith(
      user,
      'team',
      'assets',
      expect.objectContaining({ type: 'upload', commits: [commit] })
    );
    vi.mocked(repository.operation).mockClear();
    // 全量记录的旧提交、切片 C 的 ChangeSet 提交（parent / changes / fingerprint）、带合并关联的提交，都在解析时被拒
    const legacy = { id: 'c1', parent: null, authorId: user.id, message: 'First', records: {} };
    const changeSet = {
      id: 'c1',
      parent: 'root',
      authorId: user.id,
      message: 'First',
      changes: commit.units.map(({ namespace, entity, entityId, operation, patch, inversePatch }) => ({
        namespace,
        entity,
        entityId,
        operation,
        patch,
        inversePatch
      })),
      fingerprint: commit.contentFingerprint
    };
    for (const invalid of [
      legacy,
      changeSet,
      { ...commit, contentFingerprint: 'not-a-digest' },
      { ...commit, mergeSource: 'x' }
    ]) {
      const response = await upload([invalid]);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'invalid' });
    }
    expect(repository.operation).not.toHaveBeenCalled();
  });
  it('no longer accepts presence as a command: online state is Realtime Presence (ADMIN-US-219)', async () => {
    const response = await post({
      type: 'presence',
      operationId: 'op',
      sessionId: 'browser',
      prId: null,
      recordId: null,
      leave: false
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'invalid', message: '操作不受支持', details: {} });
    expect(repository.operation).not.toHaveBeenCalled();
  });
});
describe('HTTP surface: public configuration and commands only (ADMIN-US-219)', () => {
  it('exposes the public configuration without a session and allows command preflights', async () => {
    const config = await (await fetch(`${url}/collaboration-api/config`)).json();
    expect(config).toEqual({ supabaseUrl: 'https://auth.example', supabaseKey: 'public-key' });
    const cors = await fetch(`${url}/workspaces/team/assets/commands`, {
      method: 'OPTIONS',
      headers: { origin: 'https://product.example' }
    });
    expect(cors.status).toBe(204);
    expect(cors.headers.get('access-control-allow-origin')).toBe('https://product.example');
    expect(cors.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('serves none of the former read endpoints: reads go to Supabase through the RLS projections', async () => {
    for (const path of [
      '/workspaces',
      '/workspaces/team/assets',
      '/workspaces/team/assets/records',
      '/workspaces/team/assets/history?branch=shared',
      '/workspaces/team/assets/commits/c1',
      '/workspaces/team/assets/candidates/k1',
      '/workspaces/team/assets/schemas/1',
      '/workspaces/team/assets/audit',
      '/workspaces/team/assets/receipts/op'
    ]) {
      const response = await fetch(`${url}${path}`, { headers: { authorization: 'Bearer valid' } });
      expect(response.status, path).toBe(409);
      expect(await response.json(), path).toEqual({ error: 'not_found', message: '接口不存在', details: {} });
    }
    for (const path of ['/workspaces/team/assets', '/workspaces/team/assets/commands/x', '/workspaces/team']) {
      const response = await post(task, {}, path);
      expect(response.status, path).toBe(409);
      expect(await response.json(), path).toMatchObject({ error: 'not_found' });
    }
    expect(repository.operation).not.toHaveBeenCalled();
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
    expect(identities.verify).not.toHaveBeenCalled();
    expect(repository.operation).not.toHaveBeenCalled();
  });
  it('answers a request target that cannot form a URL as an invalid request, not an internal error', async () => {
    const response = await rawGet('//');
    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid', message: '请求格式错误', details: {} });
    expect(identities.verify).not.toHaveBeenCalled();
  });
  it('keeps decoding valid percent-encoded path segments behind the collaboration-api prefix', async () => {
    await post(task, {}, '/collaboration-api/workspaces/team%2Done/assets/commands');
    expect(repository.operation).toHaveBeenCalledWith(user, 'team-one', 'assets', expect.objectContaining(task));
  });
  it('bounds slow clients with explicit, tight and enabled request timeouts', () => {
    const checking = (server as Server & { connectionsCheckingInterval: number }).connectionsCheckingInterval;
    expect(server.headersTimeout).toBeGreaterThan(0);
    expect(server.headersTimeout).toBeLessThanOrEqual(10_000);
    expect(server.requestTimeout).toBeGreaterThan(0);
    // 4 MiB 请求上限下保留约 35 KB/s 的最低上行速率（见 http.ts），仍远低于 Node 默认的 300 秒。
    expect(server.requestTimeout).toBeLessThanOrEqual(120_000);
    expect(server.headersTimeout).toBeLessThanOrEqual(server.requestTimeout);
    expect(checking).toBeGreaterThan(0);
    expect(checking).toBeLessThanOrEqual(5_000);
  });
});

describe('Auth is consulted only when accepting an invitation (ADMIN-US-219 AC#5/#6)', () => {
  const secret = 'http-spec-local-secret-with-at-least-32-characters';
  const hs256 = (claims: Record<string, unknown>) => {
    const input = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify(claims)
    ).toString('base64url')}`;
    return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
  };
  const token = hs256({
    sub: 'member',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.test',
    exp: Math.floor(Date.now() / 1000) + 600
  });
  it('verifies a stream of commands without calling Auth, and calls it exactly once for an invitation', async () => {
    const auth: AuthLookup = {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'member', email: 'member@example.test', email_confirmed_at: '2026-11-17T00:00:00Z' } },
        error: null
      }))
    };
    await new Promise<void>(resolve => server.close(() => resolve()));
    await start({
      identities: createIdentities({ rules: { keys: { kind: 'secret', secret }, issuer: undefined }, auth })
    });
    const headers = { authorization: `Bearer ${token}` };
    for (let i = 0; i < 5; i++) expect((await post({ ...task, operationId: `op-${i}` }, headers)).status).toBe(200);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(repository.operation).toHaveBeenCalledTimes(5);
    expect(repository.operation).toHaveBeenCalledWith(
      { id: 'member', email: 'member@example.test', verified: true },
      'team',
      'assets',
      expect.objectContaining({ type: 'task' })
    );
    expect(
      (await post({ type: 'accept_invite', operationId: 'accept', id: 'i', tokenHash: 't' }, headers)).status
    ).toBe(200);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledWith(token);
    for (let i = 0; i < 3; i++) await post({ ...task, operationId: `after-${i}` }, headers);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    const forged = hs256({ sub: 'member', aud: 'authenticated', role: 'service_role', exp: Date.now() / 1000 + 600 });
    expect((await post(task, { authorization: `Bearer ${forged}` })).status).toBe(401);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });
});
