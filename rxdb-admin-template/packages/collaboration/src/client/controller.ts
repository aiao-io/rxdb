import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { CollaborationError, demand, type Command, type Identity, type Records } from '../model.js';
import type { WorkspaceSnapshot } from '../server/engine.js';
import { CollaborationApi, type WorkspaceEntry } from './api.js';
import { WorkspaceFeed } from './workspace-feed.js';
import { IndexedDraftStorage, LocalTasks, type Draft, type DraftStorage } from './local.js';

export class CollaborationController extends EventTarget {
  private generation = 0;
  private disposed = false;
  private feed?: WorkspaceFeed;
  private authGeneration = 0;
  private unsubscribe?: () => void;
  private readonly channel = new BroadcastChannel('admin-collaboration-session');
  readonly local: LocalTasks;
  readonly api: CollaborationApi;
  auth?: SupabaseClient;
  user: Identity | null = null;
  workspaces: WorkspaceEntry[] = [];
  workspace: WorkspaceEntry | null = null;
  snapshot: WorkspaceSnapshot | null = null;
  draft: Draft | null = null;
  offlineDrafts: Draft[] = [];
  online = navigator.onLine;
  message = '';
  syncing = false;
  constructor(
    readonly base = '/collaboration-api',
    storage: DraftStorage = new IndexedDraftStorage()
  ) {
    super();
    this.local = new LocalTasks(storage);
    this.api = new CollaborationApi(base, async () => {
      demand(this.auth, 'configuration', '认证未配置');
      const { data, error } = await this.auth.auth.getSession();
      demand(!error && data.session && data.session.user.id === this.user?.id, 'unauthenticated', '请重新登录');
      return data.session.access_token;
    }, () => this.generation);
    this.channel.onmessage = event => {
      if (event.data?.type === 'logout' && event.data.userId === this.user?.id) void this.lock();
    };
  }
  changed() {
    this.dispatchEvent(new Event('change'));
  }
  async initialize(): Promise<void> {
    const epoch = ++this.authGeneration;
    const configKey = `admin-collaboration-config:${this.base}`;
    let config: { supabaseUrl: string; supabaseKey: string };
    if (navigator.onLine) {
      config = await this.current(this.api.config(), this.generation, epoch);
      localStorage.setItem(configKey, JSON.stringify(config));
    } else {
      const cached = localStorage.getItem(configKey);
      demand(cached, 'offline', '首次使用团队协作需要联网');
      config = JSON.parse(cached);
    }
    this.auth = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        storageKey: `admin-collaboration-auth:${config.supabaseUrl}`,
        detectSessionInUrl: false,
        autoRefreshToken: navigator.onLine
      }
    });
    this.feed = new WorkspaceFeed(this.auth, async () => {
      if (!navigator.onLine || !this.user || this.disposed) return;
      await this.refresh().catch(error => this.failure(error));
    }, status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.message = '实时连接暂不可用，可刷新团队状态';
      this.changed();
    });
    if (navigator.onLine) {
      demand(epoch === this.authGeneration, 'cancelled', '上下文已切换');
      const initial = await this.current(this.auth.auth.getSession(), this.generation, epoch);
      await this.acceptSession(initial.data.session);
    } else {
      const cached = localStorage.getItem(`admin-collaboration-grant:${this.base}`);
      demand(cached, 'locked', '请联网验证身份后再使用团队草稿');
      const grant = JSON.parse(cached) as { user: Identity; expiresAt: number };
      const drafts = await this.current(this.local.coldRestore(grant.user.id, grant.expiresAt, Date.now()), this.generation, epoch);
      if (epoch !== this.authGeneration) return;
      this.offlineDrafts = drafts;
      this.user = grant.user;
      this.online = false;
      this.changed();
    }
    if (this.disposed) return;
    const { data } = this.auth.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        if (navigator.onLine || !this.user) void this.lock();
        return;
      }
      queueMicrotask(() => {
        void this.acceptSession(session).catch(error => this.failure(error));
      });
    });
    this.unsubscribe = () => data.subscription.unsubscribe();
  }
  async sendCode(email: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { error } = await this.current(this.auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    if (error) throw error;
    this.message = '验证码已发送，请检查邮箱';
    this.changed();
  }
  async verify(email: string, token: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { data, error } = await this.current(this.auth.auth.verifyOtp({ email, token, type: 'email' }));
    if (error) throw error;
    await this.acceptSession(data.session);
  }
  async selectWorkspace(workspace: WorkspaceEntry): Promise<void> {
    const epoch = ++this.generation;
    this.feed?.stop();
    const data = await this.current(this.api.snapshot(workspace), epoch);
    if (epoch !== this.generation) return;
    this.workspace = workspace;
    this.snapshot = data;
    this.draft = null;
    this.feed?.start(workspace);
    this.changed();
  }
  async refresh(): Promise<void> {
    if (!navigator.onLine) {
      this.online = false;
      this.changed();
      return;
    }
    if (!this.workspace) return;
    const workspace = this.workspace;
    const epoch = this.generation;
    const data = await this.current(this.api.snapshot(workspace), epoch);
    if (epoch !== this.generation || workspace !== this.workspace) return;
    if (this.snapshot && data.revision < this.snapshot.revision) return;
    this.snapshot = data;
    this.online = true;
    if (this.draft) {
      const task = data.tasks.find(t => t.id === this.draft?.context.taskId);
      const member = data.members.find(m => m.id === this.user?.id);
      demand(
        task?.ownerId === this.user?.id && member?.permissions.includes('edit'),
        'forbidden',
        '任务编辑权限已撤销'
      );
    }
    this.changed();
  }
  pending(): { workspace: WorkspaceEntry; command: Command } | null {
    if (!this.user) return null;
    const value = sessionStorage.getItem(`admin-collaboration-pending:${this.user.id}`);
    return value ? (JSON.parse(value) as { workspace: WorkspaceEntry; command: Command }) : null;
  }
  async retryPending(): Promise<void> {
    const pending = this.pending();
    demand(pending && this.user, 'missing', '没有待确认请求');
    await this.selectWorkspace(pending.workspace);
    await this.run(pending.command, pending.command.operationId);
    if (pending.command.type === 'fork') await this.openTask(pending.command.id);
  }
  async run(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string = crypto.randomUUID()
  ): Promise<Record<string, unknown>> {
    demand(this.workspace && this.user, 'locked', '先登录并选择团队');
    const workspace = this.workspace;
    const epoch = this.generation;
    const request = { ...command, operationId } as Command;
    const durable = !['presence', 'read_notice', 'subscribe'].includes(request.type);
    const key = `admin-collaboration-pending:${this.user.id}`;
    const previous = this.pending();
    demand(
      !durable || !previous || previous.command.operationId === operationId,
      'pending',
      '先确认或重试上次请求，再执行新的云端变更'
    );
    if (durable) sessionStorage.setItem(key, JSON.stringify({ workspace, command: request }));
    try {
      const receipt = durable ? await this.api.receipt(workspace, operationId) : { status: 'unknown' };
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      const result =
        receipt.status === 'accepted' && 'value' in receipt ?
          receipt.value!
        : await this.api.command(workspace, request);
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      await this.current(this.refresh(), epoch);
      if (request.type === 'fork') await this.current(this.archiveFork(request), epoch);
      if (durable) sessionStorage.removeItem(key);
      return result;
    } catch (error) {
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      if (durable && error instanceof CollaborationError && !['internal', 'cancelled'].includes(error.code))
        sessionStorage.removeItem(key);
      throw error;
    }
  }
  async acceptInvitation(teamId: string, appId: string, id: string, token: string): Promise<void> {
    const workspace = { teamId, appId, name: teamId };
    const epoch = this.generation;
    await this.current(this.api.command(workspace, {
      type: 'accept_invite',
      id,
      tokenHash: token,
      operationId: crypto.randomUUID()
    }), epoch);
    const workspaces = await this.current(this.api.workspaces(), epoch);
    this.workspaces = workspaces;
    await this.selectWorkspace(workspace);
  }
  async createTask(name: string): Promise<void> {
    const id = crypto.randomUUID();
    await this.run({ type: 'task', id, name, expectedHead: this.snapshot?.head ?? null });
    await this.openTask(id);
  }
  async openTask(id: string): Promise<void> {
    demand(this.user && this.workspace && this.snapshot, 'locked', '先选择团队');
    await this.current(this.refresh());
    const task = this.snapshot.tasks.find(t => t.id === id);
    const member = this.snapshot.members.find(m => m.id === this.user?.id);
    demand(task?.ownerId === this.user.id && member?.permissions.includes('edit'), 'forbidden', '没有此任务编辑权限');
    const context = {
      userId: this.user.id,
      teamId: this.workspace.teamId,
      appId: this.workspace.appId,
      taskId: task.id
    };
    const epoch = ++this.generation;
    const draft = await this.local.openVerified(
      context,
      task.name,
      task.base,
      task.head,
      task.head ? this.snapshot.commits[task.head].records : {}
    );
    demand(epoch === this.generation, 'cancelled', '上下文已切换');
    this.draft = draft;
    this.changed();
  }
  async openOffline(draft: Draft) {
    this.feed?.stop();
    const epoch = ++this.generation;
    this.local.assert(draft.context);
    const restored = await this.current(this.local.read(draft.context), epoch);
    this.draft = restored ?? null;
    this.snapshot = null;
    this.workspace = { ...draft.context, name: draft.context.teamId };
    this.changed();
  }
  async save(records: Records): Promise<void> {
    demand(this.draft, 'missing', '先打开任务');
    const epoch = this.generation;
    const saved = await this.current(this.local.save(this.draft.context, records, this.draft.revision), epoch);
    if (epoch !== this.generation) return;
    this.draft = saved;
    this.message = '已保存到本机，尚未同步';
    this.changed();
  }
  async sync(unsaved: boolean): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      await this.current(this.upload(unsaved));
    } finally {
      this.syncing = false;
      this.changed();
    }
  }
  async fork(name: string, unsaved: boolean): Promise<void> {
    demand(this.draft, 'missing', '先打开任务');
    const original = await this.current(this.local.capture(this.draft.context, name, unsaved));
    demand(original.queue.length, 'empty', '没有本机分叉提交');
    const id = crypto.randomUUID();
    await this.run({
      type: 'fork',
      id,
      name,
      taskId: original.context.taskId,
      expectedHead: original.remoteHead,
      commits: original.queue.flatMap(item => item.commits)
    });
    await this.openTask(id);
    this.message = '已另存为新任务，原任务与 PR 保持原远端版本';
    this.changed();
  }
  async logout(): Promise<void> {
    const auth = this.auth;
    const userId = this.user?.id;
    await this.lock();
    this.channel.postMessage({ type: 'logout', userId });
    if (auth) await auth.auth.signOut({ scope: 'local' });
  }
  async lock(): Promise<void> {
    this.feed?.stop();
    this.generation++;
    this.authGeneration++;
    localStorage.removeItem(`admin-collaboration-grant:${this.base}`);
    this.user = null;
    this.snapshot = null;
    this.draft = null;
    this.workspace = null;
    this.offlineDrafts = [];
    this.workspaces = [];
    this.changed();
    await this.local.logout();
  }
  async failure(error: unknown): Promise<void> {
    if (error instanceof CollaborationError && error.code === 'cancelled') return;
    if (error instanceof CollaborationError && ['forbidden', 'unauthenticated', 'locked'].includes(error.code))
      await this.lock();
    this.message = error instanceof Error ? error.message : '操作失败';
    this.changed();
  }
  async fetchRemote(unsaved: boolean): Promise<void> {
    demand(this.draft, 'missing', '先打开任务');
    const context = this.draft.context;
    const epoch = this.generation;
    await this.current(this.refresh(), epoch);
    const task = this.snapshot?.tasks.find(value => value.id === context.taskId);
    demand(task && this.snapshot, 'missing', '任务不存在');
    const records = task.head ? this.snapshot.commits[task.head].records : {};
    const draft = await this.current(this.local.fastForward(context, task.head, records, unsaved), epoch);
    this.draft = draft;
    this.changed();
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.authGeneration++;
    this.feed?.stop();
    this.local.dispose();
    this.unsubscribe?.();
    this.channel.close();
  }
  private async acceptSession(session: Session | null) {
    if (this.disposed) return;
    if (!session) {
      await this.lock();
      return;
    }
    if (this.user && this.user.id !== session.user.id) await this.lock();
    const epoch = ++this.authGeneration;
    if (!navigator.onLine) {
      const drafts = await this.local.coldRestore(session.user.id, (session.expires_at ?? 0) * 1000, Date.now());
      if (epoch !== this.authGeneration) return;
      this.offlineDrafts = drafts;
      this.user = { id: session.user.id, email: session.user.email ?? '', verified: true };
      this.online = false;
      this.changed();
      return;
    }
    demand(this.auth, 'configuration', '认证未配置');
    const { data, error } = await this.current(this.auth.auth.getUser(session.access_token), this.generation, epoch);
    if (epoch !== this.authGeneration) return;
    demand(!error && data.user?.email && data.user.email_confirmed_at, 'unauthenticated', '请重新验证邮箱');
    this.user = { id: data.user.id, email: data.user.email, verified: true };
    await this.local.login(data.user.id);
    if (epoch !== this.authGeneration) return;
    localStorage.setItem(
      `admin-collaboration-grant:${this.base}`,
      JSON.stringify({ user: this.user, expiresAt: (session.expires_at ?? 0) * 1000 })
    );
    const workspaces = await this.current(this.api.workspaces(), this.generation, epoch);
    if (epoch !== this.authGeneration) return;
    this.workspaces = workspaces;
    this.online = true;
    this.changed();
  }
  private async current<T>(request: Promise<T>, epoch = this.generation, authEpoch?: number): Promise<T> {
    try {
      const value = await request;
      demand(epoch === this.generation && (authEpoch === undefined || authEpoch === this.authGeneration) && !this.disposed, 'cancelled', '上下文已切换');
      return value;
    } catch (error) {
      demand(epoch === this.generation && (authEpoch === undefined || authEpoch === this.authGeneration) && !this.disposed, 'cancelled', '上下文已切换');
      throw error;
    }
  }
  private async archiveFork(command: Extract<Command, { type: 'fork' }>): Promise<void> {
    demand(this.user && this.workspace && this.snapshot, 'locked', '先选择团队');
    const task = this.snapshot.tasks.find(value => value.id === command.taskId);
    demand(task?.ownerId === this.user.id, 'forbidden', '没有此任务编辑权限');
    const context = { userId: this.user.id, teamId: this.workspace.teamId, appId: this.workspace.appId, taskId: task.id };
    const head = command.commits.at(-1)?.id;
    demand(head, 'invalid', '分叉回执缺少版本');
    await this.current(this.local.openVerified(context, task.name, task.base, task.head, task.head ? this.snapshot.commits[task.head].records : {}));
    await this.current(this.local.archiveFork(context, command.id, head));
  }
  private async upload(unsaved: boolean): Promise<void> {
    demand(this.draft && this.workspace, 'missing', '先打开任务');
    const context = this.draft.context;
    const workspace = this.workspace;
    const epoch = this.local.epoch;
    const viewEpoch = this.generation;
    const captured = await this.current(this.local.capture(context, this.draft.name, unsaved), viewEpoch);
    this.draft = captured;
    this.changed();
    if (!navigator.onLine) {
      this.message = '已形成提交，联网验证后可同步';
      this.changed();
      return;
    }
    await this.current(this.refresh(), viewEpoch);
    let uploading = captured;
    while (uploading.queue.length) {
      this.local.assert(context, epoch);
      const pending = uploading.queue[0];
      const receipt = await this.api.receipt(workspace, pending.operationId);
      demand(viewEpoch === this.generation, 'cancelled', '上下文已切换');
      const result =
        receipt.status === 'accepted' ?
          receipt.value!
        : await this.api.command(workspace, { type: 'upload', taskId: context.taskId, ...pending });
      demand(viewEpoch === this.generation, 'cancelled', '上下文已切换');
      demand(typeof result['head'] === 'string', 'invalid', '同步回执缺少版本');
      const acknowledged = await this.current(this.local.acknowledge(context, pending.operationId, result['head'], epoch), viewEpoch);
      uploading = acknowledged;
      this.draft = acknowledged;
      this.changed();
    }
    await this.current(this.refresh(), viewEpoch);
    this.message = '当前提交已同步；后续编辑仍需另行同步';
    this.changed();
  }
}
