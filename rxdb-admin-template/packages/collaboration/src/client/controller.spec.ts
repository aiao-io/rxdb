import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
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
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin: user },
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
    {}
  );
  vi.spyOn(controller.api, 'snapshot').mockResolvedValue(controller.snapshot);
  vi.spyOn(controller.api, 'receipt').mockResolvedValue({ status: 'unknown' });
  return { controller, storage };
}
afterEach(() => {
  controllers.splice(0).forEach(c => c.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function authFixture(userId = 'alice') {
  const session: Session = {
    access_token: 'access', refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, email: `${userId}@example.test`, email_confirmed_at: '2026-11-16', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-16' }
  };
  let listener: (event: string, session: Session | null) => void = () => undefined;
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => { listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; })
  };
  vi.mocked(createClient).mockReturnValue({ auth } as unknown as ReturnType<typeof createClient>);
  return { session, auth, emit: (event: string, value: Session | null) => listener(event, value) };
}
async function initialized(userId = 'alice') {
  const setupValue = await setup();
  const fixture = authFixture(userId);
  vi.spyOn(setupValue.controller.api, 'config').mockResolvedValue({ supabaseUrl: 'http://auth.test', supabaseKey: 'public-key' });
  vi.spyOn(setupValue.controller.api, 'workspaces').mockResolvedValue([{ teamId: 'team', appId: 'assets', name: 'Team' }]);
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
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'alice@example.test', options: { shouldCreateUser: true } });
    await controller.verify('alice@example.test', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'alice@example.test', token: '123456', type: 'email' });
    await controller.logout();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem('admin-collaboration-grant:/test')).toBeNull();
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
    const cold = new CollaborationController('/test', storage); controllers.push(cold);
    await cold.initialize();
    expect(cold.user?.id).toBe('alice');
    expect(cold.offlineDrafts).toHaveLength(1);
    await cold.openOffline(cold.offlineDrafts[0]);
    await cold.refresh();
    expect(cold.online).toBe(false);
    const grant = JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!);
    localStorage.setItem('admin-collaboration-grant:/test', JSON.stringify({ ...grant, expiresAt: 1 }));
    const expired = new CollaborationController('/test', storage); controllers.push(expired);
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
    const send = vi.spyOn(controller.api, 'command').mockImplementation(() => new Promise((_resolve, failure) => { reject = failure; }));
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
    vi.spyOn(storage, 'read').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
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
    const head = command.commits.at(-1)!.id;
    controller.snapshot!.tasks.push({ id: command.id, name: command.name, ownerId: 'alice', base: null, head, originTaskId: 'task' });
    command.commits.forEach(commit => { controller.snapshot!.commits[commit.id] = commit; });
    vi.mocked(controller.api.receipt).mockResolvedValue({ status: 'accepted', value: { taskId: command.id, head } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.draft?.context.taskId).toBe(command.id);
    expect((await controller.local.read(context))?.forkArchive).toEqual({ taskId: command.id, head });
    expect((await controller.local.fastForward(context, 'remote', {}, false)).queue).toEqual([]);
  });

});
