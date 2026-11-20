import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedBranch } from '../derive.js';
import {
  auditPageSize,
  CollaborationError,
  demand,
  type Audit,
  type Candidate,
  type Command,
  type Commit,
  type CommitContent,
  type CommitPage,
  type Identity,
  type Presence,
  type PullRequestDetail,
  type Records,
  type RevocationSignal,
  type SchemaManifest,
  type SharedRecords,
  type SignalKind,
  type WorkspaceSignal,
  type WorkspaceSummary
} from '../model.js';
import { supabaseReadSource, type ReadSource } from '../read-source.js';
import { CollaborationReader, type TeamPage, type WorkspaceEntry } from '../reader.js';
import { CollaborationApi } from './api.js';
import { AuditTimeline } from './audit-timeline.js';
import { CommitHistory, type HistoryBranch, type HistoryView } from './commit-history.js';
import { ContentCache } from './content-cache.js';
import { importOrder } from './import-anonymous.js';
import { AuthSession, type MessageTone } from './session.js';
import {
  retryWindowPassed,
  TaskLedger,
  uploadCommand,
  type Context,
  type PendingUpload,
  type TaskEntry
} from './task-ledger.js';
import type { TeamDatabase } from './team-database.js';
import { TeamTasks, type ExchangeDownload, type TaskView, type TeamOpener } from './team-tasks.js';
import { WorkspaceFeed, type FeedStatus } from './workspace-feed.js';

export type { WorkspaceEntry } from '../reader.js';

export type { MessageTone } from './session.js';

/** 尚未得到确认的云端请求：所属团队、原请求（含幂等键）与首次发出的时间。 */
export interface PendingRequest {
  workspace: WorkspaceEntry;
  command: Command;
  createdAt: number;
}

/** 团队页里 PR、本人任务与通知的窗口大小；「加载更早的…」每次再多读这么多。 */
export const teamWindowSize = 50;
/** 改动团队页内容的失效类别：收到它们时重读团队页，否则只读工作区行（修订号与审计总数）。 */
const teamKinds: readonly SignalKind[] = ['members', 'policy', 'schema', 'tasks', 'prs', 'shared'];
/** 改动全部 PR 详情推导依据的类别：成员与策略影响阶段进度，数据模式与共享头影响候选是否当前。 */
const detailKinds: readonly SignalKind[] = ['members', 'policy', 'schema', 'shared'];
/** 只在上下文内生效、不入队列的命令：标记已读与订阅通知。 */
const lightweight = ['read_notice', 'subscribe'];
const realtimeUnavailable = '实时连接暂不可用，可刷新团队状态';
type TeamWindows = { prs: number; tasks: number; notices: number };
/** 一组在线会话的比较键：与顺序无关，会话、成员或查看位置任一变化都会改变它。 */
const presenceKey = (sessions: readonly Presence[]) =>
  sessions
    .map(session => JSON.stringify([session.sessionId, session.userId, session.prId, session.recordId]))
    .sort()
    .join('\n');

/** 历史恢复被平台拒绝的成因到协作词条（平台的 `WorkingTreeRestoreResult`）。 */
const restoreRejections: Readonly<Record<string, string>> = {
  conflict: '其他页面已修改草稿，请保留输入后重新打开',
  dirty_working_tree: '先提交或放弃当前改动再恢复',
  incompatible_schema: '所选版本含有本应用不认识的数据，无法恢复',
  unreachable_target: '所选版本不在这个任务的历史里，无法恢复',
  side_branch_target: '所选版本只在合并带进来的侧枝上，无法直接恢复'
};

/**
 * 协作界面的状态与动作中枢：持有认证会话、团队页、团队库（团队任务落在平台 working-tree 上）与实时频道，界面监听 `change` 事件重绘。
 * 读取全部经 Supabase 的只读投影（{@link CollaborationReader}，PostgREST + RLS）：团队页只含成员、策略、引用与 PR 列表元数据
 * 与本人的通知窗口；PR 详情、提交历史、提交与候选内容、共享数据、审计都按需读取并缓存，同步读取入口未命中时返回 undefined
 * 并在后台加载，加载完成后触发 `change`。写入只经命令入口：所有云端变更都以带幂等键的命令按队列串行提交；
 * 账号、团队或任务上下文切换后，在途请求的结果会被丢弃。超过自动重试期限（比服务端回执保留期早一天）仍未确认的请求
 * 不再自动重发，交给用户确认或放弃。
 * 实时：私有频道上的失效通知按修订号推进，只重读变化的部分（类别与标识见 {@link WorkspaceSignal}）；修订号跳号、
 * 频道重连或恢复联网时按修订号补齐（整页重读）。在线状态来自同一频道的 Presence；撤权事件到达即移除该成员，
 * 被撤成员自己的页面立即锁定。
 */
export class CollaborationController extends EventTarget {
  private generation = 0;
  private disposed = false;
  private feed?: WorkspaceFeed;
  private source?: ReadSource;
  private authGeneration = 0;
  private mutations?: { epoch: number; settled: Promise<void> };
  /** 同一上下文与读取窗口只保留一个团队页请求，避免命令刷新与实时通知重复并发读取。 */
  private teamLoad?: {
    epoch: number;
    workspace: WorkspaceEntry;
    taskId: string | undefined;
    windows: TeamWindows;
    promise: Promise<WorkspaceSummary>;
  };
  /** 正在跟随的全局身份变化（{@link CollaborationController.adoptIdentity}）：重连、登录之后等它落定。 */
  private identity: Promise<void> = Promise.resolve();
  /** 会话是本控制器自己建的（没有传入全局会话）：释放控制器时一并释放。 */
  private readonly ownsSession: boolean;
  /** 取消订阅团队库的本地写入（打开着的任务）。 */
  private unwatch?: () => void;
  /** 合并同一轮里多次本地写入触发的任务状态重读。 */
  private taskRefresh?: Promise<void>;
  /** 本页面的 Presence 会话标识。 */
  private readonly sessionId = crypto.randomUUID();
  /** 频道上最近一次 Presence 全集（未按成员过滤）。 */
  private sessions: Presence[] = [];
  /** 撤权事件里已失去读权限的成员：立即从在线列表移除，不等成员列表重读。 */
  private readonly revokedUsers = new Set<string>();
  /** 团队页的窗口：PR、本人任务与通知各读最近多少条。 */
  private windows = { prs: teamWindowSize, tasks: teamWindowSize, notices: teamWindowSize };
  /** 待处理的失效通知（按到达顺序）与正在处理它们的任务。 */
  private signals: WorkspaceSignal[] = [];
  private draining?: Promise<void>;
  /** 实时频道当前是否已订阅；从已订阅变为异常时补齐一次，频道反复重试时不重复读取。 */
  private live = false;
  /** 提交不可变，按 ID 缓存；只在切换团队或锁定时丢弃。 */
  private readonly commits = new ContentCache<CommitContent>(
    async id => this.reader.commit(this.activeWorkspace(), this.sharedBranch(), id),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 候选不可变，按 ID 缓存；只在切换团队或锁定时丢弃。 */
  private readonly candidates = new ContentCache<Candidate>(
    async id => this.reader.candidate(this.activeWorkspace(), this.sharedBranch(), id),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 共享数据按摘要的头提交缓存，头变化即丢弃。 */
  private readonly shared = new ContentCache<SharedRecords>(
    head => this.fetchShared(head),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 数据模式清单按版本只追加、不可修改，按版本缓存；只在切换团队或锁定时丢弃（版本号只在一个工作区内有意义）。 */
  private readonly schemas = new ContentCache<SchemaManifest>(
    async version => this.reader.schema(this.activeWorkspace(), Number(version)),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 讨论线程的处理历史，工作区修订号变化即丢弃。 */
  private readonly threads = new ContentCache<Audit[]>(
    threadId => this.fetchThreadEvents(threadId),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** PR 详情按 PR 缓存：失效通知点到某个 PR 时标为过期，旧详情照常显示、后台重读。 */
  private readonly details = new ContentCache<PullRequestDetail>(
    prId => this.fetchDetail(prId),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 最近一窗审计事件，按工作区修订号缓存：修订号变化即丢弃，审计时间线展开时才读取。 */
  private readonly recentAudit = new ContentCache<Audit[]>(
    async () => this.reader.recentAudit(this.activeWorkspace()),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  /** 提交历史按分支与头提交分页缓存：头变化即从第一页重读。 */
  private readonly history = new CommitHistory(
    (branch, before) => this.fetchHistory(branch, before),
    () => this.changed(),
    error => this.contentFailed(error)
  );
  private readonly timeline = new AuditTimeline();
  /** 团队库里的任务：按「用户 × 团队 × 应用」一个团队库，任务是其中的分支；退出或会话失效时锁定并关库。 */
  readonly tasks: TeamTasks;
  /** 公开配置与命令的 HTTP 客户端：命令携带当前会话令牌，由服务端本地验签。 */
  readonly api: CollaborationApi;
  /** 只读访问：经 Supabase 的只读投影读取，可见范围由 RLS 按当前会话裁决。 */
  readonly reader: CollaborationReader;
  /** 全局登录会话：身份、验证码登录与退出都在它那里，控制器跟随它的身份变化。 */
  readonly session: AuthSession;
  /** 当前已确认的身份；未登录或已锁定时为 null。 */
  user: Identity | null = null;
  /** 当前账号可访问的团队与应用。 */
  workspaces: WorkspaceEntry[] = [];
  /** 当前选中的团队与应用。 */
  workspace: WorkspaceEntry | null = null;
  /** 当前工作区的团队页；尚未选择团队或处于离线任务模式时为 null。 */
  snapshot: WorkspaceSummary | null = null;
  /** 当前打开的团队任务：团队库已切到它的分支，编辑界面读写它。 */
  task: TaskView | null = null;
  /** 离线冷启动时按缓存授权恢复出的可解锁任务。 */
  offlineDrafts: TaskEntry[] = [];
  /** 是否在线：随浏览器网络状态与最近一次云端请求更新。 */
  online = navigator.onLine;
  /** 最近一条提示，通常是中文词条原文，由界面经词条表翻译后显示。 */
  message = '';
  /** 最近一条提示的语气：界面据此选提示条的图标与颜色。 */
  messageTone: MessageTone = 'info';
  /** 是否正在上传任务提交。 */
  syncing = false;
  /**
   * 编辑界面里有没有未保存的输入（ADMIN-US-205 AC#5），挂载方按应用的报告更新：对话框里还没点保存的表单取值不在任务工作树里，
   * 同步带不上它，编辑界面一卸载它就丢了，而协作包没法替用户保存它。为 true 时，会卸载编辑界面或改写任务的动作一律拒绝并说明
   * （`unsaved`）：切换团队、接受邀请、重放上次请求、打开或新建任务、离线任务、导入、恢复、同步、另存、拉取远端、放弃草稿与退出。
   * 会话失效引起的锁定不受它拦（安全优先），挂载方另外说明输入已随编辑界面丢弃。
   */
  unsavedInput = false;
  /** Supabase 认证客户端（全局会话的）；会话初始化完成后才存在。 */
  get auth(): SupabaseClient | undefined {
    return this.session.auth;
  }
  /**
   * 创建控制器；此时尚未联网，需继续调用 {@link CollaborationController.initialize}。
   * @param base 协作 HTTP 接口的路径前缀。
   * @param open 打开团队库（`scope => openTeamDatabase(应用的工厂, scope)`）。
   * @param ledger 本机任务账本，默认存在 `localStorage`。
   * @param session 应用的全局登录会话（{@link authSession}）；不传则自建一个，只给这个控制器用（测试里）。
   */
  constructor(
    readonly base: string,
    open: TeamOpener,
    ledger: TaskLedger = new TaskLedger(localStorage),
    session?: AuthSession
  ) {
    super();
    this.ownsSession = !session;
    this.session = session ?? new AuthSession(base, () => this.api.config());
    this.tasks = new TeamTasks(ledger, open);
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
    this.reader = new CollaborationReader(() => {
      demand(this.source, 'configuration', '认证未配置');
      return this.source;
    });
  }
  /** 通知界面重绘（派发 `change` 事件）。 */
  changed() {
    this.dispatchEvent(new Event('change'));
  }
  /** 设置提示与语气（不派发 `change`，调用方随后重绘）；传空串即清除提示。 */
  notify(message: string, tone: MessageTone = 'info'): void {
    this.message = message;
    this.messageTone = tone;
  }
  /** 当前打开着的任务所在的团队库（编辑界面读写它）；没有打开任务时为 undefined。 */
  teamDatabase(): TeamDatabase | undefined {
    return this.task ? this.tasks.database : undefined;
  }
  /**
   * 等全局会话建好认证客户端并恢复身份，再接上只读投影与实时频道、跟随会话的身份（见 {@link CollaborationController.adoptIdentity}）。
   * 离线且没有可用的缓存授权时拒绝（`locked`）：团队草稿要先联网验证身份。
   */
  async initialize(): Promise<void> {
    const epoch = ++this.authGeneration;
    await this.current(this.session.initialize(), this.generation, epoch);
    demand(this.session.auth, 'configuration', '认证未配置');
    this.source = supabaseReadSource(this.session.auth);
    this.feed = new WorkspaceFeed(this.session.auth, {
      changed: signal => this.onSignal(signal),
      revoked: signal => this.onRevoked(signal),
      presence: sessions => this.onPresence(sessions),
      status: status => this.onFeedStatus(status)
    });
    this.session.addEventListener('identity', this.identityChanged);
    await this.follow();
  }
  /** 向邮箱发送一次性验证码（全局会话）。 */
  sendCode(email: string): Promise<void> {
    return this.session.sendCode(email);
  }
  /** 校验邮箱验证码并建立会话（全局会话），等团队协作跟上新身份再返回。 */
  async verify(email: string, token: string): Promise<void> {
    await this.session.verify(email, token);
    await this.identity;
  }
  /**
   * 切换到指定团队：读取团队页并加入它的私有频道，丢弃上一个团队的已加载内容与在线状态；关闭打开着的任务，
   * 换了团队或应用时关闭上一个团队库（编辑界面先卸载，之后才关库）。
   */
  async selectWorkspace(workspace: WorkspaceEntry): Promise<void> {
    this.assertSaved();
    demand(this.user, 'locked', '先登录并选择团队');
    const user = this.user;
    const epoch = ++this.generation;
    this.feed?.stop();
    this.sessions = [];
    this.revokedUsers.clear();
    this.signals = [];
    this.windows = { prs: teamWindowSize, tasks: teamWindowSize, notices: teamWindowSize };
    this.closeTask();
    const data = await this.current(this.loadTeamRequest(workspace, epoch), epoch);
    if (epoch !== this.generation) return;
    this.workspace = workspace;
    this.resetContents();
    this.adopt(data);
    this.feed?.start(workspace, { userId: user.id, sessionId: this.sessionId });
    this.changed();
    const open = this.tasks.database?.scope;
    if (open && (open.teamId !== workspace.teamId || open.appId !== workspace.appId)) await this.tasks.detach();
  }
  /** 网络恢复后刷新会话（全局会话重新确认身份）与团队页（按修订号补齐离线期间的变化）；离线时只更新在线状态。 */
  async reconnect(): Promise<void> {
    this.online = navigator.onLine;
    if (!this.online || !this.session.auth || !this.user) {
      this.changed();
      return;
    }
    await this.session.reconnect();
    await this.identity;
    await this.refresh();
  }
  /**
   * 整页重读团队页：较旧的结果被丢弃，已加载的 PR 详情标为过期（显示中的那个随即重读）；
   * 已打开任务的编辑权限被撤销时抛出 forbidden。
   */
  async refresh(): Promise<void> {
    if (!navigator.onLine) {
      this.online = false;
      this.changed();
      return;
    }
    if (!this.workspace) return;
    const workspace = this.workspace;
    const epoch = this.generation;
    const data = await this.current(this.loadTeamRequest(workspace, epoch), epoch);
    if (epoch !== this.generation || workspace !== this.workspace) return;
    if (this.snapshot && data.revision < this.snapshot.revision) return;
    this.details.invalidate();
    this.adopt(data);
    this.online = true;
    this.assertDraftAccess();
    this.changed();
  }
  /** 多读一窗更早的 PR。 */
  async loadEarlierPrs(): Promise<void> {
    this.windows = { ...this.windows, prs: this.windows.prs + teamWindowSize };
    await this.refresh();
  }
  /** 多读一窗本人更早的任务。 */
  async loadEarlierTasks(): Promise<void> {
    this.windows = { ...this.windows, tasks: this.windows.tasks + teamWindowSize };
    await this.refresh();
  }
  /** 多读一窗本人更早的通知。 */
  async loadEarlierNotices(): Promise<void> {
    this.windows = { ...this.windows, notices: this.windows.notices + teamWindowSize };
    await this.refresh();
  }
  /** 上报本页面当前查看的 PR 与记录（Realtime Presence）；与上次相同时不发送。只是协作提示，不授予任何权限。 */
  trackPresence(prId: string | null, recordId: string | null): void {
    this.feed?.view(prId, recordId);
  }
  /**
   * 读取尚未得到确认的云端请求（刷新页面后仍保留在 sessionStorage），含首次发出的时间；
   * 记录损坏（含没有有效的首次发出时间）时清理并返回 null。
   */
  pending(): PendingRequest | null {
    if (!this.user) return null;
    const key = `admin-collaboration-pending:${this.user.id}`;
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    try {
      const pending = JSON.parse(value) as { workspace?: unknown; command?: unknown; createdAt?: unknown };
      const workspace = pending.workspace as Partial<WorkspaceEntry> | undefined;
      const command = pending.command as Partial<Command> | undefined;
      demand(
        !!workspace &&
          typeof workspace.teamId === 'string' &&
          typeof workspace.appId === 'string' &&
          typeof workspace.name === 'string' &&
          !!command &&
          typeof command.type === 'string' &&
          typeof command.operationId === 'string' &&
          typeof pending.createdAt === 'number' &&
          Number.isFinite(pending.createdAt),
        'invalid',
        '上次请求记录损坏，已清理'
      );
      return { workspace: workspace as WorkspaceEntry, command: command as Command, createdAt: pending.createdAt };
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }
  /**
   * 上次未确认的请求是否已超过自动重试期限（比服务端回执保留期早一天）：服务端可能已清理它的回执，
   * 回执查不到时无法再判断它是否生效，不再自动重发，由用户选择重新发送或放弃。
   */
  pendingExpired(): boolean {
    const pending = this.pending();
    return !!pending && retryWindowPassed(pending.createdAt);
  }
  /** 用原幂等键确认或重试上次未得到确认的请求；已超过自动重试期限且查不到回执时不重发，抛出 `expired`。 */
  async retryPending(): Promise<void> {
    await this.replayPending(false);
  }
  /** 用户核对后确认重新发送上次请求：同 {@link CollaborationController.retryPending}，但不再检查自动重试期限。 */
  async resendPending(): Promise<void> {
    await this.replayPending(true);
  }
  /** 放弃上次未确认的请求：只清掉本机记录，不向服务端发送任何内容。 */
  discardPending(): void {
    demand(this.user, 'locked', '先登录并选择团队');
    sessionStorage.removeItem(`admin-collaboration-pending:${this.user.id}`);
    this.changed();
  }
  /**
   * 提交一条云端命令并返回结果。变更类命令按队列串行，先查回执再执行，同一幂等键不会重复生效；read_notice、subscribe 不排队。
   * @param command 命令内容，不含幂等键。
   * @param operationId 幂等键，重试同一请求时传入原值。
   */
  async run(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string = crypto.randomUUID()
  ): Promise<Record<string, unknown>> {
    return this.enqueue(command, operationId, false);
  }
  /** 用邀请令牌加入团队并选中它。 */
  async acceptInvitation(teamId: string, appId: string, id: string, token: string): Promise<void> {
    // 接受之后会切到新团队：先拦下，不能邀请已经消费了才发现切不过去
    this.assertSaved();
    const workspace = { teamId, appId, name: teamId };
    const epoch = this.generation;
    await this.current(
      this.executeCommand({ type: 'accept_invite', id, tokenHash: token }, crypto.randomUUID(), workspace),
      epoch
    );
    const workspaces = await this.current(this.reader.workspaces(), epoch);
    this.workspaces = workspaces;
    await this.selectWorkspace(workspace);
  }
  /** 基于当前共享版本新建任务并打开。 */
  async createTask(name: string): Promise<void> {
    this.assertSaved();
    demand(this.snapshot, 'locked', '先选择团队');
    const id = crypto.randomUUID();
    await this.run({ type: 'task', id, name, expectedHead: this.snapshot.head });
    await this.openTask(id);
  }
  /**
   * 打开自己的任务：校验编辑权限后在团队库里切到它的分支。本机还没有这个任务的分支时，先镜像共享分支、从任务的共同起点建分支，
   * 再导入任务在服务端已有的提交（跨设备续作，提交 ID、父链与作者与服务端一致）。编辑界面先卸载，切好分支之后再渲染。
   */
  async openTask(id: string): Promise<void> {
    this.assertSaved();
    demand(this.user && this.workspace && this.snapshot, 'locked', '先选择团队');
    await this.current(this.refresh());
    const task = this.snapshot.tasks.find(t => t.id === id);
    const member = this.snapshot.members.find(m => m.id === this.user?.id);
    demand(task?.ownerId === this.user.id && member?.permissions.includes('edit'), 'forbidden', '没有此任务编辑权限');
    const workspace = this.workspace;
    const context = { userId: this.user.id, teamId: workspace.teamId, appId: workspace.appId, taskId: task.id };
    this.closeTask();
    this.changed();
    const epoch = ++this.generation;
    const view = await this.current(this.tasks.prepare(context, task, this.download(workspace)), epoch);
    this.showTask(view);
  }
  /** 离线时打开一个已解锁的本机任务：团队库切到它的分支，不读服务端内容。 */
  async openOffline(entry: TaskEntry) {
    this.assertSaved();
    this.feed?.stop();
    this.closeTask();
    this.changed();
    const epoch = ++this.generation;
    this.tasks.assert(entry.context);
    const view = await this.current(this.tasks.resume(entry.context), epoch);
    this.snapshot = null;
    this.resetContents();
    this.workspace = { teamId: entry.context.teamId, appId: entry.context.appId, name: entry.context.teamId };
    this.showTask(view);
  }
  /** 重读打开着的任务的状态（工作树、本机提交与同步元数据）；读取期间换了任务就丢弃结果。 */
  async refreshTask(): Promise<void> {
    const open = this.task;
    if (!open) return;
    const epoch = this.generation;
    const view = await this.current(this.tasks.view(open.context), epoch);
    if (this.task?.context.taskId !== open.context.taskId) return;
    this.task = view;
    this.changed();
  }
  /**
   * 把已保存的改动形成提交并上传：工作树有条目时先 `commit()`（作者是当前用户），再把远端头之后的本机提交按批上传，
   * 离线时只形成提交、排队等联网。待确认的上传已超过自动重试期限时不再自动发送（见 {@link CollaborationController.uploadExpired}），
   * 用户核对远端版本后以 `confirmExpired` 为 true 再同步，才按原幂等键与原提交发送。表单里尚未保存的输入不在工作树里，不会被提交。
   */
  async sync(confirmExpired = false): Promise<void> {
    this.assertSaved();
    if (this.syncing) return;
    this.syncing = true;
    try {
      await this.current(this.upload(confirmExpired));
    } finally {
      this.syncing = false;
      this.changed();
    }
  }
  /**
   * 打开着的任务的待确认上传是否已超过自动重试期限（比服务端回执保留期早一天）：服务端可能已清理回执，
   * 同步时先核对远端任务头，确认不了就交给用户确认后再发送。
   */
  uploadExpired(): boolean {
    const first = this.task?.uploads[0];
    return !!first && retryWindowPassed(first.createdAt);
  }
  /**
   * 把本机提交另存为新任务并打开（ADMIN-US-206 AC#9）：先把已保存的改动形成提交，再以远端头为分叉起点发出 `fork` 命令；
   * 新任务在本机从原任务分支的头另起一条分支。原任务与 PR 保持原远端版本，之后可以拉取远端版本跟随它。
   */
  async fork(name: string): Promise<void> {
    this.assertSaved();
    demand(this.task, 'missing', '先打开任务');
    const original = this.task;
    await this.current(this.tasks.commit(original.context, original.name));
    const plan = await this.current(this.tasks.forkPlan(original.context));
    const id = crypto.randomUUID();
    await this.run({ type: 'fork', id, name, taskId: original.context.taskId, ...plan });
    await this.openTask(id);
    this.notify('已另存为新任务，原任务与 PR 保持原远端版本', 'success');
    this.changed();
  }
  /** 放弃草稿（ADMIN-US-221 AC#3）：工作树退回任务头，业务表一起退回，列表与表单随即读到任务头的数据。 */
  async discardDraft(): Promise<void> {
    this.assertSaved();
    demand(this.task, 'missing', '先打开任务');
    const context = this.task.context;
    await this.current(this.tasks.discard(context));
    await this.refreshTask();
    this.notify('已放弃草稿，任务回到上次提交的版本', 'success');
    this.changed();
  }
  /**
   * 从一个历史版本创建恢复草稿（ADMIN-US-213 AC#4、ADMIN-US-221 AC#5）：从当前共享版本新建任务，在它的分支上 `restore()`
   * 到所选提交，旧内容成为未提交改动；共享头与历史都不动，之后照常同步、审核与合并。平台拒绝时按成因提示。
   */
  async restoreVersion(commitId: string, name: string): Promise<void> {
    await this.createTask(name);
    demand(this.task, 'missing', '先打开任务');
    const result = await this.current(this.tasks.restore(this.task.context, commitId));
    await this.refreshTask();
    if (!result.ok)
      throw new CollaborationError('restore', restoreRejections[result.reason], { reason: result.reason });
    this.message =
      result.restoredCount ? '已从历史版本形成未提交改动，同步后进入审核' : (
        '所选版本与当前共享版本相同，没有需要恢复的改动'
      );
    this.changed();
  }
  /**
   * 把预览确认过的匿名记录复制到新任务（ADMIN-US-204 AC#2）：新建任务，按引用顺序把记录作为普通编辑写进它的分支，
   * 经捕获进入工作树；不提交、不上传，也不改共享数据。
   */
  async importRecords(name: string, records: Records, schema: SchemaManifest): Promise<void> {
    await this.createTask(name);
    demand(this.task, 'missing', '先打开任务');
    await this.current(this.tasks.write(this.task.context, records, importOrder(schema)));
    await this.refreshTask();
    this.notify('已复制到任务工作树，尚未提交或同步', 'success');
    this.changed();
  }
  /** 退出账号：先锁定本机草稿，再经全局会话通知其他页面并清除本机会话。 */
  async logout(): Promise<void> {
    this.assertSaved();
    await this.lock();
    await this.session.logout();
  }
  /**
   * 锁定会话（身份不再成立：退出、会话失效、换了账号）：离开实时频道，清空账号与团队状态，锁定本机任务并关闭团队库
   * （编辑界面先卸载，之后才关库）。团队库里的已保存改动与提交保留，联网重新验证后可再打开。
   */
  async lock(): Promise<void> {
    this.feed?.stop();
    this.generation++;
    this.authGeneration++;
    this.user = null;
    this.snapshot = null;
    this.resetContents();
    this.closeTask();
    this.workspace = null;
    this.offlineDrafts = [];
    this.workspaces = [];
    this.sessions = [];
    this.signals = [];
    this.live = false;
    this.changed();
    await this.tasks.logout();
  }
  /**
   * 锁定团队上下文（团队访问被撤销或越权：`forbidden`、`locked`）：离开实时频道、关闭任务与团队库、清空团队状态并锁定本机草稿，
   * 账号保持登录，回到团队列表并重读可访问的团队。草稿要等联网验证身份与权限之后重新打开才解锁。
   */
  async lockTeam(): Promise<void> {
    const user = this.user;
    this.feed?.stop();
    this.generation++;
    this.snapshot = null;
    this.resetContents();
    this.closeTask();
    this.workspace = null;
    this.offlineDrafts = [];
    this.sessions = [];
    this.signals = [];
    this.live = false;
    this.changed();
    await this.tasks.logout();
    if (!user) return;
    await this.tasks.login(user.id);
    if (!navigator.onLine) return;
    const epoch = this.generation;
    try {
      const workspaces = await this.reader.workspaces();
      if (epoch === this.generation) this.workspaces = workspaces;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : '操作失败', 'error');
    }
    this.changed();
  }
  /**
   * 统一处理失败：上下文切换造成的取消静默忽略；会话失效（`unauthenticated`）时全局会话退出、本页锁定；
   * 团队访问被撤销或越权（`forbidden`、`locked`）只锁定团队上下文，账号保持登录；其余显示为提示。
   */
  async failure(error: unknown): Promise<void> {
    if (error instanceof CollaborationError && error.code === 'cancelled') return;
    if (error instanceof CollaborationError && error.code === 'unauthenticated') {
      this.session.signOut();
      await this.lock();
    } else if (error instanceof CollaborationError && ['forbidden', 'locked'].includes(error.code))
      await this.lockTeam();
    this.notify(error instanceof Error ? error.message : '操作失败', 'error');
    this.changed();
  }
  /**
   * 把本机任务快进到远端最新版本（ADMIN-US-206 AC#6）：本机有已保存未提交、未同步或待确认的提交时拒绝，
   * 除非这些提交已另存为新任务；那时原任务从远端头另起一条分支跟随远端。
   */
  async fetchRemote(): Promise<void> {
    this.assertSaved();
    demand(this.task && this.workspace, 'missing', '先打开任务');
    const context = this.task.context;
    const workspace = this.workspace;
    const epoch = this.generation;
    await this.current(this.refresh(), epoch);
    demand(
      this.snapshot?.tasks.some(value => value.id === context.taskId),
      'missing',
      '任务不存在'
    );
    const view = await this.current(this.tasks.fastForward(context, this.download(workspace)), epoch);
    this.task = view;
    this.changed();
  }
  /** 编辑界面里有没保存的输入时拒绝（`unsaved`）：退出账号、切换任务等会卸载编辑界面的动作之前调用。 */
  ensureSaved(): void {
    demand(!this.unsavedInput, 'unsaved', '先在编辑界面里保存或取消未保存的输入');
  }
  /** 释放实时频道与团队库，不再跟随全局会话（自建的会话一并释放）；之后控制器不再响应任何结果。 */
  dispose() {
    this.disposed = true;
    this.generation++;
    this.authGeneration++;
    this.feed?.stop();
    this.resetContents();
    this.closeTask();
    this.tasks.dispose();
    this.session.removeEventListener('identity', this.identityChanged);
    if (this.ownsSession) this.session.dispose();
  }
  /** 读取提交内容（同步）：命中返回；未命中返回 undefined 并在后台加载，加载完成后触发 `change`。 */
  commitContent(id: string): CommitContent | undefined {
    return this.commits.peek(id);
  }
  /** 读取合并候选的内容（同步），语义同 {@link CollaborationController.commitContent}。 */
  candidateContent(id: string): Candidate | undefined {
    return this.candidates.peek(id);
  }
  /**
   * 读取一个 PR 的详情（同步）：候选、审核、讨论与审批进度。未加载时返回 undefined 并在后台读取；
   * 失效通知点到它时旧详情照常返回、后台重读。团队页里的 PR 已指向详情里还没有的候选时，详情落后于列表，按未加载处理并重读。
   */
  prDetail(prId: string): PullRequestDetail | undefined {
    const pr = this.snapshot?.prs.find(item => item.id === prId);
    if (!pr) return undefined;
    const detail = this.details.peek(prId);
    if (!detail || pr.candidateId === null || Object.hasOwn(detail.candidates, pr.candidateId)) return detail;
    this.details.invalidate([prId]);
    this.details.peek(prId);
    return undefined;
  }
  /**
   * 读取共享分支的记录（同步）：按摘要的头缓存，头变化后重新读取；头还是共享分支根（没有任何合并）时没有记录，直接返回空记录。
   * 未命中时返回 undefined 并在后台加载。
   */
  sharedRecords(): Records | undefined {
    const data = this.snapshot;
    if (!data) return undefined;
    return data.head === data.root ? {} : this.shared.peek(data.head)?.records;
  }
  /**
   * 读取当前要用的数据模式清单（同步）：取摘要里的当前版本（按版本缓存，未命中返回 undefined 并在后台加载）；
   * 还没有摘要（离线打开任务）时为 undefined——离线只编辑团队库，只读的共享数据、PR 与历史面板不显示。
   */
  schema(): SchemaManifest | undefined {
    if (!this.snapshot) return undefined;
    return this.schemas.peek(String(this.snapshot.schemaVersion));
  }
  /** 等待当前工作区的数据模式清单加载完成（摘要里的当前版本）。 */
  loadSchema(): Promise<SchemaManifest> {
    demand(this.snapshot, 'missing', '先选择团队');
    return this.schemas.load(String(this.snapshot.schemaVersion));
  }
  /** 读取讨论线程的处理历史（同步，时间正序）；工作区修订号变化后重新读取。 */
  threadEvents(threadId: string): Audit[] | undefined {
    return this.threads.peek(threadId);
  }
  /**
   * 读取一条分支的提交历史（同步，从新到旧）：共享分支以摘要的 `head` 为头，PR 以其来源任务在摘要里的头为头；
   * 头变化后从第一页重新读取。空分支或任务在起点之后还没有提交时直接返回空列表；
   * 未命中返回 undefined 并在后台读第一页，读完触发 `change`。还没有摘要或 PR 不在摘要里时返回 undefined。
   */
  commitHistory(branch: HistoryBranch): HistoryView | undefined {
    const head = this.historyHead(branch);
    return head === undefined ? undefined : this.history.peek(branch, head);
  }
  /** 读取分支历史的下一页并接在已加载的提交后面；读取期间头变化或团队切换时丢弃这一页。失败时抛出，由用户操作再试。 */
  async loadEarlierCommits(branch: HistoryBranch): Promise<void> {
    const head = this.historyHead(branch);
    if (head) await this.history.loadEarlier(branch, head);
  }
  /** 等待提交内容加载完成；失败时抛出，用户操作可以再试。 */
  loadCommit(id: string): Promise<CommitContent> {
    return this.commits.load(id);
  }
  /** 等待合并候选内容加载完成；失败时抛出，用户操作可以再试。 */
  loadCandidate(id: string): Promise<Candidate> {
    return this.candidates.load(id);
  }
  /** 等待共享分支的记录加载完成；头还是共享分支根时没有记录，直接返回空记录。 */
  async loadSharedRecords(): Promise<Records> {
    demand(this.snapshot, 'missing', '先选择团队');
    const { head, root } = this.snapshot;
    return head === root ? {} : (await this.shared.load(head)).records;
  }
  /**
   * 审计时间线（同步，时间正序）：最近一窗事件加上已加载的更早事件。最近一窗在第一次读取时（展开时间线）才加载，
   * 未加载时返回 undefined 并在后台读取；修订号变化后重读最近一窗并接到时间线上。
   */
  auditEvents(): readonly Audit[] | undefined {
    if (!this.snapshot) return undefined;
    const window = this.recentAudit.peek(String(this.snapshot.revision));
    if (!window) return undefined;
    this.timeline.accept(window, this.snapshot.auditCount);
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
    const page = await this.current(this.reader.audit(this.activeWorkspace(), { before: cursor }));
    if (this.timeline.prepend(cursor, page.events)) this.changed();
  }
  /** 读取团队页：窗口之外还要带上打开着的任务，免得编辑权限校验看不到它。 */
  private loadTeamRequest(workspace: WorkspaceEntry, epoch = this.generation): Promise<WorkspaceSummary> {
    const taskId = this.task?.context.taskId;
    const windows = { ...this.windows };
    const current = this.teamLoad;
    if (
      current?.epoch === epoch &&
      current.workspace === workspace &&
      current.taskId === taskId &&
      current.windows.prs === windows.prs &&
      current.windows.tasks === windows.tasks &&
      current.windows.notices === windows.notices
    )
      return current.promise;
    const promise = this.loadTeam(workspace, windows, taskId);
    const request = { epoch, workspace, taskId, windows, promise };
    this.teamLoad = request;
    void promise.then(
      () => {
        if (this.teamLoad === request) this.teamLoad = undefined;
      },
      () => {
        if (this.teamLoad === request) this.teamLoad = undefined;
      }
    );
    return promise;
  }
  private async loadTeam(
    workspace: WorkspaceEntry,
    windows = this.windows,
    taskId = this.task?.context.taskId
  ): Promise<WorkspaceSummary> {
    demand(this.user, 'locked', '先登录并选择团队');
    const taskIds = taskId ? [taskId] : [];
    return this.compose(await this.reader.team(workspace, this.user.id, { ...windows, taskIds }));
  }
  /** 团队页的读取结果转成界面用的视图；在线状态由频道另行提供。 */
  private compose(team: TeamPage): WorkspaceSummary {
    return {
      teamId: team.teamId,
      appId: team.appId,
      name: team.name,
      revision: team.revision,
      schemaVersion: team.schemaVersion,
      head: team.head,
      root: team.root,
      policy: team.policy,
      members: team.members,
      tasks: team.tasks,
      prs: team.prs,
      notifications: team.notices.notices,
      unread: team.notices.unread,
      earlier: { prs: team.earlier.prs, tasks: team.earlier.tasks, notices: team.notices.earlier },
      invitations: team.invitations,
      presence: [],
      auditCount: team.auditCount
    };
  }
  /**
   * 接受一份新的团队页：头提交变化则丢弃共享数据，修订号变化则丢弃讨论历史与最近一窗审计，并让失败过的内容在下次读取时重试；
   * 在线状态按新的成员列表重新过滤。
   */
  private adopt(data: WorkspaceSummary): void {
    const previous = this.snapshot;
    if (previous?.head !== data.head) this.shared.reset();
    if (previous?.revision !== data.revision) {
      this.threads.reset();
      this.recentAudit.reset();
    }
    for (const cache of [
      this.commits,
      this.candidates,
      this.shared,
      this.threads,
      this.history,
      this.schemas,
      this.details,
      this.recentAudit
    ])
      cache.retry();
    this.snapshot = { ...data, presence: this.visibleSessions(data) };
  }
  /** 在线会话里当前有效、未被撤权的成员；同一份 Presence 全集随成员列表变化重新过滤。 */
  private visibleSessions(data: Pick<WorkspaceSummary, 'members'>): Presence[] {
    const members = new Set(data.members.map(member => member.id));
    return this.sessions.filter(session => members.has(session.userId) && !this.revokedUsers.has(session.userId));
  }
  /** 已打开的任务必须仍属于本人且本人仍有编辑权限，否则锁定（撤权、移交或降权之后）。 */
  private assertDraftAccess(): void {
    if (!this.task || !this.snapshot) return;
    const task = this.snapshot.tasks.find(t => t.id === this.task?.context.taskId);
    const member = this.snapshot.members.find(m => m.id === this.user?.id);
    demand(task?.ownerId === this.user?.id && member?.permissions.includes('edit'), 'forbidden', '任务编辑权限已撤销');
  }
  /** 失效通知到达：排队，按到达顺序合并处理，处理期间到达的通知合进下一批。 */
  private onSignal(signal: WorkspaceSignal): void {
    this.signals.push(signal);
    void this.drain();
  }
  private drain(): Promise<void> {
    this.draining ??= (async () => {
      try {
        while (this.signals.length) await this.applySignals(this.signals.splice(0));
      } catch (error) {
        await this.failure(error);
      } finally {
        this.draining = undefined;
      }
    })();
    return this.draining;
  }
  /**
   * 处理一批失效通知：已反映的修订号忽略；与当前修订号连续时只重读变化的部分——团队页（成员、策略、数据模式、任务、PR、共享头
   * 有变化时）或只读工作区行、点到的 PR 详情（标为过期，显示中的随即重读）、本人通知（被点名时）；修订号跳号说明漏了通知，整页重读。
   */
  private async applySignals(batch: WorkspaceSignal[]): Promise<void> {
    const data = this.snapshot;
    const workspace = this.workspace;
    const user = this.user;
    if (!data || !workspace || !user || !navigator.onLine) return;
    const fresh = batch.filter(signal => signal.revision > data.revision).sort((a, b) => a.revision - b.revision);
    if (!fresh.length) return;
    if (!fresh.every((signal, index) => signal.revision === data.revision + 1 + index)) {
      await this.refresh();
      return;
    }
    const kinds = new Set(fresh.flatMap(signal => signal.kinds));
    const revision = fresh[fresh.length - 1].revision;
    const epoch = this.generation;
    if (detailKinds.some(kind => kinds.has(kind))) this.details.invalidate();
    else this.details.invalidate(fresh.flatMap(signal => signal.prIds));
    const noticed = fresh.some(signal => signal.noticeUserIds.includes(user.id));
    const teamChanged = teamKinds.some(kind => kinds.has(kind));
    const [team, version, notices] = await this.current(
      Promise.all([
        teamChanged ? this.loadTeamRequest(workspace, epoch) : undefined,
        teamChanged ? undefined : this.reader.version(workspace),
        !teamChanged && noticed ? this.reader.notices(workspace, this.windows.notices) : undefined
      ]),
      epoch
    );
    const now = this.snapshot;
    if (!now || epoch !== this.generation || now.revision >= revision) return;
    if (team) this.adopt({ ...team, revision });
    else
      this.adopt({
        ...now,
        revision,
        auditCount: version!.auditCount,
        ...(notices && {
          notifications: notices.notices,
          unread: notices.unread,
          earlier: { ...now.earlier, notices: notices.earlier }
        })
      });
    this.assertDraftAccess();
    this.changed();
  }
  /** 撤权事件：自己被撤权立即锁定（停止接收频道消息、锁定团队上下文）；他人被撤权立即从在线列表移除。 */
  private onRevoked(signal: RevocationSignal): void {
    if (this.user && signal.userIds.includes(this.user.id)) {
      void this.failure(new CollaborationError('forbidden', '你已不是这个团队的成员，团队草稿已锁定'));
      return;
    }
    for (const id of signal.userIds) this.revokedUsers.add(id);
    if (this.snapshot) this.snapshot = { ...this.snapshot, presence: this.visibleSessions(this.snapshot) };
    this.changed();
  }
  /**
   * 频道上 Presence 的最新全集：按当前成员过滤后显示。可见的在线列表没变（重复同步、非成员会话进出）时不重绘，
   * 免得别人的连接抖动打断本页面的输入。
   */
  private onPresence(sessions: Presence[]): void {
    this.sessions = sessions;
    if (!this.snapshot) return;
    const presence = this.visibleSessions(this.snapshot);
    if (presenceKey(presence) === presenceKey(this.snapshot.presence)) return;
    this.snapshot = { ...this.snapshot, presence };
    this.changed();
  }
  /**
   * 频道状态：订阅成功（首次或断线重连后）时按修订号补齐；从已订阅变为失败、超时或被服务端关闭时提示并补齐一次——
   * 被撤权的成员此时读不到工作区行，随即锁定。频道反复重试时不重复读取。
   */
  private onFeedStatus(status: FeedStatus): void {
    const recovered = status === 'SUBSCRIBED';
    const lost = !recovered && this.live;
    this.live = recovered;
    if (recovered && this.message === realtimeUnavailable) this.notify('');
    if (!recovered) this.notify(realtimeUnavailable, 'warning');
    if (recovered || lost) void this.catchUp().catch(error => this.failure(error));
    this.changed();
  }
  /** 按修订号补齐：工作区行的修订号比手里的新，说明有没收到的通知，整页重读。 */
  private async catchUp(): Promise<void> {
    const workspace = this.workspace;
    const data = this.snapshot;
    if (!workspace || !data || !navigator.onLine) return;
    const { revision } = await this.current(this.reader.version(workspace), this.generation);
    if (revision > data.revision) await this.refresh();
  }
  /** 丢弃全部已加载内容并使进行中的加载失效，用于切换团队、离线任务、锁定与释放。 */
  private resetContents(): void {
    this.commits.reset();
    this.candidates.reset();
    this.shared.reset();
    this.schemas.reset();
    this.threads.reset();
    this.details.reset();
    this.recentAudit.reset();
    this.history.reset();
    this.timeline.reset();
  }
  /** 推导内容时所依据的共享分支：团队页里的头与根；还没有团队页时不能推导（离线打开任务不读服务端内容）。 */
  private sharedBranch(): SharedBranch {
    demand(this.snapshot, 'stale', '版本已变化，请刷新后重试');
    return { head: this.snapshot.head, root: this.snapshot.root };
  }
  /**
   * 分支历史的头：共享分支取摘要的 `head`，还没有任何合并（头就是根）时为 null；PR 取其来源任务的头，
   * 任务在起点之后还没有提交（头就是起点）时为 null。还没有摘要、或 PR 与任务不在摘要里时为 undefined。
   */
  private historyHead(branch: HistoryBranch): string | null | undefined {
    const range = this.historyRange(branch);
    if (!range) return undefined;
    return range.head === range.until ? null : range.head;
  }
  /** 分支历史的范围：共享分支从共享头走到根（根不列出），PR 从来源任务的头走到它的共同起点（不含）。 */
  private historyRange(branch: HistoryBranch): { head: string; until: string } | undefined {
    const data = this.snapshot;
    if (!data) return undefined;
    if (!('prId' in branch)) return { head: data.head, until: data.root };
    const pr = data.prs.find(item => item.id === branch.prId);
    const task = pr && data.tasks.find(item => item.id === pr.taskId);
    return task ? { head: task.head, until: task.base } : undefined;
  }
  /** 重放上次未确认的请求；`confirmed` 表示用户已核对并确认重发，不再检查自动重试期限。 */
  private async replayPending(confirmed: boolean): Promise<void> {
    // 重放会切到请求所属的团队（关闭打开着的任务）：编辑界面里有未保存的输入时先拦下，不能接受邀请之后才发现切不过去
    this.assertSaved();
    const pending = this.pending();
    demand(pending && this.user, 'missing', '没有待确认请求');
    if (pending.command.type === 'accept_invite') {
      await this.executeCommand(pending.command, pending.command.operationId, pending.workspace, confirmed);
      this.workspaces = await this.current(this.reader.workspaces());
      await this.selectWorkspace(pending.workspace);
      return;
    }
    await this.selectWorkspace(pending.workspace);
    await this.enqueue(pending.command, pending.command.operationId, confirmed);
    if (pending.command.type === 'fork') await this.openTask(pending.command.id);
  }
  /** 变更类命令进入串行队列，read_notice、subscribe 直接执行；`confirmed` 的含义同 executeCommand。 */
  private enqueue(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string,
    confirmed: boolean
  ): Promise<Record<string, unknown>> {
    if (lightweight.includes(String(command.type))) return this.executeCommand(command, operationId);
    const epoch = this.generation;
    const previous = this.mutations?.epoch === epoch ? this.mutations.settled : Promise.resolve();
    const queued = structuredClone(command);
    const next = previous.then(() => {
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      return this.executeCommand(queued, operationId, undefined, confirmed);
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
  private activeWorkspace(): WorkspaceEntry {
    demand(this.workspace, 'missing', '先选择团队');
    return this.workspace;
  }
  /** 读取一个 PR 的详情：以团队页里的 PR、成员与策略推导审批进度；PR 已不在团队页里时按版本已变化处理。 */
  private async fetchDetail(prId: string): Promise<PullRequestDetail> {
    const data = this.snapshot;
    const pr = data?.prs.find(item => item.id === prId);
    demand(data && pr, 'stale', '版本已变化，请刷新后重试');
    return this.reader.prDetail(this.activeWorkspace(), pr, data);
  }
  /**
   * 读取分支历史的一页。第一页必须从摘要里的头开始：读摘要之后分支又前进了，读到的就不是缓存键（摘要的头）的历史，
   * 按「版本已变化」处理，不显示也不提示，等下一次刷新换到新头后再读。
   */
  private async fetchHistory(branch: HistoryBranch, before: string | undefined): Promise<CommitPage> {
    const head = this.historyHead(branch);
    const range = this.historyRange(branch);
    demand(range, 'stale', '版本已变化，请刷新后重试');
    const page = await this.reader.history(this.activeWorkspace(), range, before === undefined ? {} : { before });
    demand(before !== undefined || page.commits[0]?.id === head, 'stale', '版本已变化，请刷新后重试');
    return page;
  }
  /** 读取共享记录；服务端的共享头已不是摘要的头时按「版本已变化」处理，等下一次刷新后再读。 */
  private fetchShared(head: string): Promise<SharedRecords> {
    return this.reader.records(this.activeWorkspace(), head);
  }
  /** 读取讨论线程的全部处理事件：逐页向前读到头，再翻成时间正序。 */
  private async fetchThreadEvents(threadId: string): Promise<Audit[]> {
    const workspace = this.activeWorkspace();
    const limit = auditPageSize.maximum;
    let page = await this.reader.audit(workspace, { threadId, limit });
    const newestFirst = [...page.events];
    while (page.nextBefore) {
      page = await this.reader.audit(workspace, { threadId, limit, before: page.nextBefore });
      newestFirst.push(...page.events);
    }
    return newestFirst.reverse();
  }
  /** 后台加载内容失败：版本已变化会随下一次刷新自动恢复，不提示；其余按统一的失败路径处理。 */
  private contentFailed(error: unknown): void {
    if (error instanceof CollaborationError && error.code === 'stale') return;
    void this.failure(error);
  }
  /**
   * 执行一条命令：变更类命令先把原请求与首次发出时间记进 sessionStorage，查回执，已接受就用回执结果，否则发送。
   * 回执查不到、且这个请求已超过自动重试期限时，服务端可能已清理回执，重发可能让它生效两次（例如重复评论），
   * 所以不再自动发送，保留记录并抛出 `expired`，由用户核对后选择重新发送（`confirmed` 为 true）或放弃。
   */
  private async executeCommand(
    command: Omit<Command, 'operationId'> | Record<string, unknown>,
    operationId: string,
    workspaceOverride?: WorkspaceEntry,
    confirmed = false
  ): Promise<Record<string, unknown>> {
    demand((workspaceOverride ?? this.workspace) && this.user, 'locked', '先登录并选择团队');
    const workspace = workspaceOverride ?? this.workspace!;
    const epoch = this.generation;
    const request = { ...command, operationId } as Command;
    const durable = !lightweight.includes(request.type);
    // 回执只对成员可读；接受邀请时用户还不是成员，只能直接重发，由服务端按 operationId 幂等返回原结果
    const readsReceipt = durable && request.type !== 'accept_invite';
    const key = `admin-collaboration-pending:${this.user.id}`;
    const previous = this.pending();
    demand(
      !durable || !previous || previous.command.operationId === operationId,
      'pending',
      '先确认或重试上次请求，再执行新的云端变更'
    );
    // 重试同一请求时沿用首次发出的时间，自动重试期限从第一次发出算起
    const createdAt = previous?.command.operationId === operationId ? previous.createdAt : Date.now();
    if (durable) sessionStorage.setItem(key, JSON.stringify({ workspace, command: request, createdAt }));
    let acknowledged = false;
    try {
      const receipt = readsReceipt ? await this.reader.receipt(workspace, operationId) : { status: 'unknown' };
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      let result: Record<string, unknown>;
      if (receipt.status === 'accepted' && 'value' in receipt) {
        acknowledged = true;
        result = receipt.value!;
      } else {
        demand(
          confirmed || !retryWindowPassed(createdAt),
          'expired',
          '上次请求已超过回执保留期，无法确认是否已生效，请核对团队状态后重新发送或放弃'
        );
        result = await this.api.command(workspace, request);
        acknowledged = true;
      }
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      if (request.type !== 'accept_invite') await this.current(this.refresh(), epoch);
      if (request.type === 'fork') await this.current(this.archiveFork(request), epoch);
      if (durable) sessionStorage.removeItem(key);
      return result;
    } catch (error) {
      demand(epoch === this.generation, 'cancelled', '上下文已切换');
      // 结果不确定、已取消、服务暂不可用或因超过自动重试期限而没有发送的请求保留记录，留给用户确认
      if (
        durable &&
        error instanceof CollaborationError &&
        !['internal', 'uncertain', 'cancelled', 'expired', 'unavailable'].includes(error.code) &&
        !acknowledged
      )
        sessionStorage.removeItem(key);
      throw error;
    }
  }
  /** 全局会话的身份确认或变化了：跟随它（串行，后到的等前一个落定）。 */
  private readonly identityChanged = () => {
    void this.follow().catch(error => this.failure(error));
  };
  /**
   * 跟随全局会话的身份：没有身份即锁定（离线时说明要先联网验证）；换了账号先锁定原账号的本机上下文；
   * 离线时按缓存授权恢复可解锁的本机任务，在线时登记本机任务账本并读取可访问的团队。
   */
  private follow(): Promise<void> {
    const next = this.identity.then(() => this.adoptIdentity());
    this.identity = next.catch(() => undefined);
    return next;
  }
  private async adoptIdentity(): Promise<void> {
    if (this.disposed) return;
    const identity = this.session.user;
    if (!identity) {
      if (this.user || this.workspace || this.offlineDrafts.length) await this.lock();
      demand(this.session.online, 'locked', '请联网验证身份后再使用团队草稿');
      return;
    }
    if (this.user && this.user.id !== identity.id) await this.lock();
    const epoch = ++this.authGeneration;
    if (!this.session.online) {
      const drafts = await this.current(
        this.tasks.coldRestore(identity.id, this.session.expiresAt, Date.now()),
        this.generation,
        epoch
      );
      this.offlineDrafts = drafts;
      this.user = identity;
      this.online = false;
      this.changed();
      return;
    }
    this.user = identity;
    await this.tasks.login(identity.id);
    if (epoch !== this.authGeneration) return;
    const workspaces = await this.current(this.reader.workspaces(), this.generation, epoch);
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
  /**
   * 服务端接受了另存分叉（含按原幂等键重放的那一次）之后在本机落地：新任务从原任务分支的头另起分支，原任务记下被带走的头。
   * 本机账本里没有原任务时没有可带走的本机提交，什么都不做，新任务打开时按服务端的提交导入。
   */
  private async archiveFork(command: Extract<Command, { type: 'fork' }>): Promise<void> {
    demand(this.user && this.workspace && this.snapshot, 'locked', '先选择团队');
    const task = this.snapshot.tasks.find(value => value.id === command.taskId);
    const member = this.snapshot.members.find(value => value.id === this.user?.id);
    demand(task?.ownerId === this.user.id && member?.permissions.includes('edit'), 'forbidden', '没有此任务编辑权限');
    const head = command.commits.at(-1)?.commitId;
    demand(head, 'invalid', '分叉回执缺少版本');
    const context = {
      userId: this.user.id,
      teamId: this.workspace.teamId,
      appId: this.workspace.appId,
      taskId: task.id
    };
    if (!this.tasks.ledger.read(context)) return;
    // 刷新页面之后重放时，原任务还没在本会话解锁、团队库也可能没打开：先按联网验证打开它（切到它的分支），再落地新任务
    await this.current(this.tasks.prepare(context, task, this.download(this.workspace)));
    await this.current(this.tasks.adoptFork(context, { id: command.id, name: command.name }, head));
  }
  private async upload(confirmExpired: boolean): Promise<void> {
    demand(this.task && this.workspace, 'missing', '先打开任务');
    const context = this.task.context;
    const workspace = this.workspace;
    const epoch = this.tasks.epoch;
    const viewEpoch = this.generation;
    await this.current(this.tasks.commit(context, this.task.name), viewEpoch);
    this.task = await this.current(this.tasks.view(context), viewEpoch);
    this.changed();
    if (!navigator.onLine) {
      this.notify('已形成提交，联网验证后可同步', 'info');
      this.changed();
      return;
    }
    await this.current(this.refresh(), viewEpoch);
    for (;;) {
      this.tasks.assert(context, epoch);
      const next = await this.current(this.tasks.nextUpload(context), viewEpoch);
      if (!next) break;
      const receipt = await this.reader.receipt(workspace, next.upload.operationId);
      demand(viewEpoch === this.generation, 'cancelled', '上下文已切换');
      const result =
        receipt.status === 'accepted' ?
          receipt.value!
        : await this.sendUpload(workspace, context, next, confirmExpired);
      demand(viewEpoch === this.generation, 'cancelled', '上下文已切换');
      demand(typeof result['head'] === 'string', 'invalid', '同步回执缺少版本');
      this.task = await this.current(
        this.tasks.acknowledge(context, next.upload.operationId, result['head'], epoch),
        viewEpoch
      );
      this.changed();
    }
    await this.current(this.refresh(), viewEpoch);
    this.notify('当前提交已同步；后续编辑仍需另行同步', 'success');
    this.changed();
  }
  /**
   * 发送待确认的上传（回执已查不到）。未超过自动重试期限、或用户已确认时，按原幂等键与同一批提交发送。
   * 已超过期限且未确认时不再自动发送：刚刷新的摘要里任务头已是这次上传的最后一个提交，说明它早已被接受
   * （提交按 ID 去重，不会重复建提交），直接按已接受处理；否则抛出 `expired` 交给用户确认。
   */
  private async sendUpload(
    workspace: WorkspaceEntry,
    context: Context,
    next: { upload: PendingUpload; commits: Commit[] },
    confirmed: boolean
  ): Promise<Record<string, unknown>> {
    const { upload, commits } = next;
    if (confirmed || !retryWindowPassed(upload.createdAt))
      return this.api.command(workspace, uploadCommand(context.taskId, upload, commits));
    const remote = this.snapshot?.tasks.find(task => task.id === context.taskId)?.head;
    demand(remote === upload.head, 'expired', '待上传提交已超过回执保留期，请核对远端版本后确认同步');
    return { taskId: context.taskId, head: upload.head };
  }
  /** 下发接口绑定到一个团队：读这个团队的共享分支或某个任务分支。 */
  private download(workspace: WorkspaceEntry): ExchangeDownload {
    return (branch, known) => this.reader.exchange(workspace, branch, known);
  }
  /** 编辑界面里还有未保存的输入时拒绝（见 {@link CollaborationController.unsavedInput}）。 */
  private assertSaved(): void {
    this.ensureSaved();
  }
  /** 显示打开着的任务，并订阅团队库的本地写入：实体列表每次保存之后重读任务状态（工作树没有变更流）。 */
  private showTask(view: TaskView): void {
    this.closeTask();
    this.task = view;
    this.unwatch = this.tasks.database?.onWrite(() => {
      this.taskRefresh ??= Promise.resolve().then(async () => {
        this.taskRefresh = undefined;
        await this.refreshTask().catch(error => this.failure(error));
      });
    });
    this.changed();
  }
  /** 不再显示打开着的任务：取消写入订阅。调用方随后派发 `change`，界面据此先卸载编辑界面。 */
  private closeTask(): void {
    this.unwatch?.();
    this.unwatch = undefined;
    this.task = null;
  }
}
