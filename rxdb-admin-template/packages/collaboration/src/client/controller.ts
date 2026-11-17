import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  auditPageSize,
  CollaborationError,
  demand,
  type Audit,
  type Candidate,
  type Command,
  type Commit,
  type Identity,
  type Records,
  type SharedRecords,
  type WorkspaceSummary
} from '../model.js';
import { CollaborationApi, type WorkspaceEntry } from './api.js';
import { AuditTimeline } from './audit-timeline.js';
import { ContentCache } from './content-cache.js';
import { IndexedDraftStorage, LocalTasks, type Draft, type DraftStorage } from './local.js';
import { WorkspaceFeed, type WorkspacePresenceChange } from './workspace-feed.js';

/**
 * 协作界面的状态与动作中枢：持有认证会话、团队与服务端摘要、本机任务草稿，界面监听 `change` 事件重绘。
 * 摘要不含提交、候选与共享数据的记录，也不含完整审计；这些内容按需读取并缓存，
 * 同步读取入口未命中时返回 undefined 并在后台加载，加载完成后触发 `change`。
 * 所有云端变更都以带幂等键的命令按队列串行提交；账号、团队或任务上下文切换后，在途请求的结果会被丢弃。
 */
export class CollaborationController extends EventTarget {
  private generation = 0;
  private disposed = false;
  private feed?: WorkspaceFeed;
  private authGeneration = 0;
  private mutations?: { epoch: number; settled: Promise<void> };
  private unsubscribe?: () => void;
  private checkpoint?: () => Promise<void>;
  private readonly channel = new BroadcastChannel('admin-collaboration-session');
  /** 提交不可变，按 ID 缓存；只在切换团队或锁定时丢弃。 */
  private readonly commits = new ContentCache<Commit>(
    async id => this.api.commit(this.activeWorkspace(), id),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 候选不可变，按 ID 缓存；只在切换团队或锁定时丢弃。 */
  private readonly candidates = new ContentCache<Candidate>(
    async id => this.api.candidate(this.activeWorkspace(), id),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 共享数据按摘要的头提交缓存，头变化即丢弃。 */
  private readonly shared = new ContentCache<SharedRecords>(
    head => this.fetchShared(head),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 讨论线程的处理历史，工作区修订号变化即丢弃。 */
  private readonly threads = new ContentCache<Audit[]>(
    threadId => this.fetchThreadEvents(threadId),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  private readonly timeline = new AuditTimeline();
  /** 本机任务草稿：按账号与团队隔离，退出或会话失效时锁定。 */
  readonly local: LocalTasks;
  /** 携带当前会话令牌的 HTTP 客户端。 */
  readonly api: CollaborationApi;
  /** Supabase 认证客户端；`initialize` 完成后才存在。 */
  auth?: SupabaseClient;
  /** 当前已确认的身份；未登录或已锁定时为 null。 */
  user: Identity | null = null;
  /** 当前账号可访问的团队与应用。 */
  workspaces: WorkspaceEntry[] = [];
  /** 当前选中的团队与应用。 */
  workspace: WorkspaceEntry | null = null;
  /** 当前工作区的服务端摘要；尚未选择团队或处于离线任务模式时为 null。 */
  snapshot: WorkspaceSummary | null = null;
  /** 当前打开的本机任务草稿。 */
  draft: Draft | null = null;
  /** 离线冷启动时按缓存授权恢复出的可解锁草稿。 */
  offlineDrafts: Draft[] = [];
  /** 是否在线：随浏览器网络状态与最近一次云端请求更新。 */
  online = navigator.onLine;
  /** 最近一条提示，通常是中文词条原文，由界面经词条表翻译后显示。 */
  message = '';
  /** 是否正在上传任务提交。 */
  syncing = false;
  /**
   * 创建控制器；此时尚未联网，需继续调用 {@link CollaborationController.initialize}。
   * @param base 协作 HTTP 接口的路径前缀。
   * @param storage 本机草稿存储，默认使用 IndexedDB。
   */
  constructor(
    readonly base = '/collaboration-api',
    storage: DraftStorage = new IndexedDraftStorage()
  ) {
    super();
    this.local = new LocalTasks(storage);
    this.api = new CollaborationApi(
      base,
      async () => {
        demand(this.auth, 'configuration', '认证未配置');
        const { data, error } = await this.auth.auth.getSession();
        demand(!error && data.session && data.session.user.id === this.user?.id, 'unauthenticated', '请重新登录');
        return data.session.access_token;
      },
      () => this.generation
    );
    this.channel.onmessage = event => {
      if (event.data?.type === 'logout' && event.data.userId === this.user?.id) void this.lock();
    };
  }
  /** 通知界面重绘（派发 `change` 事件）。 */
  changed() {
    this.dispatchEvent(new Event('change'));
  }
  /** 注册锁定前的本地编辑保存钩子，避免会话恢复失败时丢失输入。 */
  registerCheckpoint(checkpoint: () => Promise<void>): () => void {
    this.checkpoint = checkpoint;
    return () => {
      if (this.checkpoint === checkpoint) this.checkpoint = undefined;
    };
  }
  /** 读取公开配置（离线时用缓存）、创建认证客户端并恢复会话；离线时只按缓存授权恢复可解锁的本机草稿。 */
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
        autoRefreshToken: true
      }
    });
    this.feed = new WorkspaceFeed(
      this.auth,
      async () => {
        if (!navigator.onLine || !this.user || this.disposed) return;
        await this.refresh().catch(error => this.failure(error));
      },
      status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.message = '实时连接暂不可用，可刷新团队状态';
        this.changed();
      },
      change => this.applyPresenceChange(change)
    );
    if (navigator.onLine) {
      demand(epoch === this.authGeneration, 'cancelled', '上下文已切换');
      const initial = await this.current(this.auth.auth.getSession(), this.generation, epoch);
      await this.acceptSession(initial.data.session);
    } else {
      const cached = localStorage.getItem(`admin-collaboration-grant:${this.base}`);
      demand(cached, 'locked', '请联网验证身份后再使用团队草稿');
      const grant = JSON.parse(cached) as { user: Identity; expiresAt: number };
      const drafts = await this.current(
        this.local.coldRestore(grant.user.id, grant.expiresAt, Date.now()),
        this.generation,
        epoch
      );
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
  /** 向邮箱发送一次性验证码。 */
  async sendCode(email: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { error } = await this.current(this.auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    if (error) throw error;
    this.message = '验证码已发送，请检查邮箱';
    this.changed();
  }
  /** 校验邮箱验证码并建立会话。 */
  async verify(email: string, token: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { data, error } = await this.current(this.auth.auth.verifyOtp({ email, token, type: 'email' }));
    if (error) throw error;
    await this.acceptSession(data.session);
  }
  /** 切换到指定团队：拉取摘要并启动实时订阅，丢弃上一个团队的已加载内容。 */
  async selectWorkspace(workspace: WorkspaceEntry): Promise<void> {
    const epoch = ++this.generation;
    this.feed?.stop();
    const data = await this.current(this.api.snapshot(workspace), epoch);
    if (epoch !== this.generation) return;
    this.workspace = workspace;
    this.resetContents();
    this.adopt(data);
    this.draft = null;
    this.feed?.start(workspace);
    this.changed();
  }
  /** 网络恢复后刷新会话与快照；离线时只更新在线状态。 */
  async reconnect(): Promise<void> {
    this.online = navigator.onLine;
    if (!this.online || !this.auth || !this.user) {
      this.changed();
      return;
    }
    const { data, error } = await this.auth.auth.refreshSession();
    demand(!error && data.session, 'unauthenticated', '会话已过期，请重新登录');
    await this.acceptSession(data.session);
    await this.refresh();
  }
  /** 重新拉取当前摘要；较旧的摘要被丢弃，已打开任务的编辑权限被撤销时抛出 forbidden。 */
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
    this.adopt(data);
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
  /** 读取尚未得到确认的云端请求（刷新页面后仍保留在 sessionStorage）；记录损坏时清理并返回 null。 */
  pending(): { workspace: WorkspaceEntry; command: Command } | null {
    if (!this.user) return null;
    const key = `admin-collaboration-pending:${this.user.id}`;
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    try {
      const pending = JSON.parse(value) as { workspace?: unknown; command?: unknown };
      const workspace = pending.workspace as Partial<WorkspaceEntry> | undefined;
      const command = pending.command as Partial<Command> | undefined;
      demand(
        !!workspace &&
          typeof workspace.teamId === 'string' &&
          typeof workspace.appId === 'string' &&
          typeof workspace.name === 'string' &&
          !!command &&
          typeof command.type === 'string' &&
          typeof command.operationId === 'string',
        'invalid',
        '上次请求记录损坏，已清理'
      );
      return { workspace: workspace as WorkspaceEntry, command: command as Command };
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }
  /** 用原幂等键确认或重试上次未得到确认的请求。 */
  async retryPending(): Promise<void> {
    const pending = this.pending();
    demand(pending && this.user, 'missing', '没有待确认请求');
    if (pending.command.type === 'accept_invite') {
      await this.executeCommand(pending.command, pending.command.operationId, pending.workspace);
      this.workspaces = await this.current(this.api.workspaces());
      await this.selectWorkspace(pending.workspace);
      return;
    }
    await this.selectWorkspace(pending.workspace);
    await this.run(pending.command, pending.command.operationId);
    if (pending.command.type === 'fork') await this.openTask(pending.command.id);
  }
  /**
   * 提交一条云端命令并返回结果。变更类命令按队列串行，先查回执再执行，同一幂等键不会重复生效；presence、read_notice、subscribe 不排队。
   * @param command 命令内容，不含幂等键。
   * @param operationId 幂等键，重试同一请求时传入原值。
   */
  async run(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string = crypto.randomUUID()
  ): Promise<Record<string, unknown>> {
    if (['presence', 'read_notice', 'subscribe'].includes(String(command.type)))
      return this.executeCommand(command, operationId);
    const epoch = this.generation;
    const previous = this.mutations?.epoch === epoch ? this.mutations.settled : Promise.resolve();
    const queued = structuredClone(command);
    const next = previous.then(() => {
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      return this.executeCommand(queued, operationId);
    });
    this.mutations = {
      epoch,
      settled: next.then(
        () => undefined,
        () => undefined
      )
    };
    return next;
  }
  /** 用邀请令牌加入团队并选中它。 */
  async acceptInvitation(teamId: string, appId: string, id: string, token: string): Promise<void> {
    const workspace = { teamId, appId, name: teamId };
    const epoch = this.generation;
    await this.current(
      this.executeCommand({ type: 'accept_invite', id, tokenHash: token }, crypto.randomUUID(), workspace),
      epoch
    );
    const workspaces = await this.current(this.api.workspaces(), epoch);
    this.workspaces = workspaces;
    await this.selectWorkspace(workspace);
  }
  /** 基于当前共享版本新建任务并打开。 */
  async createTask(name: string): Promise<void> {
    const id = crypto.randomUUID();
    await this.run({ type: 'task', id, name, expectedHead: this.snapshot?.head ?? null });
    await this.openTask(id);
  }
  /** 打开自己的任务：校验编辑权限后建立或解锁对应的本机草稿。 */
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
    const records = await this.current(this.recordsAt(task.head));
    const epoch = ++this.generation;
    const draft = await this.local.openVerified(context, task.name, task.base, task.head, records);
    demand(epoch === this.generation, 'cancelled', '上下文已切换');
    this.draft = draft;
    this.changed();
  }
  /** 离线时打开一个已解锁的本机草稿。 */
  async openOffline(draft: Draft) {
    this.feed?.stop();
    const epoch = ++this.generation;
    this.local.assert(draft.context);
    const restored = await this.current(this.local.read(draft.context), epoch);
    this.draft = restored ?? null;
    this.snapshot = null;
    this.resetContents();
    this.workspace = { ...draft.context, name: draft.context.teamId };
    this.changed();
  }
  /** 把全部输入保存到本机草稿；只落盘，不形成提交也不同步。 */
  async save(records: Records): Promise<void> {
    demand(this.draft, 'missing', '先打开任务');
    const epoch = this.generation;
    const saved = await this.current(this.local.save(this.draft.context, records, this.draft.revision), epoch);
    if (epoch !== this.generation) return;
    this.draft = saved;
    this.message = '已保存到本机，尚未同步';
    this.changed();
  }
  /** 把本机改动形成提交并上传；`unsaved` 为 true（仍有未保存输入）时拒绝，离线时只排队。 */
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
  /** 把本机提交另存为新任务并打开；原任务与 PR 保持原远端版本。 */
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
  /** 退出账号：先锁定本机草稿，再通知其他页面并清除本机会话。 */
  async logout(): Promise<void> {
    const auth = this.auth;
    const userId = this.user?.id;
    await this.lock();
    this.channel.postMessage({ type: 'logout', userId });
    if (auth) await auth.auth.signOut({ scope: 'local' });
  }
  /** 锁定会话：先保存未保存输入，停止订阅，清空账号与团队状态并锁定本机草稿。 */
  async lock(): Promise<void> {
    if (this.user && this.checkpoint) {
      try {
        await this.checkpoint();
      } catch {
        this.message = '会话即将锁定，未保存输入无法落盘';
      }
    }
    this.feed?.stop();
    this.generation++;
    this.authGeneration++;
    localStorage.removeItem(`admin-collaboration-grant:${this.base}`);
    this.user = null;
    this.snapshot = null;
    this.resetContents();
    this.draft = null;
    this.workspace = null;
    this.offlineDrafts = [];
    this.workspaces = [];
    this.changed();
    await this.local.logout();
  }
  /** 统一处理失败：上下文切换造成的取消静默忽略；权限或身份失效类错误先锁定会话；其余显示为提示。 */
  async failure(error: unknown): Promise<void> {
    if (error instanceof CollaborationError && error.code === 'cancelled') return;
    if (error instanceof CollaborationError && ['forbidden', 'unauthenticated', 'locked'].includes(error.code))
      await this.lock();
    this.message = error instanceof Error ? error.message : '操作失败';
    this.changed();
  }
  /** 把本机任务快进到远端最新版本；本机有未提交修改、排队提交或未保存输入时拒绝。 */
  async fetchRemote(unsaved: boolean): Promise<void> {
    demand(this.draft, 'missing', '先打开任务');
    const context = this.draft.context;
    const epoch = this.generation;
    await this.current(this.refresh(), epoch);
    const task = this.snapshot?.tasks.find(value => value.id === context.taskId);
    demand(task, 'missing', '任务不存在');
    const records = await this.current(this.recordsAt(task.head), epoch);
    const draft = await this.current(this.local.fastForward(context, task.head, records, unsaved), epoch);
    this.draft = draft;
    this.changed();
  }
  /** 释放订阅、广播频道与本机存储；之后控制器不再响应任何结果。 */
  dispose() {
    this.disposed = true;
    this.generation++;
    this.authGeneration++;
    this.feed?.stop();
    this.resetContents();
    this.local.dispose();
    this.unsubscribe?.();
    this.channel.close();
  }
  /** 读取提交内容（同步）：命中返回；未命中返回 undefined 并在后台加载，加载完成后触发 `change`。 */
  commitContent(id: string): Commit | undefined {
    return this.commits.peek(id);
  }
  /** 读取合并候选的内容（同步），语义同 {@link CollaborationController.commitContent}。 */
  candidateContent(id: string): Candidate | undefined {
    return this.candidates.peek(id);
  }
  /**
   * 读取共享分支的记录（同步）：按摘要的头缓存，头变化后重新读取；空分支没有记录，直接返回空记录。
   * 未命中时返回 undefined 并在后台加载。
   */
  sharedRecords(): Records | undefined {
    const head = this.snapshot?.head;
    if (head === undefined) return undefined;
    return head === null ? {} : this.shared.peek(head)?.records;
  }
  /** 读取讨论线程的处理历史（同步，时间正序）；工作区修订号变化后重新读取。 */
  threadEvents(threadId: string): Audit[] | undefined {
    return this.threads.peek(threadId);
  }
  /** 等待提交内容加载完成；失败时抛出，用户操作可以再试。 */
  loadCommit(id: string): Promise<Commit> {
    return this.commits.load(id);
  }
  /** 等待合并候选内容加载完成；失败时抛出，用户操作可以再试。 */
  loadCandidate(id: string): Promise<Candidate> {
    return this.candidates.load(id);
  }
  /** 等待共享分支的记录加载完成；空分支没有记录，直接返回空记录。 */
  async loadSharedRecords(): Promise<Records> {
    demand(this.snapshot, 'missing', '先选择团队');
    const head = this.snapshot.head;
    return head === null ? {} : (await this.shared.load(head)).records;
  }
  /** 审计时间线：摘要里最近的事件加上已加载的更早事件，时间正序。 */
  auditEvents(): readonly Audit[] {
    return this.timeline.events;
  }
  /** 还有更早的审计事件没有加载。 */
  hasEarlierAudit(): boolean {
    return this.timeline.hasEarlier;
  }
  /** 加载更早的一页审计事件并接到时间线最前面；期间时间线已被重置或重新开始则丢弃这一页。 */
  async loadEarlierAudit(): Promise<void> {
    const cursor = this.timeline.cursor;
    demand(cursor !== undefined, 'missing', '先选择团队');
    const page = await this.current(this.api.audit(this.activeWorkspace(), { before: cursor }));
    if (this.timeline.prepend(cursor, page.events)) this.changed();
  }
  /** 接受一份新摘要：头提交变化则丢弃共享数据，修订号变化则丢弃讨论历史，并让失败过的内容在下次读取时重试。 */
  private adopt(data: WorkspaceSummary): void {
    const previous = this.snapshot;
    if (previous?.head !== data.head) this.shared.reset();
    if (previous?.revision !== data.revision) this.threads.reset();
    for (const cache of [this.commits, this.candidates, this.shared, this.threads]) cache.retry();
    this.snapshot = data;
    this.timeline.accept(data.audit, data.auditCount);
  }
  /** 丢弃全部已加载内容并使进行中的加载失效，用于切换团队、离线任务、锁定与释放。 */
  private resetContents(): void {
    this.commits.reset();
    this.candidates.reset();
    this.shared.reset();
    this.threads.reset();
    this.timeline.reset();
  }
  private activeWorkspace(): WorkspaceEntry {
    demand(this.workspace, 'missing', '先选择团队');
    return this.workspace;
  }
  /** 提交头对应的记录：还没有提交时是空记录，否则等待提交内容加载完成。 */
  private async recordsAt(head: string | null): Promise<Records> {
    return head === null ? {} : (await this.loadCommit(head)).records;
  }
  /** 读取共享记录；服务端返回的头已不是摘要的头时按「版本已变化」处理，等下一次刷新后再读。 */
  private async fetchShared(head: string): Promise<SharedRecords> {
    const content = await this.api.records(this.activeWorkspace());
    demand(content.head === head, 'stale', '版本已变化，请刷新后重试');
    return content;
  }
  /** 读取讨论线程的全部处理事件：逐页向前读到头，再翻成时间正序。 */
  private async fetchThreadEvents(threadId: string): Promise<Audit[]> {
    const workspace = this.activeWorkspace();
    const limit = auditPageSize.maximum;
    let page = await this.api.audit(workspace, { threadId, limit });
    const newestFirst = [...page.events];
    while (page.nextBefore) {
      page = await this.api.audit(workspace, { threadId, limit, before: page.nextBefore });
      newestFirst.push(...page.events);
    }
    return newestFirst.reverse();
  }
  /** 后台加载内容失败：版本已变化会随下一次刷新自动恢复，不提示；其余按统一的失败路径处理。 */
  private contentFailed(error: unknown): void {
    if (error instanceof CollaborationError && error.code === 'stale') return;
    void this.failure(error);
  }
  private async executeCommand(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string,
    workspaceOverride?: WorkspaceEntry
  ): Promise<Record<string, unknown>> {
    demand((workspaceOverride ?? this.workspace) && this.user, 'locked', '先登录并选择团队');
    const workspace = workspaceOverride ?? this.workspace!;
    const epoch = this.generation;
    const request = { ...command, operationId } as Command;
    const durable = !['presence', 'read_notice', 'subscribe'].includes(request.type);
    // 回执接口要求成员读权限；接受邀请时用户还不是成员，只能直接重发，由服务端按 operationId 幂等返回原结果
    const readsReceipt = durable && request.type !== 'accept_invite';
    const key = `admin-collaboration-pending:${this.user.id}`;
    const previous = this.pending();
    demand(
      !durable || !previous || previous.command.operationId === operationId,
      'pending',
      '先确认或重试上次请求，再执行新的云端变更'
    );
    if (durable) sessionStorage.setItem(key, JSON.stringify({ workspace, command: request }));
    let acknowledged = false;
    try {
      const receipt = readsReceipt ? await this.api.receipt(workspace, operationId) : { status: 'unknown' };
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      let result: Record<string, unknown>;
      if (receipt.status === 'accepted' && 'value' in receipt) {
        acknowledged = true;
        result = receipt.value!;
      } else {
        result = await this.api.command(workspace, request);
        acknowledged = true;
      }
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      if (request.type === 'presence') this.applyPresenceResult(request, result);
      else if (request.type !== 'accept_invite') await this.current(this.refresh(), epoch);
      if (request.type === 'fork') await this.current(this.archiveFork(request), epoch);
      if (durable) sessionStorage.removeItem(key);
      return result;
    } catch (error) {
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      if (
        durable &&
        error instanceof CollaborationError &&
        !['internal', 'uncertain', 'cancelled'].includes(error.code) &&
        !acknowledged
      )
        sessionStorage.removeItem(key);
      throw error;
    }
  }
  private applyPresenceResult(command: Extract<Command, { type: 'presence' }>, result: Record<string, unknown>): void {
    this.applyPresenceChange({
      eventType: command.leave ? 'DELETE' : 'UPDATE',
      row: {
        app_id: this.workspace?.appId,
        user_id: this.user?.id,
        session_id: command.sessionId,
        pr_id: command.prId,
        record_id: command.recordId,
        expires_at: result['expiresAt']
      }
    });
  }
  private applyPresenceChange(change: WorkspacePresenceChange): void {
    if (!this.snapshot) return;
    const userId = change.row['user_id'];
    const sessionId = change.row['session_id'];
    if (typeof userId !== 'string' || typeof sessionId !== 'string') return;
    const key = `${userId}:${sessionId}`;
    const current = this.snapshot.presence.filter(item => `${item.userId}:${item.sessionId}` !== key);
    if (change.eventType !== 'DELETE') {
      const expiresAt = Number(change.row['expires_at']);
      if (
        Number.isFinite(expiresAt) &&
        expiresAt > Date.now() &&
        this.snapshot.members.some(member => member.id === userId && member.active)
      )
        current.push({
          userId,
          sessionId,
          prId: typeof change.row['pr_id'] === 'string' ? change.row['pr_id'] : null,
          recordId: typeof change.row['record_id'] === 'string' ? change.row['record_id'] : null,
          expiresAt
        });
    }
    this.snapshot = { ...this.snapshot, presence: current };
    this.changed();
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
      demand(
        epoch === this.generation && (authEpoch === undefined || authEpoch === this.authGeneration) && !this.disposed,
        'cancelled',
        '上下文已切换'
      );
      return value;
    } catch (error) {
      demand(
        epoch === this.generation && (authEpoch === undefined || authEpoch === this.authGeneration) && !this.disposed,
        'cancelled',
        '上下文已切换'
      );
      throw error;
    }
  }
  private async archiveFork(command: Extract<Command, { type: 'fork' }>): Promise<void> {
    demand(this.user && this.workspace && this.snapshot, 'locked', '先选择团队');
    const task = this.snapshot.tasks.find(value => value.id === command.taskId);
    demand(task?.ownerId === this.user.id, 'forbidden', '没有此任务编辑权限');
    const context = {
      userId: this.user.id,
      teamId: this.workspace.teamId,
      appId: this.workspace.appId,
      taskId: task.id
    };
    const head = command.commits.at(-1)?.id;
    demand(head, 'invalid', '分叉回执缺少版本');
    const records = await this.current(this.recordsAt(task.head));
    await this.current(this.local.openVerified(context, task.name, task.base, task.head, records));
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
      const acknowledged = await this.current(
        this.local.acknowledge(context, pending.operationId, result['head'], epoch),
        viewEpoch
      );
      uploading = acknowledged;
      this.draft = acknowledged;
      this.changed();
    }
    await this.current(this.refresh(), viewEpoch);
    this.message = '当前提交已同步；后续编辑仍需另行同步';
    this.changed();
  }
}
