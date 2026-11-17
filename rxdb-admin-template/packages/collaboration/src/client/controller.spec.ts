import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitFingerprint } from '../commit.js';
import {
  CollaborationError,
  type Audit,
  type CommitContent,
  type CommitPage,
  type Records,
  type WorkspaceSummary
} from '../model.js';
import { assetSchema } from '../schema.testing.js';
import { bootstrap, snapshot } from '../server/engine.js';
import { CollaborationController } from './controller.js';
import type { Draft, DraftStorage } from './local.js';
import { contextKey } from './local.js';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
class MemoryStorage implements DraftStorage {
  rows = new Map<string, Draft>();
  async read(key: string) {
    return structuredClone(this.rows.get(key));
  }
  async write(key: string, change: (current: Draft | undefined) => Draft) {
    const next = change(await this.read(key));
    this.rows.set(key, structuredClone(next));
    return next;
  }
  async list(id: string) {
    return [...this.rows.values()].filter(d => d.context.userId === id);
  }
  async lock(id: string) {
    this.rows.forEach(d => {
      if (d.context.userId === id) d.locked = true;
    });
  }
}
const controllers: CollaborationController[] = [];
function browserStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key)
  };
}
async function setup() {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', browserStorage());
  vi.stubGlobal('sessionStorage', browserStorage());
  const storage = new MemoryStorage();
  const controller = new CollaborationController('/test', storage);
  controllers.push(controller);
  const user = { id: 'alice', email: 'alice@example.test', verified: true };
  const state = bootstrap(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin: user, schema: assetSchema },
    { now: 1, id: () => 'id' }
  );
  state.tasks['task'] = { id: 'task', name: 'Task', ownerId: 'alice', base: null, head: null, originTaskId: null };
  controller.user = user;
  controller.workspace = { teamId: 'team', appId: 'assets', name: 'Team' };
  controller.snapshot = snapshot(state, user, 1);
  await controller.local.login('alice');
  controller.draft = await controller.local.openVerified(
    { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 'task' },
    'Task',
    null,
    null,
    {},
    assetSchema
  );
  vi.spyOn(controller.api, 'snapshot').mockResolvedValue(controller.snapshot);
  vi.spyOn(controller.api, 'receipt').mockResolvedValue({ status: 'unknown' });
  vi.spyOn(controller.api, 'schema').mockResolvedValue(assetSchema);
  return { controller, storage };
}
afterEach(() => {
  controllers.splice(0).forEach(c => c.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function authFixture(userId = 'alice') {
  const session: Session = {
    access_token: 'access',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      email: `${userId}@example.test`,
      email_confirmed_at: '2026-11-16',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-16'
    }
  };
  let listener: (event: string, session: Session | null) => void = () => undefined;
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    })
  };
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  vi.mocked(createClient).mockReturnValue({
    auth,
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn().mockResolvedValue('ok')
  } as unknown as ReturnType<typeof createClient>);
  return { session, auth, emit: (event: string, value: Session | null) => listener(event, value) };
}
async function initialized(userId = 'alice') {
  const setupValue = await setup();
  const fixture = authFixture(userId);
  vi.spyOn(setupValue.controller.api, 'config').mockResolvedValue({
    supabaseUrl: 'http://auth.test',
    supabaseKey: 'public-key'
  });
  vi.spyOn(setupValue.controller.api, 'workspaces').mockResolvedValue([
    { teamId: 'team', appId: 'assets', name: 'Team' }
  ]);
  await setupValue.controller.initialize();
  return { ...setupValue, ...fixture };
}
describe('session verification and access recovery', () => {
  it('verifies online identity, caches a bounded offline grant and uses provider OTP APIs', async () => {
    const { controller, auth } = await initialized();
    expect(auth.getUser).toHaveBeenCalledWith('access');
    expect(controller.workspaces).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!).user.id).toBe('alice');
    await controller.sendCode('alice@example.test');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'alice@example.test',
      options: { shouldCreateUser: true }
    });
    await controller.verify('alice@example.test', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'alice@example.test', token: '123456', type: 'email' });
    await controller.logout();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem('admin-collaboration-grant:/test')).toBeNull();
  });
  it('keeps token refresh enabled after an offline cold start and refreshes on reconnect', async () => {
    vi.mocked(createClient).mockClear();
    const { controller, auth } = await initialized();
    const options = vi.mocked(createClient).mock.calls.at(-1)?.[2];
    expect(options).toMatchObject({ auth: { autoRefreshToken: true } });
    vi.stubGlobal('navigator', { onLine: false });
    controller.online = false;
    vi.stubGlobal('navigator', { onLine: true });
    await controller.reconnect();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(controller.online).toBe(true);
  });

  it('keeps failed OTP requests unauthenticated and never trusts an unconfirmed email', async () => {
    const { controller, auth } = await initialized();
    await controller.lock();
    auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: new Error('invalid code') });
    await expect(controller.verify('alice@example.test', 'bad')).rejects.toThrow('invalid code');
    auth.signInWithOtp.mockResolvedValueOnce({ error: new Error('rate limited') });
    await expect(controller.sendCode('alice@example.test')).rejects.toThrow('rate limited');
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null });
    await expect(controller.verify('alice@example.test', '123456')).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(controller.user).toBeNull();
  });
  it('keeps a verified warm task editable when the provider expires its offline session, but explicit logout locks it', async () => {
    const { controller, emit } = await initialized();
    vi.stubGlobal('navigator', { onLine: false });
    emit('SIGNED_OUT', null);
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'After expiry' } } });
    await controller.sync(false);
    expect(controller.user?.id).toBe('alice');
    expect(controller.draft?.queue).toHaveLength(1);
    await controller.logout();
    expect(controller.user).toBeNull();
    expect(controller.draft).toBeNull();
  });
  it('locks original user data before adopting another verified session', async () => {
    const { controller, storage } = await initialized('bob');
    expect(controller.user?.id).toBe('bob');
    expect(controller.draft).toBeNull();
    expect((await storage.list('alice'))[0].locked).toBe(true);
    expect(controller.local.actor).toBe('bob');
  });
  it('restores a cached offline context without issuing requests and rejects an expired grant', async () => {
    const { controller, storage } = await initialized();
    controller.dispose();
    vi.stubGlobal('navigator', { onLine: false });
    const cold = new CollaborationController('/test', storage);
    controllers.push(cold);
    await cold.initialize();
    expect(vi.mocked(createClient).mock.calls.at(-1)?.[2]).toMatchObject({ auth: { autoRefreshToken: true } });
    expect(cold.user?.id).toBe('alice');
    expect(cold.offlineDrafts).toHaveLength(1);
    await cold.openOffline(cold.offlineDrafts[0]);
    await cold.refresh();
    expect(cold.online).toBe(false);
    const grant = JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!);
    localStorage.setItem('admin-collaboration-grant:/test', JSON.stringify({ ...grant, expiresAt: 1 }));
    const expired = new CollaborationController('/test', storage);
    controllers.push(expired);
    await expect(expired.initialize()).rejects.toMatchObject({ code: 'locked' });
    expect(expired.user).toBeNull();
    expect(expired.offlineDrafts).toEqual([]);
  });
  it('refuses a revoked editing grant while retaining local work for future authorized recovery', async () => {
    const { controller, storage } = await setup();
    const context = controller.draft!.context;
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Retain' } } });
    const revoked = structuredClone(controller.snapshot!);
    revoked.members[0].permissions = ['read'];
    vi.mocked(controller.api.snapshot).mockResolvedValue(revoked);
    await controller.refresh().catch(error => controller.failure(error));
    expect(controller.draft).toBeNull();
    expect((await storage.read(contextKey(context)))?.records.c.fields['name']).toBe('Retain');
    expect((await storage.read(contextKey(context)))?.locked).toBe(true);
  });
});
describe('client concurrency and recovery', () => {
  it('checkpoints the editor before locking a session', async () => {
    const { controller } = await setup();
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    controller.registerCheckpoint(checkpoint);
    await controller.lock();
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(controller.user).toBeNull();
  });

  it('retries an invitation without selecting a workspace before membership exists', async () => {
    const { controller } = await setup();
    const workspace = { teamId: 'new-team', appId: 'assets', name: 'New team' };
    const command = { type: 'accept_invite' as const, id: 'invite', tokenHash: 'token', operationId: 'invite-op' };
    controller.workspace = null;
    controller.snapshot = null;
    vi.mocked(controller.api.receipt).mockResolvedValue({ status: 'unknown' });
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    vi.spyOn(controller.api, 'workspaces').mockResolvedValue([workspace]);
    sessionStorage.setItem(
      `admin-collaboration-pending:${controller.user!.id}`,
      JSON.stringify({ workspace, command, createdAt: Date.now() })
    );
    await controller.retryPending();
    expect(send).toHaveBeenCalledWith(workspace, command);
    expect(controller.workspace).toEqual(workspace);
    expect(controller.pending()).toBeNull();
  });

  it('accepts an invitation without reading the members-only receipt before membership exists', async () => {
    const { controller } = await setup();
    const workspace = { teamId: 'new-team', appId: 'assets', name: 'new-team' };
    controller.workspace = null;
    controller.snapshot = null;
    // 回执接口要求读权限，受邀者在接受之前还不是成员，读回执必然被拒
    vi.mocked(controller.api.receipt).mockRejectedValue(new CollaborationError('forbidden', '当前用户没有操作权限'));
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    vi.spyOn(controller.api, 'workspaces').mockResolvedValue([workspace]);
    await controller.acceptInvitation('new-team', 'assets', 'invite', 'token');
    expect(controller.api.receipt).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ type: 'accept_invite', id: 'invite', tokenHash: 'token' })
    );
    expect(controller.workspace).toEqual(workspace);
    expect(controller.pending()).toBeNull();
  });

  it('clears malformed pending data instead of blocking future commands', async () => {
    const { controller } = await setup();
    const key = `admin-collaboration-pending:${controller.user!.id}`;
    sessionStorage.setItem(key, '{malformed');
    expect(controller.pending()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('serializes durable actions until their previous receipt and snapshot are confirmed', async () => {
    const { controller } = await setup();
    const delayed = Promise.withResolvers<NonNullable<typeof controller.snapshot>>();
    vi.mocked(controller.api.snapshot).mockReturnValueOnce(delayed.promise);
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    const first = controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'first');
    await vi.waitFor(() => expect(controller.api.snapshot).toHaveBeenCalledTimes(1));
    const second = controller.run({ type: 'policy', stages: [], expectedVersion: 2 }, 'second');
    const completed = Promise.all([first, second]);
    delayed.resolve(controller.snapshot!);
    await completed;
    expect(send.mock.calls.map(([, command]) => command.operationId)).toEqual(['first', 'second']);
    expect(controller.pending()).toBeNull();
  });
  it('cancels queued durable actions when their original identity or workspace is locked', async () => {
    const { controller } = await setup();
    const delayed = Promise.withResolvers<Record<string, unknown>>();
    const send = vi.spyOn(controller.api, 'command').mockReturnValueOnce(delayed.promise);
    const first = controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'first');
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const second = controller.run({ type: 'policy', stages: [], expectedVersion: 2 }, 'second');
    const outcomes = Promise.allSettled([first, second]);
    await controller.logout();
    delayed.resolve({});
    expect(await outcomes).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ code: 'cancelled' }) },
      { status: 'rejected', reason: expect.objectContaining({ code: 'cancelled' }) }
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('retains the original request ID after an unknown outcome and queries its receipt before retrying', async () => {
    const { controller } = await setup();
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'operation')).rejects.toThrow(
      'network'
    );
    expect(controller.pending()?.command.operationId).toBe('operation');
    vi.mocked(controller.api.receipt).mockResolvedValue({ status: 'accepted', value: { policyVersion: 2 } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.pending()).toBeNull();
  });
  it('does not assign a late upload receipt to the next user or erase the original queue', async () => {
    const { controller, storage } = await setup();
    const context = controller.draft!.context;
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Local' } } });
    let finish: (value: Record<string, unknown>) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const syncing = controller.sync(false);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const head = controller.draft!.localHead;
    await controller.logout();
    controller.user = { id: 'bob', email: 'bob@example.test', verified: true };
    await controller.local.login('bob');
    finish({ head });
    await expect(syncing).rejects.toMatchObject({ code: 'cancelled' });
    expect(controller.user.id).toBe('bob');
    expect(controller.draft).toBeNull();
    expect((await storage.read(contextKey(context)))?.queue).toHaveLength(1);
  });
  it('preserves saved edits made while an upload is in flight', async () => {
    const { controller } = await setup();
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Original' } } });
    let finish: (value: Record<string, unknown>) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const syncing = controller.sync(false);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const head = controller.draft!.localHead;
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Newer' } } });
    finish({ head });
    await syncing;
    expect(controller.draft!.records.c.fields['name']).toBe('Newer');
    expect(controller.draft!.committed.c.fields['name']).toBe('Original');
  });
  it('uploads the queued commit as field-level changes with its fingerprint and resends the very same commit on retry', async () => {
    const { controller } = await setup();
    await controller.save({
      c: { entity: 'AssetCategory', fields: { name: 'Computers', description: null } },
      d: { entity: 'AssetCategory', fields: { name: 'Desks' } }
    });
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.sync(false)).rejects.toThrow('network');
    const first = send.mock.calls[0][1];
    if (first.type !== 'upload') throw new Error('expected an upload');
    expect(first).toMatchObject({ taskId: 'task', expectedHead: null });
    expect(first.commits).toHaveLength(1);
    const [commit] = first.commits;
    expect(commit.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(commit).toMatchObject({ parent: null, authorId: 'alice' });
    expect(commit).not.toHaveProperty('records');
    expect(commit.changes).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'insert',
        patch: { name: 'Computers', description: null },
        inversePatch: null
      },
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'd',
        operation: 'insert',
        patch: { name: 'Desks' },
        inversePatch: null
      }
    ]);
    expect(commit.fingerprint).toBe(await commitFingerprint(commit));
    send.mockResolvedValueOnce({ head: commit.id });
    await controller.sync(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(first);
    expect(controller.draft?.queue).toEqual([]);
    expect(controller.draft?.remoteHead).toBe(commit.id);
  });
  it('queues offline commits without attempting a cloud request', async () => {
    const { controller } = await setup();
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Offline' } } });
    vi.stubGlobal('navigator', { onLine: false });
    const send = vi.spyOn(controller.api, 'command');
    await controller.sync(false);
    expect(send).not.toHaveBeenCalled();
    expect(controller.draft?.queue).toHaveLength(1);
  });
  it('ignores an old upload rejection after changing accounts', async () => {
    const { controller } = await setup();
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Local' } } });
    let reject: (reason: unknown) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise((_resolve, failure) => {
          reject = failure;
        })
    );
    const syncing = controller.sync(false).catch(error => controller.failure(error));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    await controller.logout();
    controller.user = { id: 'bob', email: 'bob@example.test', verified: true };
    await controller.local.login('bob');
    reject(new CollaborationError('forbidden', 'old account revoked'));
    await syncing;
    expect(controller.user?.id).toBe('bob');
    expect(controller.message).not.toBe('old account revoked');
  });
  it('does not resurrect an offline draft after logout during its read', async () => {
    const { controller, storage } = await setup();
    const original = controller.draft!;
    let finish: (value: Draft | undefined) => void = () => undefined;
    vi.spyOn(storage, 'read').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const opening = controller.openOffline(original).catch(error => controller.failure(error));
    await controller.logout();
    finish(original);
    await opening;
    expect(controller.user).toBeNull();
    expect(controller.draft).toBeNull();
    expect(controller.workspace).toBeNull();
  });
  it('recovers an accepted fork receipt and unlocks fetching the original task', async () => {
    const { controller } = await setup();
    const context = controller.draft!.context;
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Preserved' } } });
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.fork('Saved fork', false)).rejects.toThrow('network');
    const pending = controller.pending()!;
    expect(pending.command.type).toBe('fork');
    if (pending.command.type !== 'fork') throw new Error('expected fork');
    const command = pending.command;
    expect(command.commits).toHaveLength(1);
    expect(command.commits[0].changes).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'insert',
        patch: { name: 'Preserved' },
        inversePatch: null
      }
    ]);
    expect(command.commits[0].fingerprint).toBe(await commitFingerprint(command.commits[0]));
    const head = command.commits.at(-1)!.id;
    controller.snapshot!.tasks.push({
      id: command.id,
      name: command.name,
      ownerId: 'alice',
      base: null,
      head,
      originTaskId: 'task'
    });
    vi.spyOn(controller.api, 'commit').mockImplementation(async (_workspace, id) => {
      const commit = command.commits.find(item => item.id === id);
      if (!commit) throw new CollaborationError('not_found', '提交不存在');
      return {
        id: commit.id,
        parent: commit.parent,
        authorId: commit.authorId,
        message: commit.message,
        changes: commit.changes,
        records: records('Preserved')
      };
    });
    vi.mocked(controller.api.receipt).mockResolvedValue({ status: 'accepted', value: { taskId: command.id, head } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.draft?.context.taskId).toBe(command.id);
    expect((await controller.local.read(context))?.forkArchive).toEqual({ taskId: command.id, head });
    expect((await controller.local.fastForward(context, 'remote', {}, false)).queue).toEqual([]);
  });
  it('keeps the original operation when the transport result is uncertain', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.api, 'command').mockRejectedValue(new CollaborationError('uncertain', '请求结果不确定'));
    await expect(
      controller.run({ type: 'task', id: 'uncertain', name: 'Uncertain', expectedHead: null }, 'uncertain-op')
    ).rejects.toThrow('请求结果不确定');
    expect(controller.pending()?.command.operationId).toBe('uncertain-op');
  });
  it('keeps the original operation when the command was accepted but refresh failed', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.api, 'command').mockResolvedValue({ taskId: 'accepted' });
    vi.spyOn(controller.api, 'snapshot').mockRejectedValue(new CollaborationError('forbidden', '刷新失败'));
    await expect(
      controller.run({ type: 'task', id: 'accepted', name: 'Accepted', expectedHead: null }, 'accepted-op')
    ).rejects.toThrow('刷新失败');
    expect(controller.pending()?.command.operationId).toBe('accepted-op');
  });
});

const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
const commitOf = (id: string, parent: string | null, name: string): CommitContent => ({
  id,
  parent,
  authorId: 'alice',
  message: id,
  changes: [],
  records: records(name)
});
const metadata = ({ id, parent, authorId, message }: CommitContent) => ({ id, parent, authorId, message });
/** 在当前摘要上叠加改动并让 api.snapshot 返回它（修订号加一），模拟别人推进了工作区。 */
function publish(controller: CollaborationController, change: (summary: WorkspaceSummary) => void) {
  const next = structuredClone(controller.snapshot!);
  change(next);
  next.revision += 1;
  vi.mocked(controller.api.snapshot).mockResolvedValue(next);
  return next;
}
/** 共享分支头指向提交 c1、另有一个头在 c1 的自己的任务 task2 的摘要。 */
function withSharedCommit(controller: CollaborationController) {
  return publish(controller, summary => {
    summary.head = 'c1';
    summary.tasks.push({ id: 'task2', name: 'Second', ownerId: 'alice', base: 'c1', head: 'c1', originTaskId: null });
  });
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('on-demand content', () => {
  it('serves commit content on a miss with one request, announces the arrival and then answers from the cache', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.api, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, 'c1');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(controller.commitContent('c1')?.records).toEqual(records('One'));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('shares one request between background reads and awaited loads of the same id, but not across ids', async () => {
    const { controller } = await setup();
    const reply = Promise.withResolvers<CommitContent>();
    const request = vi.spyOn(controller.api, 'commit').mockReturnValue(reply.promise);
    const candidate = vi.spyOn(controller.api, 'candidate');
    controller.commitContent('c1');
    const loading = [controller.loadCommit('c1'), controller.loadCommit('c1')];
    controller.commitContent('c1');
    expect(request).toHaveBeenCalledTimes(1);
    reply.resolve(commitOf('c1', null, 'One'));
    expect((await Promise.all(loading)).map(commit => commit.id)).toEqual(['c1', 'c1']);
    controller.commitContent('c2');
    expect(request).toHaveBeenCalledTimes(2);
    expect(candidate).not.toHaveBeenCalled();
  });
  it('caches candidates by id the same way', async () => {
    const { controller } = await setup();
    const content = { id: 'k1', prId: 'pr', records: records('Final') } as never;
    const request = vi.spyOn(controller.api, 'candidate').mockResolvedValue(content);
    expect(controller.candidateContent('k1')).toBeUndefined();
    await expect(controller.loadCandidate('k1')).resolves.toBe(content);
    expect(controller.candidateContent('k1')).toBe(content);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, 'k1');
  });
  it('keeps immutable commits across refreshes', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.api, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    await controller.loadCommit('c1');
    publish(controller, () => undefined);
    await controller.refresh();
    expect(controller.commitContent('c1')?.id).toBe('c1');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('records a failed read once, shows the error, does not retry by itself and tries again after a refresh', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.api, 'commit')
      .mockRejectedValueOnce(new CollaborationError('internal', '服务暂时不可用，请稍后按原请求重试'))
      .mockResolvedValue(commitOf('c1', null, 'One'));
    expect(controller.commitContent('c1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.message).toBe('服务暂时不可用，请稍后按原请求重试'));
    for (let index = 0; index < 5; index++) expect(controller.commitContent('c1')).toBeUndefined();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    publish(controller, () => undefined);
    await controller.refresh();
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(controller.commitContent('c1')?.id).toBe('c1'));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('lets a user operation retry a failed read immediately and reports its failure to the caller', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.api, 'commit')
      .mockRejectedValueOnce(new CollaborationError('internal', 'first'))
      .mockRejectedValueOnce(new CollaborationError('internal', 'second'))
      .mockResolvedValue(commitOf('c1', null, 'One'));
    controller.commitContent('c1');
    await vi.waitFor(() => expect(controller.message).toBe('first'));
    await expect(controller.loadCommit('c1')).rejects.toMatchObject({ message: 'second' });
    expect(controller.message).toBe('first');
    await expect(controller.loadCommit('c1')).resolves.toMatchObject({ id: 'c1' });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('answers a read without a selected team with undefined and an error message, never a throw or a lock', async () => {
    const { controller } = await setup();
    controller.workspace = null;
    const request = vi.spyOn(controller.api, 'commit');
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(controller.candidateContent('k1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.message).toBe('先选择团队'));
    expect(controller.user?.id).toBe('alice');
    expect(request).not.toHaveBeenCalled();
  });
  it('serves the empty shared branch without a request', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.api, 'records');
    expect(controller.snapshot!.head).toBeNull();
    expect(controller.sharedRecords()).toEqual({});
    await expect(controller.loadSharedRecords()).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
  it('caches shared records by the summary head and drops them as soon as the head changes', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.api, 'records')
      .mockResolvedValueOnce({ head: 'h1', records: records('First') })
      .mockResolvedValueOnce({ head: 'h2', records: records('Second') });
    publish(controller, summary => {
      summary.head = 'h1';
    });
    await controller.refresh();
    expect(controller.sharedRecords()).toBeUndefined();
    await vi.waitFor(() => expect(controller.sharedRecords()).toEqual(records('First')));
    publish(controller, summary => {
      summary.head = 'h1';
      summary.name = 'Renamed';
    });
    await controller.refresh();
    expect(controller.sharedRecords()).toEqual(records('First'));
    expect(request).toHaveBeenCalledTimes(1);
    publish(controller, summary => {
      summary.head = 'h2';
    });
    await controller.refresh();
    expect(controller.sharedRecords()).toBeUndefined();
    await vi.waitFor(() => expect(controller.sharedRecords()).toEqual(records('Second')));
    expect(request).toHaveBeenCalledTimes(2);
    await expect(controller.loadSharedRecords()).resolves.toEqual(records('Second'));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not show or retry a shared read that was overtaken by a newer head, and recovers on the next refresh', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.api, 'records')
      .mockResolvedValueOnce({ head: 'h2', records: records('Second') })
      .mockResolvedValue({ head: 'h2', records: records('Second') });
    publish(controller, summary => {
      summary.head = 'h1';
    });
    await controller.refresh();
    expect(controller.sharedRecords()).toBeUndefined();
    await settle();
    for (let index = 0; index < 3; index++) expect(controller.sharedRecords()).toBeUndefined();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.message).toBe('');
    publish(controller, summary => {
      summary.head = 'h2';
    });
    await controller.refresh();
    expect(controller.sharedRecords()).toBeUndefined();
    await vi.waitFor(() => expect(controller.sharedRecords()).toEqual(records('Second')));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('discards content that arrives after switching team and starts over in the new one', async () => {
    const { controller } = await setup();
    const late = Promise.withResolvers<CommitContent>();
    const request = vi
      .spyOn(controller.api, 'commit')
      .mockReturnValueOnce(late.promise)
      .mockResolvedValue(commitOf('c1', null, 'Other team'));
    controller.commitContent('c1');
    await controller.selectWorkspace({ teamId: 'other', appId: 'assets', name: 'Other' });
    late.resolve(commitOf('c1', null, 'Old team'));
    await settle();
    expect(controller.commitContent('c1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.commitContent('c1')?.records).toEqual(records('Other team')));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith({ teamId: 'other', appId: 'assets', name: 'Other' }, 'c1');
  });
  it('forgets all content when the session locks', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.api, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    await controller.loadCommit('c1');
    await controller.lock();
    expect(controller.snapshot).toBeNull();
    controller.workspace = { teamId: 'team', appId: 'assets', name: 'Team' };
    expect(controller.commitContent('c1')).toBeUndefined();
  });
});

describe('operations that need content', () => {
  it('loads the head commit before opening a task and opens the draft from its records', async () => {
    const { controller } = await setup();
    withSharedCommit(controller);
    const reply = Promise.withResolvers<CommitContent>();
    const request = vi.spyOn(controller.api, 'commit').mockReturnValue(reply.promise);
    const opening = controller.openTask('task2');
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(controller.workspace, 'c1'));
    expect(controller.draft?.context.taskId).toBe('task');
    reply.resolve(commitOf('c1', null, 'One'));
    await opening;
    expect(controller.draft?.context.taskId).toBe('task2');
    expect(controller.draft?.records).toEqual(records('One'));
    expect(controller.draft?.remoteHead).toBe('c1');
  });
  it('does not open the task when its head commit cannot be loaded', async () => {
    const { controller } = await setup();
    withSharedCommit(controller);
    vi.spyOn(controller.api, 'commit').mockRejectedValue(new CollaborationError('internal', 'down'));
    await expect(controller.openTask('task2')).rejects.toMatchObject({ message: 'down' });
    expect(controller.draft?.context.taskId).toBe('task');
    expect((await controller.local.storage.list('alice')).map(draft => draft.context.taskId)).toEqual(['task']);
  });
  it('needs no commit request for a task that has no commits yet', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.api, 'commit');
    await controller.openTask('task');
    expect(request).not.toHaveBeenCalled();
    expect(controller.draft?.records).toEqual({});
  });
  it('loads the head commit before fast-forwarding the local task to the remote version', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.tasks[0].head = 'c1';
    });
    const request = vi.spyOn(controller.api, 'commit').mockResolvedValue(commitOf('c1', null, 'Remote'));
    await controller.fetchRemote(false);
    expect(request).toHaveBeenCalledWith(controller.workspace, 'c1');
    expect(controller.draft?.remoteHead).toBe('c1');
    expect(controller.draft?.records).toEqual(records('Remote'));
  });
  it('keeps local work when the remote head commit cannot be loaded for a fast-forward', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.tasks[0].head = 'c1';
    });
    vi.spyOn(controller.api, 'commit').mockRejectedValue(new CollaborationError('internal', 'down'));
    await expect(controller.fetchRemote(false)).rejects.toMatchObject({ message: 'down' });
    expect(controller.draft?.remoteHead).toBeNull();
    expect(controller.draft?.records).toEqual({});
  });
});

describe('audit timeline', () => {
  const event = (id: number): Audit => ({
    id: `e${id}`,
    actorId: 'alice',
    action: 'task',
    operationId: `op${id}`,
    at: id,
    details: {}
  });
  const events = (from: number, to: number) => Array.from({ length: to - from }, (_, index) => event(from + index));
  it('loads earlier events through the cursor and keeps them across refreshes that overlap', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.audit = events(3, 6);
      summary.auditCount = 6;
    });
    await controller.refresh();
    expect(controller.auditEvents().map(item => item.id)).toEqual(['e3', 'e4', 'e5']);
    expect(controller.hasEarlierAudit()).toBe(true);
    const request = vi
      .spyOn(controller.api, 'audit')
      .mockResolvedValue({ events: events(0, 3).reverse(), nextBefore: null });
    await controller.loadEarlierAudit();
    expect(request).toHaveBeenCalledWith(controller.workspace, { before: 'e3' });
    expect(controller.auditEvents().map(item => item.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    expect(controller.hasEarlierAudit()).toBe(false);
    publish(controller, summary => {
      summary.audit = events(4, 8);
      summary.auditCount = 8;
    });
    await controller.refresh();
    expect(controller.auditEvents().map(item => item.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
    expect(controller.hasEarlierAudit()).toBe(false);
  });
  it('announces loaded earlier events and ignores a page that no longer lines up', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.audit = events(3, 6);
      summary.auditCount = 6;
    });
    await controller.refresh();
    const reply = Promise.withResolvers<{ events: Audit[]; nextBefore: string | null }>();
    vi.spyOn(controller.api, 'audit').mockReturnValue(reply.promise);
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    const loading = controller.loadEarlierAudit();
    publish(controller, summary => {
      summary.audit = events(40, 90);
      summary.auditCount = 90;
    });
    await controller.refresh();
    changed.mockClear();
    reply.resolve({ events: events(0, 3).reverse(), nextBefore: null });
    await loading;
    expect(controller.auditEvents().map(item => item.id)).toEqual(events(40, 90).map(item => item.id));
    expect(changed).not.toHaveBeenCalled();
  });
  it('reads a thread history completely, oldest first, and refreshes it when the workspace revision changes', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.api, 'audit')
      .mockResolvedValueOnce({ events: [event(3), event(2)], nextBefore: 'e2' })
      .mockResolvedValueOnce({ events: [event(1)], nextBefore: null })
      .mockResolvedValue({ events: [event(4), event(3), event(2), event(1)], nextBefore: null });
    expect(controller.threadEvents('t1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.threadEvents('t1')?.map(item => item.id)).toEqual(['e1', 'e2', 'e3']));
    expect(request).toHaveBeenNthCalledWith(1, controller.workspace, { threadId: 't1', limit: 100 });
    expect(request).toHaveBeenNthCalledWith(2, controller.workspace, { threadId: 't1', limit: 100, before: 'e2' });
    publish(controller, summary => {
      summary.name = 'Same revision data';
      summary.revision -= 1;
    });
    await controller.refresh();
    expect(controller.threadEvents('t1')?.map(item => item.id)).toEqual(['e1', 'e2', 'e3']);
    expect(request).toHaveBeenCalledTimes(2);
    publish(controller, () => undefined);
    await controller.refresh();
    expect(controller.threadEvents('t1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.threadEvents('t1')).toHaveLength(4));
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('commit history pages', () => {
  const page = (ids: string[], nextBefore: string | null): CommitPage => ({
    commits: ids.map((id, index) => metadata(commitOf(id, ids[index + 1] ?? null, id))),
    nextBefore
  });
  const pullRequest = (id: string, taskId: string) => ({
    id,
    taskId,
    authorId: 'alice',
    title: id,
    description: '',
    target: 'shared' as const,
    status: 'review' as const,
    revision: 1,
    candidateId: null,
    subscribers: []
  });
  const shared = { branch: 'shared' } as const;
  const ids = (controller: CollaborationController, branch: Parameters<CollaborationController['commitHistory']>[0]) =>
    controller.commitHistory(branch)?.commits.map(commit => commit.id);
  it('serves the empty shared branch and a PR whose task has no commits of its own without a request', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.api, 'history');
    expect(controller.commitHistory(shared)).toEqual({ commits: [], hasEarlier: false });
    publish(controller, summary => {
      summary.tasks[0] = { ...summary.tasks[0], base: 'c1', head: 'c1' };
      summary.prs.push(pullRequest('pr', 'task'));
    });
    await controller.refresh();
    expect(controller.commitHistory({ prId: 'pr' })).toEqual({ commits: [], hasEarlier: false });
    expect(request).not.toHaveBeenCalled();
  });
  it('reads the first page of the shared history once, announces it and keys it by the summary head', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.head = 'm2';
    });
    await controller.refresh();
    const request = vi
      .spyOn(controller.api, 'history')
      .mockResolvedValueOnce(page(['m2', 'm1'], null))
      .mockResolvedValueOnce(page(['m3', 'm2', 'm1'], null));
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, { branch: 'shared' });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(controller.commitHistory(shared)).toEqual({ commits: page(['m2', 'm1'], null).commits, hasEarlier: false });
    publish(controller, summary => {
      summary.name = 'Same head';
    });
    await controller.refresh();
    expect(ids(controller, shared)).toEqual(['m2', 'm1']);
    expect(request).toHaveBeenCalledTimes(1);
    publish(controller, summary => {
      summary.head = 'm3';
    });
    await controller.refresh();
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(ids(controller, shared)).toEqual(['m3', 'm2', 'm1']));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('reads a PR history from the head of its source task and loads earlier pages through the cursor', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.tasks[0] = { ...summary.tasks[0], head: 't3' };
      summary.prs.push(pullRequest('pr', 'task'));
    });
    await controller.refresh();
    const request = vi
      .spyOn(controller.api, 'history')
      .mockResolvedValueOnce(page(['t3', 't2'], 't2'))
      .mockResolvedValueOnce(page(['t1'], null));
    expect(controller.commitHistory({ prId: 'pr' })).toBeUndefined();
    await vi.waitFor(() => expect(controller.commitHistory({ prId: 'pr' })?.hasEarlier).toBe(true));
    expect(request).toHaveBeenCalledWith(controller.workspace, { prId: 'pr' });
    await controller.loadEarlierCommits({ prId: 'pr' });
    expect(request).toHaveBeenLastCalledWith(controller.workspace, { prId: 'pr', before: 't2' });
    expect(ids(controller, { prId: 'pr' })).toEqual(['t3', 't2', 't1']);
    expect(controller.commitHistory({ prId: 'pr' })?.hasEarlier).toBe(false);
    await controller.loadEarlierCommits({ prId: 'pr' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('reports a failed history read once, does not retry by itself and tries again after a refresh', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.head = 'm1';
    });
    await controller.refresh();
    const request = vi
      .spyOn(controller.api, 'history')
      .mockRejectedValueOnce(new CollaborationError('internal', '服务暂时不可用，请稍后按原请求重试'))
      .mockResolvedValue(page(['m1'], null));
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(controller.message).toBe('服务暂时不可用，请稍后按原请求重试'));
    for (let index = 0; index < 3; index++) expect(controller.commitHistory(shared)).toBeUndefined();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    publish(controller, () => undefined);
    await controller.refresh();
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(ids(controller, shared)).toEqual(['m1']));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not show a first page that starts above the summary head, and reads it again silently after the next refresh', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.head = 'm1';
    });
    await controller.refresh();
    // 读摘要之后共享分支又合并了一次：服务端返回的第一页从 m2 开始，与摘要的头对不上
    const request = vi
      .spyOn(controller.api, 'history')
      .mockResolvedValueOnce(page(['m2', 'm1'], null))
      .mockResolvedValue(page(['m2', 'm1'], null));
    expect(controller.commitHistory(shared)).toBeUndefined();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(controller.message).toBe('');
    publish(controller, summary => {
      summary.head = 'm2';
    });
    await controller.refresh();
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(ids(controller, shared)).toEqual(['m2', 'm1']));
  });
  it('forgets loaded history when switching team or locking the session', async () => {
    const { controller } = await setup();
    publish(controller, summary => {
      summary.head = 'm1';
    });
    await controller.refresh();
    const request = vi.spyOn(controller.api, 'history').mockResolvedValue(page(['m1'], null));
    controller.commitHistory(shared);
    await vi.waitFor(() => expect(controller.commitHistory(shared)).toBeDefined());
    const other = { teamId: 'other', appId: 'assets', name: 'Other' };
    await controller.selectWorkspace(other);
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(request).toHaveBeenLastCalledWith(other, { branch: 'shared' }));
    await controller.lock();
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('requests older than the receipt retention period', () => {
  const day = 86_400_000;
  const pendingKey = 'admin-collaboration-pending:alice';
  /** 把待确认请求的首次发出时间改成 `ms` 毫秒之前。 */
  const age = (ms: number) => {
    const record = JSON.parse(sessionStorage.getItem(pendingKey)!) as Record<string, unknown>;
    sessionStorage.setItem(pendingKey, JSON.stringify({ ...record, createdAt: Date.now() - ms }));
  };
  /** 发一个结果未知的命令，留下待确认请求。 */
  async function unconfirmed(controller: CollaborationController) {
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'operation')).rejects.toThrow(
      'network'
    );
    return send;
  }
  const expiredMessage = '上次请求已超过回执保留期，无法确认是否已生效，请核对团队状态后重新发送或放弃';
  it('records when a pending request was first sent, keeps that time across retries and out of the command', async () => {
    const { controller } = await setup();
    const before = Date.now();
    const send = await unconfirmed(controller);
    expect(controller.pending()!.createdAt).toBeGreaterThanOrEqual(before);
    age(5 * day);
    const aged = controller.pending()!.createdAt;
    send.mockRejectedValueOnce(new TypeError('network again'));
    await expect(controller.retryPending()).rejects.toThrow('network again');
    expect(controller.pending()!.createdAt).toBe(aged);
    expect(controller.pending()!.command).not.toHaveProperty('createdAt');
    expect(send.mock.calls[1][1]).not.toHaveProperty('createdAt');
    expect(controller.pendingExpired()).toBe(false);
  });
  it('stops automatic retries one day before the server forgets the receipt', async () => {
    const { controller } = await setup();
    await unconfirmed(controller);
    age(29 * day - 60_000);
    expect(controller.pendingExpired()).toBe(false);
    age(29 * day);
    expect(controller.pendingExpired()).toBe(true);
  });
  it('does not resend an expired request whose receipt is unknown and keeps it for the user to decide', async () => {
    const { controller } = await setup();
    const send = await unconfirmed(controller);
    age(31 * day);
    await expect(controller.retryPending()).rejects.toMatchObject({ code: 'expired', message: expiredMessage });
    expect(controller.api.receipt).toHaveBeenLastCalledWith(controller.workspace, 'operation');
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.pending()?.command.operationId).toBe('operation');
    await expect(controller.run({ type: 'policy', stages: [], expectedVersion: 1 })).rejects.toMatchObject({
      code: 'pending'
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('still confirms an expired request from its receipt when the server has kept it', async () => {
    const { controller } = await setup();
    const send = await unconfirmed(controller);
    age(40 * day);
    vi.mocked(controller.api.receipt).mockResolvedValue({ status: 'accepted', value: { policyVersion: 2 } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.pending()).toBeNull();
  });
  it('resends an expired request only on explicit confirmation, with its original operation ID', async () => {
    const { controller } = await setup();
    const send = await unconfirmed(controller);
    age(31 * day);
    send.mockResolvedValueOnce({ policyVersion: 2 });
    await controller.resendPending();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual({ type: 'policy', stages: [], expectedVersion: 1, operationId: 'operation' });
    expect(controller.pending()).toBeNull();
  });
  it('discards an expired request at the user’s request and then accepts new cloud changes', async () => {
    const { controller } = await setup();
    const send = await unconfirmed(controller);
    age(31 * day);
    controller.discardPending();
    expect(controller.pending()).toBeNull();
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
    send.mockResolvedValueOnce({ policyVersion: 2 });
    await controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'next');
    expect(send.mock.calls.map(([, command]) => command.operationId)).toEqual(['operation', 'next']);
  });
  it('treats a pending record without a valid creation time as corrupted', async () => {
    const { controller } = await setup();
    const command = { type: 'policy', stages: [], expectedVersion: 1, operationId: 'old' };
    for (const createdAt of [undefined, 'yesterday', null]) {
      sessionStorage.setItem(pendingKey, JSON.stringify({ workspace: controller.workspace, command, createdAt }));
      expect(controller.pending()).toBeNull();
      expect(sessionStorage.getItem(pendingKey)).toBeNull();
    }
  });
});

describe('queued uploads older than the receipt retention period', () => {
  const day = 86_400_000;
  const uploadMessage = '待上传提交已超过回执保留期，请核对远端版本后确认同步';
  /** 草稿里留下一个上传结果未知的提交。 */
  async function queued(controller: CollaborationController) {
    await controller.save({ c: { entity: 'AssetCategory', fields: { name: 'Queued' } } });
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.sync(false)).rejects.toThrow('network');
    return send;
  }
  /** 把队首上传条目的形成时间改成 `ms` 毫秒之前；`undefined` 模拟切片 D 之前写入、没有形成时间的条目。 */
  async function ageUpload(controller: CollaborationController, storage: MemoryStorage, ms: number | undefined) {
    const key = contextKey(controller.draft!.context);
    const draft = (await storage.read(key))!;
    const [first, ...rest] = draft.queue;
    const aged = { ...first, createdAt: ms === undefined ? undefined : Date.now() - ms };
    if (ms === undefined) delete aged.createdAt;
    storage.rows.set(key, { ...draft, queue: [aged, ...rest] });
    controller.draft = (await storage.read(key))!;
    return first;
  }
  it('acknowledges an expired upload locally when the remote task head already is its last commit', async () => {
    const { controller, storage } = await setup();
    const send = await queued(controller);
    const item = await ageUpload(controller, storage, 31 * day);
    const head = item.commits.at(-1)!.id;
    publish(controller, summary => {
      summary.tasks[0].head = head;
    });
    await controller.sync(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.draft?.queue).toEqual([]);
    expect(controller.draft?.remoteHead).toBe(head);
    expect(controller.uploadExpired()).toBe(false);
  });
  it('does not resend an expired upload whose outcome is unknown and hands it to the user', async () => {
    const { controller, storage } = await setup();
    const send = await queued(controller);
    await ageUpload(controller, storage, 31 * day);
    expect(controller.uploadExpired()).toBe(true);
    await expect(controller.sync(false)).rejects.toMatchObject({ code: 'expired', message: uploadMessage });
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.draft?.queue).toHaveLength(1);
    expect(controller.syncing).toBe(false);
  });
  it('treats a queued upload without a creation time as expired', async () => {
    const { controller, storage } = await setup();
    const send = await queued(controller);
    await ageUpload(controller, storage, undefined);
    expect(controller.uploadExpired()).toBe(true);
    await expect(controller.sync(false)).rejects.toMatchObject({ code: 'expired' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends an expired upload on confirmation with the same operation and commits, never its creation time', async () => {
    const { controller, storage } = await setup();
    const send = await queued(controller);
    const first = send.mock.calls[0][1];
    const item = await ageUpload(controller, storage, 31 * day);
    send.mockResolvedValueOnce({ head: item.commits.at(-1)!.id });
    await controller.sync(false, true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(first);
    expect(send.mock.calls[1][1]).not.toHaveProperty('createdAt');
    expect(controller.draft?.queue).toEqual([]);
  });
  it('keeps uploading fresh queued commits automatically', async () => {
    const { controller } = await setup();
    const send = await queued(controller);
    expect(controller.uploadExpired()).toBe(false);
    send.mockResolvedValueOnce({ head: controller.draft!.localHead });
    await controller.sync(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(controller.draft?.queue).toEqual([]);
  });
});
