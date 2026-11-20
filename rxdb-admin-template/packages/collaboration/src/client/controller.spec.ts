import { computeCommitExchangeRecordFingerprint } from '@aiao/rxdb-plugin-working-tree/exchange';
import { createClient, type Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskCommit } from '../commit.testing.js';
import {
  CollaborationError,
  type Audit,
  type Command,
  type CommitContent,
  type CommitPage,
  type Identity,
  type PullRequestDetail,
  type Records,
  type WorkspaceSummary
} from '../model.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import { MemoryWorkspace } from '../server/memory.testing.js';
import { CollaborationController } from './controller.js';
import { TaskLedger, type Context } from './task-ledger.js';
import type { TeamScope } from './team-database.js';
import { memoryDownload } from './team-server.testing.js';
import { MemoryTeamDatabase, memoryStorage } from './team.testing.js';
import { teamPageOf, teamSummary } from './view.testing.js';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const controllers: CollaborationController[] = [];
/** 夹具工作区的共享分支根（共享头的初值）：初始化时的标识生成器恒给 'id'。 */
const root = 'id';
const alice: Identity = { id: 'alice', email: 'alice@example.test', verified: true };
const aliceTask: Context = { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 'task' };
function browserStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key)
  };
}
/** 每个作用域一个内存团队库：同一作用域重开拿到同一个（像浏览器里同名的 IndexedDB 库），关闭只做记号。 */
function teamDatabases() {
  const opened = new Map<string, MemoryTeamDatabase>();
  const open = async (scope: TeamScope) => {
    const key = JSON.stringify([scope.userId, scope.teamId, scope.appId]);
    const database = opened.get(key) ?? new MemoryTeamDatabase(scope);
    database.closed = false;
    opened.set(key, database);
    return database;
  };
  const of = (userId = 'alice', teamId = 'team') => opened.get(JSON.stringify([userId, teamId, 'assets']))!;
  return { open, of };
}
/**
 * 已登录、选中团队并打开了自己的任务 `task` 的控制器。服务端是内存工作区（与 PostgreSQL 同一个引擎），下发接口经
 * {@link memoryDownload}；团队页、回执与数据模式的读取各有替身；团队库是内存桩，任务分支从共享分支根建出。
 */
async function setup() {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', browserStorage());
  vi.stubGlobal('sessionStorage', browserStorage());
  const storage = memoryStorage();
  const databases = teamDatabases();
  const ledger = new TaskLedger(storage);
  const controller = new CollaborationController('/test', databases.open, ledger);
  controllers.push(controller);
  // 标识生成器恒给 'id'：共享分支根（也是共享头）就是 'id'
  const space = MemoryWorkspace.create(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin: alice, schema: assetSchema },
    { now: 1, id: () => 'id' }
  );
  space.state.tasks['task'] = {
    id: 'task',
    name: 'Task',
    ownerId: 'alice',
    base: root,
    head: root,
    originTaskId: null
  };
  controller.user = alice;
  controller.workspace = { teamId: 'team', appId: 'assets', name: 'Team' };
  controller.snapshot = teamSummary(space.state, alice);
  await controller.tasks.login('alice');
  vi.spyOn(controller.reader, 'team').mockResolvedValue(teamPageOf(controller.snapshot));
  vi.spyOn(controller.reader, 'receipt').mockResolvedValue({ status: 'unknown' });
  vi.spyOn(controller.reader, 'schema').mockResolvedValue(assetSchema);
  const download = memoryDownload(space);
  const exchange = vi
    .spyOn(controller.reader, 'exchange')
    .mockImplementation(async (_workspace, branch, known) => download(branch, known));
  await controller.openTask('task');
  return { controller, storage, ledger, space, exchange, databases, database: databases.of() };
}
afterEach(() => {
  controllers.splice(0).forEach(c => c.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
let serial = 0;
/**
 * 让命令与团队页都走内存服务端：命令由引擎执行（建任务、上传、另存、合并都按真实规则裁决），团队页每次从服务端状态重新算出，
 * 用于新建任务、恢复、导入与分叉这类要服务端配合的流程。
 */
function live(controller: CollaborationController, space: MemoryWorkspace) {
  const send = vi
    .spyOn(controller.api, 'command')
    .mockImplementation(async (_workspace, command) =>
      space.run(alice, command, { now: Date.now(), id: () => `server-${++serial}` })
    );
  vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
  return send;
}
/** 以另一台设备的身份直接向服务端上传任务 `task` 的一个提交（改分类名），返回提交 ID。 */
async function uploadFromAnotherDevice(space: MemoryWorkspace, taskId = 'task', name = '另一台设备') {
  const parent = space.state.tasks[taskId].head;
  const commit = taskCommit({
    id: `remote-${++serial}`,
    parent,
    authorId: 'alice',
    message: name,
    changes: diffAssets({}, { [`category-${serial}`]: { entity: 'AssetCategory', fields: { name } } })
  });
  await space.run(
    alice,
    { type: 'upload', taskId, expectedHead: parent, commits: [commit], operationId: `op-${serial}` } as Command,
    {
      now: Date.now(),
      id: () => `server-${++serial}`
    }
  );
  return commit.commitId;
}
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
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    presenceState: vi.fn(() => ({})),
    track: vi.fn().mockResolvedValue('ok')
  };
  vi.mocked(createClient).mockReturnValue({
    auth,
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn().mockResolvedValue('ok')
  } as unknown as ReturnType<typeof createClient>);
  return { session, auth, channel, emit: (event: string, value: Session | null) => listener(event, value) };
}
async function initialized(userId = 'alice') {
  const setupValue = await setup();
  const fixture = authFixture(userId);
  vi.spyOn(setupValue.controller.api, 'config').mockResolvedValue({
    supabaseUrl: 'http://auth.test',
    supabaseKey: 'public-key'
  });
  vi.spyOn(setupValue.controller.reader, 'workspaces').mockResolvedValue([
    { teamId: 'team', appId: 'assets', name: 'Team' }
  ]);
  await setupValue.controller.initialize();
  return { ...setupValue, ...fixture };
}
/**
 * 刷新页面：释放原控制器，以同一批团队库与给定账本新建控制器——新会话里任务都还没解锁、团队库也没打开；
 * 团队页、数据模式与下发接口照常走内存服务端，回执由用例自己给。
 */
async function reload(
  previous: CollaborationController,
  space: MemoryWorkspace,
  open: (scope: TeamScope) => Promise<MemoryTeamDatabase>,
  ledger: TaskLedger
) {
  previous.dispose();
  const controller = new CollaborationController('/test', open, ledger);
  controllers.push(controller);
  controller.user = alice;
  await controller.tasks.login('alice');
  vi.spyOn(controller.reader, 'team').mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
  vi.spyOn(controller.reader, 'schema').mockResolvedValue(assetSchema);
  const download = memoryDownload(space);
  vi.spyOn(controller.reader, 'exchange').mockImplementation(async (_workspace, branch, known) =>
    download(branch, known)
  );
  return controller;
}
/** 待确认的上传（账本里任务 `task` 的那一条）。 */
const pendingUpload = (ledger: TaskLedger) => ledger.read(aliceTask)!.uploads[0];

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
    await expect(controller.verify('alice@example.test', 'bad')).rejects.toThrow('登录失败，请稍后重试');
    auth.signInWithOtp.mockResolvedValueOnce({ error: new Error('rate limited') });
    await expect(controller.sendCode('alice@example.test')).rejects.toThrow('登录失败，请稍后重试');
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null });
    await expect(controller.verify('alice@example.test', '123456')).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(controller.user).toBeNull();
  });
  it('把 Supabase Auth 的错误换成产品词条：GoTrue 的英文原文不直接显示给用户，也不锁会话', async () => {
    const { controller, auth } = await initialized();
    await controller.lock();
    const authError = (message: string, code: string, status: number) =>
      Object.assign(new Error(message), { code, status });
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: authError('Token has expired or is invalid', 'otp_expired', 403)
    });
    await expect(controller.verify('alice@example.test', '000000')).rejects.toMatchObject({
      code: 'invalid',
      message: '验证码已过期或无效，请重新获取',
      details: { authCode: 'otp_expired', status: 403 }
    });
    auth.signInWithOtp.mockResolvedValueOnce({
      error: authError('email rate limit exceeded', 'over_email_send_rate_limit', 429)
    });
    await expect(controller.sendCode('alice@example.test')).rejects.toMatchObject({
      code: 'limit',
      message: '发送过于频繁，请稍后再试'
    });
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: authError('brand new', 'brand_new_code', 400)
    });
    await expect(controller.verify('alice@example.test', '000000')).rejects.toMatchObject({
      code: 'unavailable',
      message: '登录失败，请稍后重试',
      details: { authCode: 'brand_new_code', status: 400 }
    });
  });
  it('keeps a verified warm task editable when the provider expires its offline session, but explicit logout locks it', async () => {
    const { controller, emit, database } = await initialized();
    await controller.openTask('task');
    vi.stubGlobal('navigator', { onLine: false });
    emit('SIGNED_OUT', null);
    database.edit();
    await controller.sync();
    expect(controller.user?.id).toBe('alice');
    expect(controller.task).toMatchObject({ saved: 0, unpushed: 1 });
    expect(controller.message).toBe('已形成提交，联网验证后可同步');
    await controller.logout();
    expect(controller.user).toBeNull();
    expect(controller.task).toBeNull();
    expect(database.closed).toBe(true);
  });
  it('locks original user data and closes its team database before adopting another verified session', async () => {
    const { controller, ledger, database } = await initialized('bob');
    expect(controller.user?.id).toBe('bob');
    expect(controller.task).toBeNull();
    expect(ledger.list('alice')[0].locked).toBe(true);
    expect(database.closed).toBe(true);
    expect(controller.tasks.database).toBeUndefined();
    expect(() => controller.tasks.assert(aliceTask)).toThrow('团队草稿已锁定');
  });
  it('restores a cached offline context without issuing requests and rejects an expired grant', async () => {
    const { controller, storage, databases, database } = await initialized();
    database.edit();
    controller.dispose();
    vi.stubGlobal('navigator', { onLine: false });
    const cold = new CollaborationController('/test', databases.open, new TaskLedger(storage));
    controllers.push(cold);
    await cold.initialize();
    expect(vi.mocked(createClient).mock.calls.at(-1)?.[2]).toMatchObject({ auth: { autoRefreshToken: true } });
    expect(cold.user?.id).toBe('alice');
    expect(cold.offlineDrafts.map(entry => entry.context.taskId)).toEqual(['task']);
    const exchange = vi.spyOn(cold.reader, 'exchange');
    await cold.openOffline(cold.offlineDrafts[0]);
    expect(cold.task).toMatchObject({ saved: 1, branchId: database.active });
    expect(cold.teamDatabase()).toBe(database);
    expect(exchange).not.toHaveBeenCalled();
    await cold.refresh();
    expect(cold.online).toBe(false);
    const grant = JSON.parse(localStorage.getItem('admin-collaboration-grant:/test')!);
    localStorage.setItem('admin-collaboration-grant:/test', JSON.stringify({ ...grant, expiresAt: 1 }));
    const expired = new CollaborationController('/test', databases.open, new TaskLedger(storage));
    controllers.push(expired);
    await expect(expired.initialize()).rejects.toMatchObject({ code: 'locked' });
    expect(expired.user).toBeNull();
    expect(expired.offlineDrafts).toEqual([]);
  });
  it('refuses a revoked editing grant while retaining local work for future authorized recovery', async () => {
    const { controller, ledger, database } = await setup();
    database.edit();
    const branchId = controller.task!.branchId;
    const revoked = structuredClone(controller.snapshot!);
    revoked.members[0].permissions = ['read'];
    vi.mocked(controller.reader.team).mockResolvedValue(teamPageOf(revoked));
    await controller.refresh().catch(error => controller.failure(error));
    expect(controller.task).toBeNull();
    expect(database.branches.get(branchId)?.entries).toHaveLength(1);
    expect(ledger.read(aliceTask)?.locked).toBe(true);
    expect(database.closed).toBe(true);
  });
});
describe('client concurrency and recovery', () => {
  it('closes the team database only after the editor has been told to unmount when the session locks', async () => {
    const { controller, database } = await setup();
    const seen: { task: unknown; closed: boolean }[] = [];
    controller.addEventListener('change', () => seen.push({ task: controller.task, closed: database.closed }));
    await controller.lock();
    expect(seen[0]).toEqual({ task: null, closed: false });
    expect(database.closed).toBe(true);
    expect(controller.user).toBeNull();
  });

  it('retries an invitation without selecting a workspace before membership exists', async () => {
    const { controller } = await setup();
    const workspace = { teamId: 'new-team', appId: 'assets', name: 'New team' };
    const command = { type: 'accept_invite' as const, id: 'invite', tokenHash: 'token', operationId: 'invite-op' };
    controller.workspace = null;
    controller.snapshot = null;
    vi.mocked(controller.reader.receipt).mockResolvedValue({ status: 'unknown' });
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    vi.spyOn(controller.reader, 'workspaces').mockResolvedValue([workspace]);
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
    vi.mocked(controller.reader.receipt).mockRejectedValue(new CollaborationError('forbidden', '当前用户没有操作权限'));
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    vi.spyOn(controller.reader, 'workspaces').mockResolvedValue([workspace]);
    await controller.acceptInvitation('new-team', 'assets', 'invite', 'token');
    expect(controller.reader.receipt).not.toHaveBeenCalled();
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
    vi.mocked(controller.reader.team).mockReturnValueOnce(delayed.promise.then(teamPageOf));
    const send = vi.spyOn(controller.api, 'command').mockResolvedValue({});
    const first = controller.run({ type: 'policy', stages: [], expectedVersion: 1 }, 'first');
    await vi.waitFor(() => expect(controller.reader.team).toHaveBeenCalledTimes(2));
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
    vi.mocked(controller.reader.receipt).mockResolvedValue({ status: 'accepted', value: { policyVersion: 2 } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.pending()).toBeNull();
  });
  it('does not assign a late upload receipt to the next user or erase the original upload', async () => {
    const { controller, ledger, database } = await setup();
    database.edit();
    let finish: (value: Record<string, unknown>) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const syncing = controller.sync();
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const { head } = pendingUpload(ledger);
    await controller.logout();
    controller.user = { id: 'bob', email: 'bob@example.test', verified: true };
    await controller.tasks.login('bob');
    finish({ head });
    await expect(syncing).rejects.toMatchObject({ code: 'cancelled' });
    expect(controller.user.id).toBe('bob');
    expect(controller.task).toBeNull();
    expect(ledger.read(aliceTask)).toMatchObject({ remoteHead: root, uploads: [{ head }] });
  });
  it('preserves saved edits made while an upload is in flight in the next working tree', async () => {
    const { controller, ledger, database } = await setup();
    database.edit('original');
    let finish: (value: Record<string, unknown>) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const syncing = controller.sync();
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const { head } = pendingUpload(ledger);
    database.edit('newer');
    finish({ head });
    await syncing;
    expect(controller.task).toMatchObject({ saved: 1, unpushed: 0, remoteHead: head, localHead: head });
    expect(database.branch().entries.map(unit => unit.entityId)).toEqual(['newer']);
    expect(database.commits.get(head)?.units.map(unit => unit.entityId)).toEqual(['original']);
  });
  it('commits the whole working tree as one normal commit authored by the user and resends the very same commit on retry', async () => {
    const { controller, database } = await setup();
    database.edit('c');
    database.edit('d');
    const units = structuredClone(database.branch().entries);
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.sync()).rejects.toThrow('network');
    const first = send.mock.calls[0][1];
    if (first.type !== 'upload') throw new Error('expected an upload');
    expect(first).toMatchObject({ taskId: 'task', expectedHead: root });
    expect(first.commits).toHaveLength(1);
    const [commit] = first.commits;
    expect(commit).toMatchObject({ kind: 'normal', parentIds: [root], authorId: 'alice', message: 'Task' });
    expect(commit.units).toEqual(units);
    expect(commit.contentFingerprint).toBe(computeCommitExchangeRecordFingerprint(commit));
    expect(controller.task).toMatchObject({ saved: 0, unpushed: 1 });
    send.mockResolvedValueOnce({ head: commit.commitId });
    await controller.sync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(first);
    expect(controller.task).toMatchObject({ uploads: [], remoteHead: commit.commitId, unpushed: 0 });
    expect(controller.message).toBe('当前提交已同步；后续编辑仍需另行同步');
  });
  it('uploads every unsynced local commit in order after offline commits, not only the latest', async () => {
    const { controller, database } = await setup();
    vi.stubGlobal('navigator', { onLine: false });
    database.edit('a');
    await controller.sync();
    database.edit('b');
    await controller.sync();
    expect(controller.task?.unpushed).toBe(2);
    vi.stubGlobal('navigator', { onLine: true });
    const send = vi.spyOn(controller.api, 'command').mockImplementation(async (_workspace, command) => ({
      head: command.type === 'upload' ? command.commits.at(-1)?.commitId : undefined
    }));
    await controller.sync();
    const [upload] = send.mock.calls.map(([, command]) => command);
    if (upload.type !== 'upload') throw new Error('expected an upload');
    expect(upload.commits.map(commit => commit.parentIds[0])).toEqual([root, upload.commits[0].commitId]);
    expect(controller.task).toMatchObject({ unpushed: 0, remoteHead: upload.commits[1].commitId });
  });
  it('queues offline commits without attempting a cloud request', async () => {
    const { controller, database } = await setup();
    database.edit();
    vi.stubGlobal('navigator', { onLine: false });
    const send = vi.spyOn(controller.api, 'command');
    await controller.sync();
    expect(send).not.toHaveBeenCalled();
    expect(controller.task).toMatchObject({ saved: 0, unpushed: 1, uploads: [] });
  });
  it('syncs nothing for an empty working tree without unsynced commits and never forms an empty commit', async () => {
    const { controller, database } = await setup();
    const send = vi.spyOn(controller.api, 'command');
    await controller.sync();
    expect(send).not.toHaveBeenCalled();
    expect(database.log.filter(entry => entry.startsWith('commit:'))).toEqual([]);
  });
  it('ignores an old upload rejection after changing accounts', async () => {
    const { controller, database } = await setup();
    database.edit();
    let reject: (reason: unknown) => void = () => undefined;
    const send = vi.spyOn(controller.api, 'command').mockImplementation(
      () =>
        new Promise((_resolve, failure) => {
          reject = failure;
        })
    );
    const syncing = controller.sync().catch(error => controller.failure(error));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    await controller.logout();
    controller.user = { id: 'bob', email: 'bob@example.test', verified: true };
    await controller.tasks.login('bob');
    reject(new CollaborationError('forbidden', 'old account revoked'));
    await syncing;
    expect(controller.user?.id).toBe('bob');
    expect(controller.message).not.toBe('old account revoked');
  });
  it('does not resurrect an offline task after logout during its opening', async () => {
    const { controller, ledger, database } = await setup();
    const entry = ledger.read(aliceTask)!;
    const gate = Promise.withResolvers<void>();
    const switching = vi.spyOn(database, 'switchBranch').mockImplementationOnce(async () => gate.promise);
    const opening = controller.openOffline(entry).catch(error => controller.failure(error));
    await vi.waitFor(() => expect(switching).toHaveBeenCalled());
    const out = controller.logout();
    gate.resolve();
    await opening;
    await out;
    expect(controller.user).toBeNull();
    expect(controller.task).toBeNull();
    expect(controller.workspace).toBeNull();
  });
  it('recovers an accepted fork receipt, opens the fork on its own branch and lets the original follow the remote', async () => {
    const { controller, ledger, space, database } = await setup();
    database.edit('preserved');
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.fork('Saved fork')).rejects.toThrow('network');
    const pending = controller.pending()!;
    if (pending.command.type !== 'fork') throw new Error('expected fork');
    const command = pending.command;
    expect(command).toMatchObject({ taskId: 'task', expectedHead: root, name: 'Saved fork' });
    expect(command.commits).toHaveLength(1);
    expect(command.commits[0]).toMatchObject({ parentIds: [root], authorId: 'alice' });
    expect(command.commits[0].units.map(unit => unit.entityId)).toEqual(['preserved']);
    expect(command.commits[0].contentFingerprint).toBe(computeCommitExchangeRecordFingerprint(command.commits[0]));
    const head = command.commits.at(-1)!.commitId;
    // 服务端其实已经接受了这次另存：回执查得到，新任务在团队页里
    space.state.tasks[command.id] = {
      id: command.id,
      name: command.name,
      ownerId: 'alice',
      base: root,
      head,
      originTaskId: 'task'
    };
    vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
    vi.mocked(controller.reader.receipt).mockResolvedValue({ status: 'accepted', value: { taskId: command.id, head } });
    await controller.retryPending();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.task).toMatchObject({
      context: { taskId: command.id },
      localHead: head,
      remoteHead: head,
      unpushed: 0
    });
    expect(controller.task!.branchId).not.toBe(ledger.read(aliceTask)!.branchId);
    expect(ledger.read(aliceTask)?.forkArchive).toEqual({ taskId: command.id, head });
    await controller.openTask('task');
    await controller.fetchRemote();
    expect(controller.task).toMatchObject({ localHead: root, remoteHead: root, unpushed: 0, uploads: [] });
    expect(controller.task!.forkArchive).toBeUndefined();
  });
  it('recovers an accepted fork receipt after a page reload: the original task is reopened and unlocked before the fork lands', async () => {
    const { controller, storage, space, database, databases } = await setup();
    database.edit('preserved');
    vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.fork('Saved fork')).rejects.toThrow('network');
    const command = controller.pending()!.command;
    if (command.type !== 'fork') throw new Error('expected fork');
    const head = command.commits.at(-1)!.commitId;
    space.state.tasks[command.id] = {
      id: command.id,
      name: command.name,
      ownerId: 'alice',
      base: root,
      head,
      originTaskId: 'task'
    };
    // 刷新页面：账本、团队库与待确认请求都还在
    const ledger = new TaskLedger(storage);
    const reloaded = await reload(controller, space, databases.open, ledger);
    vi.spyOn(reloaded.reader, 'receipt').mockResolvedValue({ status: 'accepted', value: { taskId: command.id, head } });
    const send = vi.spyOn(reloaded.api, 'command');
    await reloaded.retryPending();
    expect(send).not.toHaveBeenCalled();
    expect(reloaded.pending()).toBeNull();
    expect(reloaded.task).toMatchObject({ context: { taskId: command.id }, localHead: head, remoteHead: head });
    expect(ledger.read(aliceTask)?.forkArchive).toEqual({ taskId: command.id, head });
  });
  it('lands an accepted fork from the server after a reload whose ledger no longer has the original task', async () => {
    const { controller, space, database, databases } = await setup();
    database.edit('preserved');
    vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.fork('Saved fork')).rejects.toThrow('network');
    const command = controller.pending()!.command;
    if (command.type !== 'fork') throw new Error('expected fork');
    const head = command.commits.at(-1)!.commitId;
    // 服务端其实已经接受了这次另存：提交原样存下，新任务在团队页里（桩的编辑不属于资产模式，所以直接放进服务端，不经引擎校验）
    command.commits.forEach(record => space.store.add({ record, candidateId: null }));
    space.state.tasks[command.id] = {
      id: command.id,
      name: command.name,
      ownerId: 'alice',
      base: root,
      head,
      originTaskId: 'task'
    };
    // 刷新页面且本机账本已清除：没有可带走的本机提交，新任务打开时按服务端的提交导入（与本机已有的同一个提交）
    const ledger = new TaskLedger(memoryStorage());
    const reloaded = await reload(controller, space, databases.open, ledger);
    vi.spyOn(reloaded.reader, 'receipt').mockResolvedValue({ status: 'accepted', value: { taskId: command.id, head } });
    await reloaded.retryPending();
    expect(reloaded.task).toMatchObject({
      context: { taskId: command.id },
      localHead: head,
      remoteHead: head,
      unpushed: 0
    });
    expect(ledger.read(aliceTask)).toBeUndefined();
  });
  it('keeps the original operation when the transport result is uncertain', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.api, 'command').mockRejectedValue(new CollaborationError('uncertain', '请求结果不确定'));
    await expect(
      controller.run({ type: 'task', id: 'uncertain', name: 'Uncertain', expectedHead: root }, 'uncertain-op')
    ).rejects.toThrow('请求结果不确定');
    expect(controller.pending()?.command.operationId).toBe('uncertain-op');
  });
  it('keeps the original operation when the command was accepted but refresh failed', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.api, 'command').mockResolvedValue({ taskId: 'accepted' });
    vi.spyOn(controller.reader, 'team').mockRejectedValue(new CollaborationError('forbidden', '刷新失败'));
    await expect(
      controller.run({ type: 'task', id: 'accepted', name: 'Accepted', expectedHead: root }, 'accepted-op')
    ).rejects.toThrow('刷新失败');
    expect(controller.pending()?.command.operationId).toBe('accepted-op');
  });
});
const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
/** 一个提交的内容：父为 null 时是从共享分支根起步的第一个提交。 */
const commitOf = (id: string, parent: string | null, name: string): CommitContent => ({
  id,
  parentIds: [parent ?? root],
  kind: 'normal',
  authorId: 'alice',
  message: id,
  createdAt: '2026-11-18T00:00:00.000Z',
  changes: [],
  records: records(name)
});
const metadata = ({ id, parentIds, kind, authorId, message, createdAt }: CommitContent) => ({
  id,
  parentIds,
  kind,
  authorId,
  message,
  createdAt
});
/** 在当前团队页上叠加改动并让读取返回它（修订号加一），模拟别人推进了工作区。 */
function publish(controller: CollaborationController, change: (summary: WorkspaceSummary) => void) {
  const next = structuredClone(controller.snapshot!);
  change(next);
  next.revision += 1;
  vi.mocked(controller.reader.team).mockResolvedValue(teamPageOf(next));
  return next;
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('on-demand content', () => {
  it('serves commit content on a miss with one request, announces the arrival and then answers from the cache', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.reader, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, { head: root, root }, 'c1');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(controller.commitContent('c1')?.records).toEqual(records('One'));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('shares one request between background reads and awaited loads of the same id, but not across ids', async () => {
    const { controller } = await setup();
    const reply = Promise.withResolvers<CommitContent>();
    const request = vi.spyOn(controller.reader, 'commit').mockReturnValue(reply.promise);
    const candidate = vi.spyOn(controller.reader, 'candidate');
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
    const request = vi.spyOn(controller.reader, 'candidate').mockResolvedValue(content);
    expect(controller.candidateContent('k1')).toBeUndefined();
    await expect(controller.loadCandidate('k1')).resolves.toBe(content);
    expect(controller.candidateContent('k1')).toBe(content);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, { head: root, root }, 'k1');
  });
  it('keeps immutable commits across refreshes', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.reader, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    await controller.loadCommit('c1');
    publish(controller, () => undefined);
    await controller.refresh();
    expect(controller.commitContent('c1')?.id).toBe('c1');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('records a failed read once, shows the error, does not retry by itself and tries again after a refresh', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.reader, 'commit')
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
      .spyOn(controller.reader, 'commit')
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
    const request = vi.spyOn(controller.reader, 'commit');
    expect(controller.commitContent('c1')).toBeUndefined();
    expect(controller.candidateContent('k1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.message).toBe('先选择团队'));
    expect(controller.user?.id).toBe('alice');
    expect(request).not.toHaveBeenCalled();
  });
  it('serves the empty shared branch without a request', async () => {
    const { controller } = await setup();
    const request = vi.spyOn(controller.reader, 'records');
    // 头还是共享分支根：没有任何合并，不发请求
    expect(controller.snapshot!.head).toBe(controller.snapshot!.root);
    expect(controller.sharedRecords()).toEqual({});
    await expect(controller.loadSharedRecords()).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
  it('caches shared records by the summary head and drops them as soon as the head changes', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.reader, 'records')
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
    // 读取接口核对服务端的共享头：已不是请求里的头时报 stale（见 reader.ts），这里的替身照此行为
    const request = vi.spyOn(controller.reader, 'records').mockImplementation(async (_workspace, head) => {
      if (head !== 'h2') throw new CollaborationError('stale', '版本已变化，请刷新后重试');
      return { head: 'h2', records: records('Second') };
    });
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
      .spyOn(controller.reader, 'commit')
      .mockReturnValueOnce(late.promise)
      .mockResolvedValue(commitOf('c1', null, 'Other team'));
    controller.commitContent('c1');
    await controller.selectWorkspace({ teamId: 'other', appId: 'assets', name: 'Other' });
    late.resolve(commitOf('c1', null, 'Old team'));
    await settle();
    expect(controller.commitContent('c1')).toBeUndefined();
    await vi.waitFor(() => expect(controller.commitContent('c1')?.records).toEqual(records('Other team')));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(
      { teamId: 'other', appId: 'assets', name: 'Other' },
      { head: root, root },
      'c1'
    );
  });
  it('forgets all content when the session locks', async () => {
    const { controller } = await setup();
    vi.spyOn(controller.reader, 'commit').mockResolvedValue(commitOf('c1', null, 'One'));
    await controller.loadCommit('c1');
    await controller.lock();
    expect(controller.snapshot).toBeNull();
    controller.workspace = { teamId: 'team', appId: 'assets', name: 'Team' };
    expect(controller.commitContent('c1')).toBeUndefined();
  });
});

describe('团队任务落在团队库的 working-tree 上（ADMIN-US-221）', () => {
  it('新设备打开任务：镜像共享分支、从共同起点建分支，再导入任务已有的提交，提交 ID、父链与作者与服务端一致（AC#1）', async () => {
    const { controller, space, exchange, databases } = await setup();
    const remote = await uploadFromAnotherDevice(space);
    space.state.tasks['task2'] = {
      id: 'task2',
      name: 'Second',
      ownerId: 'alice',
      base: root,
      head: root,
      originTaskId: null
    };
    const second = await uploadFromAnotherDevice(space, 'task2', '第二个任务');
    vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
    exchange.mockClear();
    await controller.openTask('task2');
    expect(controller.task).toMatchObject({ localHead: second, remoteHead: second, saved: 0, unpushed: 0 });
    expect(controller.task!.commits).toEqual([
      { id: second, parentId: root, authorId: 'alice', message: '第二个任务', synced: true }
    ]);
    expect(exchange.mock.calls.map(([, branch, known]) => [branch, known])).toEqual([
      [{ branch: 'shared' }, [root]],
      [{ taskId: 'task2' }, [root]]
    ]);
    const log = databases.of().log;
    expect(log.slice(-3)).toEqual([
      `branch:${controller.task!.branchId}@${root}`,
      `switch:${controller.task!.branchId}`,
      `import:${second}`
    ]);
    expect(remote).not.toBe(second);
  });
  it('已有本机分支的任务只切过去，内容原样保留，不下发也不覆盖', async () => {
    const { controller, exchange, database } = await setup();
    database.edit('kept');
    const branchId = controller.task!.branchId;
    await controller.selectWorkspace({ teamId: 'team', appId: 'assets', name: 'Team' });
    expect(controller.task).toBeNull();
    exchange.mockClear();
    await controller.openTask('task');
    expect(exchange).not.toHaveBeenCalled();
    expect(controller.task).toMatchObject({ branchId, saved: 1 });
  });
  it('下发失败时任务不打开，账本里没有它', async () => {
    const { controller, space, exchange, ledger } = await setup();
    space.state.tasks['task2'] = {
      id: 'task2',
      name: 'Second',
      ownerId: 'alice',
      base: root,
      head: root,
      originTaskId: null
    };
    vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
    exchange.mockRejectedValue(new CollaborationError('unavailable', '读取团队数据失败，请稍后重试'));
    await expect(controller.openTask('task2')).rejects.toMatchObject({ message: '读取团队数据失败，请稍后重试' });
    expect(controller.task).toBeNull();
    expect(ledger.list('alice').map(entry => entry.context.taskId)).toEqual(['task']);
  });
  it('拉取远端版本：本机干净时快进到另一台设备上传的提交；本机有已保存或未同步的改动时拒绝（ADMIN-US-206 AC#6）', async () => {
    const { controller, space, database } = await setup();
    const remote = await uploadFromAnotherDevice(space);
    vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
    database.edit();
    await expect(controller.fetchRemote()).rejects.toMatchObject({ code: 'dirty' });
    expect(controller.task).toMatchObject({ remoteHead: root, saved: 1 });
    await controller.discardDraft();
    await controller.fetchRemote();
    expect(controller.task).toMatchObject({ localHead: remote, remoteHead: remote, saved: 0, unpushed: 0 });
  });
  it('拉取远端版本下发失败时保留本机任务', async () => {
    const { controller, space, exchange } = await setup();
    await uploadFromAnotherDevice(space);
    vi.mocked(controller.reader.team).mockImplementation(async () => teamPageOf(teamSummary(space.state, alice)));
    exchange.mockRejectedValue(new CollaborationError('internal', 'down'));
    await expect(controller.fetchRemote()).rejects.toMatchObject({ message: 'down' });
    expect(controller.task).toMatchObject({ remoteHead: root, localHead: root });
  });
  it('放弃草稿：工作树退回任务头，界面随即显示没有已保存未提交的改动（AC#3）', async () => {
    const { controller, database } = await setup();
    database.edit();
    database.edit();
    await controller.refreshTask();
    expect(controller.task?.saved).toBe(2);
    await controller.discardDraft();
    expect(database.log.at(-1)).toBe('discard');
    expect(controller.task).toMatchObject({ saved: 0, restoring: false });
    expect(controller.message).toBe('已放弃草稿，任务回到上次提交的版本');
  });
  it('保存之后自动重读任务状态：团队库的本地写入触发一次重读，同一轮里的多次写入合并成一次', async () => {
    const { controller, database } = await setup();
    const view = vi.spyOn(controller.tasks, 'view');
    database.edit();
    database.edit();
    await vi.waitFor(() => expect(controller.task?.saved).toBe(2));
    expect(view).toHaveBeenCalledTimes(1);
  });
  it('从历史版本创建恢复草稿：新任务从当前共享头起步，恢复成所选提交的数据，差异是未提交改动（AC#5）', async () => {
    const { controller, space } = await setup();
    const send = live(controller, space);
    const merged = await mergedShared(space);
    await controller.refresh();
    await controller.restoreVersion(root, '恢复 起点');
    expect(controller.task).toMatchObject({
      name: '恢复 起点',
      base: merged,
      localHead: merged,
      saved: 1,
      restoring: true
    });
    expect(controller.message).toBe('已从历史版本形成未提交改动，同步后进入审核');
    expect(space.state.head).toBe(merged);
    expect(send.mock.calls.map(([, command]) => command.type)).toEqual(['task']);
    await controller.restoreVersion(merged, '恢复 当前');
    expect(controller.task).toMatchObject({ saved: 0, restoring: false });
    expect(controller.message).toBe('所选版本与当前共享版本相同，没有需要恢复的改动');
  });
  it('恢复只在合并带进来的侧枝上的提交被拒，提示走词条，不改任何东西', async () => {
    const { controller, space } = await setup();
    live(controller, space);
    await mergedShared(space);
    await controller.refresh();
    const side = space.store.record(space.state.head)!.parentIds[1];
    await expect(controller.restoreVersion(side, '恢复 侧枝')).rejects.toMatchObject({
      code: 'restore',
      message: '所选版本只在合并带进来的侧枝上，无法直接恢复',
      details: { reason: 'side_branch_target' }
    });
    expect(controller.task).toMatchObject({ saved: 0, restoring: false });
  });
  it('导入匿名数据：新建任务，按引用顺序把记录写进任务分支的工作树，不提交、不上传（ADMIN-US-204 AC#2）', async () => {
    const { controller, space, databases } = await setup();
    const send = live(controller, space);
    const records: Records = {
      asset: { entity: 'Asset', fields: { name: '本机电脑', categoryId: 'category' } },
      category: { entity: 'AssetCategory', fields: { name: '本机分类' } }
    };
    await controller.importRecords('导入本机资产', records, assetSchema);
    expect(databases.of().writes).toEqual([{ records, order: ['AssetCategory', 'Asset', 'AssetEvent'] }]);
    expect(controller.task).toMatchObject({ name: '导入本机资产', saved: 2, unpushed: 0 });
    expect(send.mock.calls.map(([, command]) => command.type)).toEqual(['task']);
    expect(controller.message).toBe('已复制到任务工作树，尚未提交或同步');
  });
  it('切换到另一个团队：先关闭任务（编辑界面卸载），再关上一个团队库；回到原团队重开同一个库', async () => {
    const { controller, database } = await setup();
    vi.mocked(controller.reader.team).mockResolvedValue({
      ...teamPageOf(controller.snapshot!),
      teamId: 'other',
      name: 'Other'
    });
    await controller.selectWorkspace({ teamId: 'other', appId: 'assets', name: 'Other' });
    expect(controller.task).toBeNull();
    expect(database.closed).toBe(true);
    expect(controller.tasks.database).toBeUndefined();
  });
});

describe('编辑界面里有未保存的输入时，会卸载编辑界面或改写任务的动作一律拦下（ADMIN-US-205 AC#5）', () => {
  const unsaved = { code: 'unsaved', message: '先在编辑界面里保存或取消未保存的输入' };
  it('同步、另存为新任务、拉取远端版本与放弃草稿被拒：不形成提交、不发请求，工作树原样保留', async () => {
    const { controller, space, database } = await setup();
    const send = live(controller, space);
    database.edit();
    await controller.refreshTask();
    controller.unsavedInput = true;
    await expect(controller.sync()).rejects.toMatchObject(unsaved);
    await expect(controller.sync(true)).rejects.toMatchObject(unsaved);
    await expect(controller.fork('保留本机')).rejects.toMatchObject(unsaved);
    await expect(controller.fetchRemote()).rejects.toMatchObject(unsaved);
    await expect(controller.discardDraft()).rejects.toMatchObject(unsaved);
    expect(controller.syncing).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(database.log).not.toContain('discard');
    expect(controller.task).toMatchObject({ context: aliceTask, saved: 1, unpushed: 0 });
  });
  it('切换团队、打开或新建任务、导入、恢复、重放上次请求与退出被拒：任务保持打开，编辑界面不卸载', async () => {
    const { controller, space, databases, ledger } = await setup();
    const send = live(controller, space);
    controller.unsavedInput = true;
    const other = { teamId: 'other', appId: 'assets', name: 'Other' };
    await expect(controller.selectWorkspace(other)).rejects.toMatchObject(unsaved);
    await expect(controller.acceptInvitation('other', 'assets', 'invite', 'token')).rejects.toMatchObject(unsaved);
    await expect(controller.createTask('新任务')).rejects.toMatchObject(unsaved);
    await expect(controller.openTask('task')).rejects.toMatchObject(unsaved);
    await expect(controller.importRecords('导入', {}, assetSchema)).rejects.toMatchObject(unsaved);
    await expect(controller.restoreVersion(root, '恢复')).rejects.toMatchObject(unsaved);
    await expect(controller.retryPending()).rejects.toMatchObject(unsaved);
    await expect(controller.resendPending()).rejects.toMatchObject(unsaved);
    await expect(controller.openOffline(ledger.read(aliceTask)!)).rejects.toMatchObject(unsaved);
    await expect(controller.logout()).rejects.toMatchObject(unsaved);
    expect(send).not.toHaveBeenCalled();
    expect(controller.user).toEqual(alice);
    expect(controller.workspace).toMatchObject({ teamId: 'team' });
    expect(controller.task).toMatchObject({ context: aliceTask });
    expect(databases.of().closed).toBe(false);
  });
  it('会话失效引起的锁定不受它拦：照常锁定并关闭任务（安全优先，输入随编辑界面一起丢弃）', async () => {
    const { controller } = await setup();
    controller.unsavedInput = true;
    await controller.lock();
    expect(controller.user).toBeNull();
    expect(controller.task).toBeNull();
  });
  it('输入保存或取消之后照常执行', async () => {
    const { controller, database } = await setup();
    database.edit();
    await controller.refreshTask();
    controller.unsavedInput = true;
    await expect(controller.discardDraft()).rejects.toMatchObject(unsaved);
    controller.unsavedInput = false;
    await controller.discardDraft();
    expect(controller.task).toMatchObject({ saved: 0 });
  });
});

/** 服务端合并一个任务（免审批）：任务从当前共享头起步、上传一个新增分类的提交、建 PR、生成候选并合并；返回新的共享头。 */
async function mergedShared(space: MemoryWorkspace) {
  const env = () => ({ now: Date.now(), id: () => `server-${++serial}` });
  const run = (command: Record<string, unknown>) =>
    space.run(alice, { operationId: `op-${++serial}`, ...command } as Command, env());
  await run({ type: 'policy', stages: [], expectedVersion: 1 });
  const base = space.state.head;
  await run({ type: 'task', id: 'merged', name: 'merged', expectedHead: base });
  const commit = taskCommit({
    id: `merged-${++serial}`,
    parent: base,
    authorId: 'alice',
    message: 'merged',
    changes: diffAssets({}, { mergedCategory: { entity: 'AssetCategory', fields: { name: '已合并' } } })
  });
  await run({ type: 'upload', taskId: 'merged', expectedHead: base, commits: [commit] });
  await run({ type: 'pr', id: 'merged-pr', taskId: 'merged', title: 'merged', description: '', target: 'shared' });
  await run({ type: 'pr_state', prId: 'merged-pr', status: 'review', expectedRevision: 0 });
  const candidate = await run({ type: 'candidate', prId: 'merged-pr', expectedRevision: 1, resolutions: [] });
  await run({
    type: 'merge',
    prId: 'merged-pr',
    candidateId: candidate['candidateId'],
    expectedSource: commit.commitId,
    expectedTarget: base
  });
  return space.state.head;
}
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
  it('reads the latest window only when the timeline is read, earlier events through the cursor, and keeps them across overlapping refreshes', async () => {
    const { controller } = await setup();
    const latest = vi.spyOn(controller.reader, 'recentAudit').mockResolvedValue(events(3, 6));
    publish(controller, summary => {
      summary.auditCount = 6;
    });
    await controller.refresh();
    // 团队页只带审计总数，事件在时间线展开（第一次读取）时才读
    expect(latest).not.toHaveBeenCalled();
    expect(controller.auditEvents()).toBeUndefined();
    await vi.waitFor(() => expect(controller.auditEvents()?.map(item => item.id)).toEqual(['e3', 'e4', 'e5']));
    expect(controller.hasEarlierAudit()).toBe(true);
    const request = vi
      .spyOn(controller.reader, 'audit')
      .mockResolvedValue({ events: events(0, 3).reverse(), nextBefore: null });
    await controller.loadEarlierAudit();
    expect(request).toHaveBeenCalledWith(controller.workspace, { before: 'e3' });
    expect(controller.auditEvents()?.map(item => item.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5']);
    expect(controller.hasEarlierAudit()).toBe(false);
    latest.mockResolvedValue(events(4, 8));
    publish(controller, summary => {
      summary.auditCount = 8;
    });
    await controller.refresh();
    await vi.waitFor(() =>
      expect(controller.auditEvents()?.map(item => item.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'])
    );
    expect(controller.hasEarlierAudit()).toBe(false);
    expect(latest).toHaveBeenCalledTimes(2);
  });
  it('announces loaded earlier events and ignores a page that no longer lines up', async () => {
    const { controller } = await setup();
    const latest = vi.spyOn(controller.reader, 'recentAudit').mockResolvedValue(events(3, 6));
    publish(controller, summary => {
      summary.auditCount = 6;
    });
    await controller.refresh();
    controller.auditEvents();
    await vi.waitFor(() => expect(controller.auditEvents()).toHaveLength(3));
    const reply = Promise.withResolvers<{ events: Audit[]; nextBefore: string | null }>();
    vi.spyOn(controller.reader, 'audit').mockReturnValue(reply.promise);
    const loading = controller.loadEarlierAudit();
    latest.mockResolvedValue(events(40, 90));
    publish(controller, summary => {
      summary.auditCount = 90;
    });
    await controller.refresh();
    await vi.waitFor(() => expect(controller.auditEvents()).toHaveLength(50));
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    reply.resolve({ events: events(0, 3).reverse(), nextBefore: null });
    await loading;
    expect(controller.auditEvents()?.map(item => item.id)).toEqual(events(40, 90).map(item => item.id));
    expect(changed).not.toHaveBeenCalled();
  });
  it('reads a thread history completely, oldest first, and refreshes it when the workspace revision changes', async () => {
    const { controller } = await setup();
    const request = vi
      .spyOn(controller.reader, 'audit')
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
    const request = vi.spyOn(controller.reader, 'history');
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
      .spyOn(controller.reader, 'history')
      .mockResolvedValueOnce(page(['m2', 'm1'], null))
      .mockResolvedValueOnce(page(['m3', 'm2', 'm1'], null));
    const changed = vi.fn();
    controller.addEventListener('change', changed);
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(controller.commitHistory(shared)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(controller.workspace, { head: 'm2', until: root }, {});
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
      .spyOn(controller.reader, 'history')
      .mockResolvedValueOnce(page(['t3', 't2'], 't2'))
      .mockResolvedValueOnce(page(['t1'], null));
    expect(controller.commitHistory({ prId: 'pr' })).toBeUndefined();
    await vi.waitFor(() => expect(controller.commitHistory({ prId: 'pr' })?.hasEarlier).toBe(true));
    expect(request).toHaveBeenCalledWith(controller.workspace, { head: 't3', until: root }, {});
    await controller.loadEarlierCommits({ prId: 'pr' });
    expect(request).toHaveBeenLastCalledWith(controller.workspace, { head: 't3', until: root }, { before: 't2' });
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
      .spyOn(controller.reader, 'history')
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
      .spyOn(controller.reader, 'history')
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
    const request = vi.spyOn(controller.reader, 'history').mockResolvedValue(page(['m1'], null));
    controller.commitHistory(shared);
    await vi.waitFor(() => expect(controller.commitHistory(shared)).toBeDefined());
    const other = { teamId: 'other', appId: 'assets', name: 'Other' };
    await controller.selectWorkspace(other);
    expect(controller.commitHistory(shared)).toBeUndefined();
    await vi.waitFor(() => expect(request).toHaveBeenLastCalledWith(other, { head: 'm1', until: root }, {}));
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
    expect(controller.reader.receipt).toHaveBeenLastCalledWith(controller.workspace, 'operation');
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
    vi.mocked(controller.reader.receipt).mockResolvedValue({ status: 'accepted', value: { policyVersion: 2 } });
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
  /** 任务里留下一个上传结果未知的提交。 */
  async function queued(controller: CollaborationController, database: MemoryTeamDatabase) {
    database.edit('queued');
    const send = vi.spyOn(controller.api, 'command').mockRejectedValueOnce(new TypeError('network'));
    await expect(controller.sync()).rejects.toThrow('network');
    return send;
  }
  /** 把待确认上传的形成时间改成 `ms` 毫秒之前；`undefined` 模拟没有有效形成时间的记录。 */
  async function ageUpload(controller: CollaborationController, ledger: TaskLedger, ms: number | undefined) {
    const entry = ledger.write(aliceTask, current => {
      const [first] = current!.uploads;
      const aged = { ...first, createdAt: ms === undefined ? Number.NaN : Date.now() - ms };
      return { ...current!, uploads: [aged] };
    });
    await controller.refreshTask();
    return entry.uploads[0];
  }
  it('acknowledges an expired upload locally when the remote task head already is its last commit', async () => {
    const { controller, ledger, database } = await setup();
    const send = await queued(controller, database);
    const item = await ageUpload(controller, ledger, 31 * day);
    publish(controller, summary => {
      summary.tasks[0].head = item.head;
    });
    await controller.sync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.task).toMatchObject({ uploads: [], remoteHead: item.head, unpushed: 0 });
    expect(controller.uploadExpired()).toBe(false);
  });
  it('does not resend an expired upload whose outcome is unknown and hands it to the user', async () => {
    const { controller, ledger, database } = await setup();
    const send = await queued(controller, database);
    await ageUpload(controller, ledger, 31 * day);
    expect(controller.uploadExpired()).toBe(true);
    await expect(controller.sync()).rejects.toMatchObject({ code: 'expired', message: uploadMessage });
    expect(send).toHaveBeenCalledTimes(1);
    expect(controller.task?.uploads).toHaveLength(1);
    expect(controller.syncing).toBe(false);
  });
  it('treats a queued upload without a valid creation time as expired', async () => {
    const { controller, ledger, database } = await setup();
    const send = await queued(controller, database);
    await ageUpload(controller, ledger, undefined);
    expect(controller.uploadExpired()).toBe(true);
    await expect(controller.sync()).rejects.toMatchObject({ code: 'expired' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends an expired upload on confirmation with the same operation and commits, never its creation time', async () => {
    const { controller, ledger, database } = await setup();
    const send = await queued(controller, database);
    const first = send.mock.calls[0][1];
    const item = await ageUpload(controller, ledger, 31 * day);
    send.mockResolvedValueOnce({ head: item.head });
    await controller.sync(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(first);
    expect(send.mock.calls[1][1]).not.toHaveProperty('createdAt');
    expect(send.mock.calls[1][1]).not.toHaveProperty('head');
    expect(controller.task?.uploads).toEqual([]);
  });
  it('keeps uploading fresh queued commits automatically', async () => {
    const { controller, ledger, database } = await setup();
    const send = await queued(controller, database);
    expect(controller.uploadExpired()).toBe(false);
    send.mockResolvedValueOnce({ head: pendingUpload(ledger).head });
    await controller.sync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(controller.task?.uploads).toEqual([]);
  });
});
type Listener = (message: Record<string, unknown>) => void;
/**
 * 已登录并加入了团队频道的控制器：从假频道上取出 Broadcast、Presence 与状态回调，用例直接驱动它们，
 * 就像 Realtime 推来了失效通知、撤权事件、在线状态与连接状态变化。
 */
async function joined() {
  const value = await initialized();
  const { controller, channel } = value;
  await controller.selectWorkspace({ teamId: 'team', appId: 'assets', name: 'Team' });
  const handler = (type: string, event: string) =>
    channel.on.mock.calls.find(
      call => call[0] === type && (call[1] as { event: string }).event === event
    )![2] as Listener;
  const status = channel.subscribe.mock.calls.at(-1)![0] as (value: string) => void;
  const team = vi.mocked(controller.reader.team);
  team.mockClear();
  const revision = controller.snapshot!.revision;
  return {
    ...value,
    revision,
    team,
    status,
    signal: (payload: Record<string, unknown>) =>
      handler(
        'broadcast',
        'changed'
      )({ event: 'changed', payload: { kinds: [], prIds: [], noticeUserIds: [], ...payload } }),
    revoke: (userIds: string[]) =>
      handler('broadcast', 'revoked')({ event: 'revoked', payload: { revision: revision + 1, userIds } }),
    presence: (state: Record<string, Record<string, unknown>[]>) => {
      channel.presenceState.mockReturnValue(state as never);
      handler('presence', 'sync')({});
    }
  };
}
const detailFor = (prId: string, candidates: string[] = []): PullRequestDetail => ({
  prId,
  candidates: Object.fromEntries(
    candidates.map(id => [
      id,
      {
        id,
        prId,
        base: root,
        source: 's',
        target: root,
        schemaVersion: 1,
        policyVersion: 1,
        resolutions: [],
        conflicts: [],
        checks: [],
        actorId: 'alice',
        at: 1
      }
    ])
  ),
  reviews: [],
  threads: [],
  governance: { prId, blockers: [], stages: [] }
});
const openPr = (id: string, candidateId: string | null = null) => ({
  id,
  taskId: 'task',
  authorId: 'alice',
  title: id,
  description: '',
  target: 'shared' as const,
  status: 'review' as const,
  revision: 1,
  candidateId,
  subscribers: []
});

describe('Realtime 失效通知按修订号推进，只重读变化的部分（ADMIN-US-219 AC#2、AC#7）', () => {
  it('连续的通知只点到讨论时只读工作区行与这个 PR 的详情，不重读团队页', async () => {
    const { controller, signal, revision, team } = await joined();
    const version = vi
      .spyOn(controller.reader, 'version')
      .mockResolvedValue({ revision: revision + 1, auditCount: 9, head: root });
    signal({ revision: revision + 1, kinds: ['details', 'audit'], prIds: ['pr'] });
    await vi.waitFor(() => expect(controller.snapshot!.revision).toBe(revision + 1));
    expect(controller.snapshot!.auditCount).toBe(9);
    expect(version).toHaveBeenCalledTimes(1);
    expect(team).not.toHaveBeenCalled();
  });
  it('成员、策略、任务、PR 或共享头有变化时重读团队页；修订号取通知里的而不是读到的', async () => {
    const { controller, signal, revision, team } = await joined();
    const ahead = teamPageOf({ ...controller.snapshot!, revision: revision + 5, name: 'Renamed' });
    team.mockResolvedValue(ahead);
    signal({ revision: revision + 1, kinds: ['members', 'audit'] });
    await vi.waitFor(() => expect(controller.snapshot!.name).toBe('Renamed'));
    expect(controller.snapshot!.revision).toBe(revision + 1);
    expect(team).toHaveBeenCalledTimes(1);
  });
  it('命令刷新与实时通知同时到达时共享同一份团队页读取', async () => {
    const { controller, signal, revision, team } = await joined();
    let resolveTeam!: (value: ReturnType<typeof teamPageOf>) => void;
    const pending = new Promise<ReturnType<typeof teamPageOf>>(resolve => {
      resolveTeam = resolve;
    });
    team.mockReturnValue(pending);
    const refresh = controller.refresh();
    signal({ revision: revision + 1, kinds: ['prs'] });
    expect(team).toHaveBeenCalledTimes(1);
    resolveTeam(teamPageOf({ ...controller.snapshot!, revision: revision + 1 }));
    await refresh;
    await vi.waitFor(() => expect(controller.snapshot!.revision).toBe(revision + 1));
    expect(team).toHaveBeenCalledTimes(1);
  });
  it('命令刷新不复用命令发出前已经在途的团队页读取', async () => {
    const { controller, team, revision } = await joined();
    let resolveOld!: (value: ReturnType<typeof teamPageOf>) => void;
    let resolveFresh!: (value: ReturnType<typeof teamPageOf>) => void;
    const oldRequest = new Promise<ReturnType<typeof teamPageOf>>(resolve => {
      resolveOld = resolve;
    });
    const freshRequest = new Promise<ReturnType<typeof teamPageOf>>(resolve => {
      resolveFresh = resolve;
    });
    team.mockReturnValueOnce(oldRequest).mockReturnValueOnce(freshRequest);
    const oldRefresh = controller.refresh();
    await vi.waitFor(() => expect(team).toHaveBeenCalledTimes(1));
    vi.spyOn(controller.api, 'command').mockResolvedValue({});
    const command = controller.run({ type: 'task', id: 'created', name: 'Created', expectedHead: root }, 'created-op');
    await vi.waitFor(() => expect(team).toHaveBeenCalledTimes(2));
    resolveOld(teamPageOf(controller.snapshot!));
    resolveFresh(teamPageOf({ ...controller.snapshot!, revision: revision + 1 }));
    await Promise.all([oldRefresh, command]);
  });
  it('并发强制刷新共享同一份团队页读取', async () => {
    const { controller, team } = await joined();
    let resolveTeam!: (value: ReturnType<typeof teamPageOf>) => void;
    const pending = new Promise<ReturnType<typeof teamPageOf>>(resolve => {
      resolveTeam = resolve;
    });
    team.mockReturnValue(pending);
    const first = controller.refresh(true);
    await vi.waitFor(() => expect(team).toHaveBeenCalledTimes(1));
    const second = controller.refresh(true);
    expect(team).toHaveBeenCalledTimes(1);
    resolveTeam(teamPageOf(controller.snapshot!));
    await Promise.all([first, second]);
  });
  it('只有被点名的成员重读通知窗口', async () => {
    const { controller, signal, revision, team } = await joined();
    vi.spyOn(controller.reader, 'version').mockResolvedValue({ revision: revision + 2, auditCount: 3, head: root });
    const notices = vi.spyOn(controller.reader, 'notices').mockResolvedValue({
      notices: [{ id: 'n1', userId: 'alice', prId: 'pr', threadId: null, candidateId: null, read: false, at: 1 }],
      earlier: false,
      unread: 1
    });
    signal({ revision: revision + 1, kinds: ['details', 'notices', 'audit'], noticeUserIds: ['bob'] });
    await vi.waitFor(() => expect(controller.snapshot!.revision).toBe(revision + 1));
    expect(notices).not.toHaveBeenCalled();
    signal({ revision: revision + 2, kinds: ['details', 'notices', 'audit'], noticeUserIds: ['alice'] });
    await vi.waitFor(() => expect(controller.snapshot!.unread).toBe(1));
    expect(notices).toHaveBeenCalledTimes(1);
    expect(team).not.toHaveBeenCalled();
  });
  it('已反映的通知忽略；修订号跳号说明漏了通知，整页重读', async () => {
    const { controller, signal, revision, team } = await joined();
    const version = vi.spyOn(controller.reader, 'version');
    signal({ revision, kinds: ['prs', 'audit'] });
    await settle();
    expect(team).not.toHaveBeenCalled();
    expect(version).not.toHaveBeenCalled();
    team.mockResolvedValue(teamPageOf({ ...controller.snapshot!, revision: revision + 3 }));
    signal({ revision: revision + 3, kinds: ['details', 'audit'], prIds: ['pr'] });
    await vi.waitFor(() => expect(controller.snapshot!.revision).toBe(revision + 3));
    expect(team).toHaveBeenCalledTimes(1);
    expect(version).not.toHaveBeenCalled();
  });
  it('通知点到的 PR 详情照常显示旧内容并在后台重读；列表已指向详情里没有的候选时按未加载处理', async () => {
    const { controller, signal, revision, team } = await joined();
    controller.snapshot = { ...controller.snapshot!, prs: [openPr('pr')] };
    const detail = vi
      .spyOn(controller.reader, 'prDetail')
      .mockResolvedValueOnce(detailFor('pr'))
      .mockResolvedValueOnce(detailFor('pr', ['cand']))
      .mockResolvedValue(detailFor('pr', ['cand']));
    expect(controller.prDetail('pr')).toBeUndefined();
    await vi.waitFor(() => expect(controller.prDetail('pr')).toEqual(detailFor('pr')));
    vi.spyOn(controller.reader, 'version').mockResolvedValue({ revision: revision + 1, auditCount: 1, head: root });
    signal({ revision: revision + 1, kinds: ['details', 'audit'], prIds: ['pr'] });
    await vi.waitFor(() => expect(controller.snapshot!.revision).toBe(revision + 1));
    expect(controller.prDetail('pr')).toEqual(detailFor('pr'));
    await vi.waitFor(() => expect(controller.prDetail('pr')).toEqual(detailFor('pr', ['cand'])));
    expect(detail).toHaveBeenCalledTimes(2);
    team.mockResolvedValue(
      teamPageOf({ ...controller.snapshot!, revision: revision + 2, prs: [openPr('pr', 'newer')] })
    );
    signal({ revision: revision + 2, kinds: ['prs', 'details', 'audit'], prIds: ['pr'] });
    await vi.waitFor(() => expect(controller.snapshot!.prs[0].candidateId).toBe('newer'));
    expect(controller.prDetail('pr')).toBeUndefined();
    detail.mockResolvedValue(detailFor('pr', ['cand', 'newer']));
    await vi.waitFor(() => expect(controller.prDetail('pr')?.candidates).toHaveProperty('newer'));
  });
  it('Supabase 查询暂不可用时提示并保留会话、任务与待上传的提交，恢复后补齐，不伪报同步成功', async () => {
    const { controller, team, ledger, database } = await joined();
    await controller.openTask('task');
    team.mockRejectedValue(new CollaborationError('unavailable', '读取团队数据失败，请稍后重试'));
    const send = vi.spyOn(controller.api, 'command');
    database.edit();
    await controller.sync().catch(error => controller.failure(error));
    expect(controller.message).toBe('读取团队数据失败，请稍后重试');
    expect(controller.user?.id).toBe('alice');
    expect(controller.task).toMatchObject({ saved: 0, unpushed: 1 });
    expect(send).not.toHaveBeenCalled();
    team.mockResolvedValue(teamPageOf(controller.snapshot!));
    send.mockImplementation(async () => ({ taskId: 'task', head: pendingUpload(ledger).head }));
    await controller.sync();
    expect(controller.message).toBe('当前提交已同步；后续编辑仍需另行同步');
    expect(controller.task).toMatchObject({ uploads: [], unpushed: 0 });
  });
});

describe('Realtime Presence 与撤权（ADMIN-US-219 AC#3、AC#4）', () => {
  it('在线状态来自频道 Presence：只显示当前有效成员，订阅成功后才上报本页面的查看位置', async () => {
    const { controller, presence, status, channel } = await joined();
    controller.trackPresence('pr', null);
    expect(channel.track).not.toHaveBeenCalled();
    vi.spyOn(controller.reader, 'version').mockResolvedValue({
      revision: controller.snapshot!.revision,
      auditCount: 1,
      head: root
    });
    status('SUBSCRIBED');
    expect(channel.track).toHaveBeenCalledWith({ userId: 'alice', prId: 'pr', recordId: null });
    presence({
      s1: [{ userId: 'alice', prId: 'pr', recordId: null }],
      s2: [{ userId: 'stranger', prId: null, recordId: null }]
    });
    expect(controller.snapshot!.presence).toEqual([{ userId: 'alice', sessionId: 's1', prId: 'pr', recordId: null }]);
  });
  it('Presence 同步只在可见的在线列表变化时重绘：重复同步与非成员会话进出不重绘', async () => {
    const { controller, presence } = await joined();
    const redraws = vi.fn();
    controller.addEventListener('change', redraws);
    presence({ s1: [{ userId: 'alice', prId: 'pr', recordId: null }] });
    expect(redraws).toHaveBeenCalledTimes(1);
    presence({ s1: [{ userId: 'alice', prId: 'pr', recordId: null }] });
    presence({
      s1: [{ userId: 'alice', prId: 'pr', recordId: null }],
      s2: [{ userId: 'stranger', prId: null, recordId: null }]
    });
    expect(redraws).toHaveBeenCalledTimes(1);
    presence({ s1: [{ userId: 'alice', prId: 'pr', recordId: 'r1' }] });
    expect(redraws).toHaveBeenCalledTimes(2);
    expect(controller.snapshot!.presence).toEqual([{ userId: 'alice', sessionId: 's1', prId: 'pr', recordId: 'r1' }]);
  });
  it('他人被撤权时立即移出在线列表；自己被撤权时立即锁定团队并离开频道，账号保持登录（不退出全局会话）', async () => {
    const { controller, presence, revoke, auth } = await joined();
    controller.snapshot = {
      ...controller.snapshot!,
      members: [
        ...controller.snapshot!.members,
        { id: 'bob', email: 'bob@example.test', permissions: ['read'], generation: 1, active: true }
      ]
    };
    presence({
      s1: [{ userId: 'alice', prId: null, recordId: null }],
      s2: [{ userId: 'bob', prId: null, recordId: null }]
    });
    expect(controller.snapshot!.presence.map(item => item.userId)).toEqual(['alice', 'bob']);
    revoke(['bob']);
    expect(controller.snapshot!.presence.map(item => item.userId)).toEqual(['alice']);
    expect(controller.user?.id).toBe('alice');
    const client = vi.mocked(createClient).mock.results.at(-1)!.value as { removeChannel: ReturnType<typeof vi.fn> };
    revoke(['alice']);
    await vi.waitFor(() => expect(controller.message).toBe('你已不是这个团队的成员，团队草稿已锁定'));
    expect(controller.snapshot).toBeNull();
    expect(controller.workspace).toBeNull();
    expect(controller.task).toBeNull();
    expect(controller.user?.id).toBe('alice');
    expect(controller.session.user?.id).toBe('alice');
    expect(client.removeChannel).toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('频道重连或掉线时按修订号补齐；工作区行已读不到（撤权后频道被关闭）即锁定团队，账号保持登录', async () => {
    const { controller, status, revision, team } = await joined();
    const version = vi
      .spyOn(controller.reader, 'version')
      .mockResolvedValueOnce({ revision, auditCount: 1, head: root })
      .mockResolvedValueOnce({ revision: revision + 4, auditCount: 1, head: root });
    status('SUBSCRIBED');
    await vi.waitFor(() => expect(version).toHaveBeenCalledTimes(1));
    expect(team).not.toHaveBeenCalled();
    status('CHANNEL_ERROR');
    expect(controller.message).toBe('实时连接暂不可用，可刷新团队状态');
    team.mockResolvedValue(teamPageOf({ ...controller.snapshot!, revision: revision + 4 }));
    await vi.waitFor(() => expect(controller.snapshot?.revision).toBe(revision + 4));
    status('CHANNEL_ERROR');
    expect(version).toHaveBeenCalledTimes(2);
    version.mockRejectedValue(new CollaborationError('forbidden', '当前用户没有操作权限'));
    status('SUBSCRIBED');
    await vi.waitFor(() => expect(controller.snapshot).toBeNull());
    expect(controller.workspace).toBeNull();
    expect(controller.user?.id).toBe('alice');
  });
});
