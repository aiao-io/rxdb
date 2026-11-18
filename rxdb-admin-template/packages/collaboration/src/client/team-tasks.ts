import type { CommitImportResult, WorkingTreeRestoreResult } from '@aiao/rxdb-plugin-working-tree';
import { serializeCommitExchangeRecord, type CommitExchangeRecord } from '@aiao/rxdb-plugin-working-tree/exchange';
import { commitBatchLimit, parseCommits, requestBodyLimit } from '../commit.js';
import { CollaborationError, demand, type Commit, type CommitExchangePage, type Records } from '../model.js';
import type { ExchangeBranch } from '../reader.js';
import {
  contextKey,
  type Context,
  type PendingUpload,
  type TaskEntry,
  type TaskLedger
} from './task-ledger.js';
import type { TeamDatabase, TeamScope, TreeLogEntry, TreeStatus } from './team-database.js';

/** 打开团队库的函数：生产里是 `scope => openTeamDatabase(应用的工厂, scope)`，单测里交出内存桩。 */
export type TeamOpener = (scope: TeamScope) => Promise<TeamDatabase>;
/** 读一页下发记录：`known` 是本机已有的提交（连同祖先都不再下发），即 `CollaborationReader.exchange()` 绑定当前团队之后的样子。 */
export type ExchangeDownload = (
  branch: ExchangeBranch,
  known: readonly string[]
) => Promise<CommitExchangePage<CommitExchangeRecord>>;
/** 服务端任务行里打开任务要用的部分：ID、名称、共同起点与远端头。 */
export interface RemoteTask {
  readonly id: string;
  readonly name: string;
  readonly base: string;
  readonly head: string;
}
/** 任务分支上共同起点之后的一个本机提交（新到旧列出）：是否已被服务端确认取决于它是否不晚于远端头。 */
export interface LocalCommit {
  readonly id: string;
  readonly parentId: string;
  readonly authorId: string | null;
  readonly message: string;
  readonly synced: boolean;
}
/**
 * 打开着的任务在界面上的状态（ADMIN-US-205 AC#3～5 的后三种；「未保存」是表单状态，在应用的编辑界面里）：
 * `saved` 是已保存未提交的工作树条目数，`unpushed` 是已提交未同步的提交数，两者都为 0 且没有待确认上传即已同步。
 */
export interface TaskView {
  readonly context: Context;
  readonly name: string;
  readonly base: string;
  readonly branchId: string;
  /** 服务端最近确认的任务头。 */
  readonly remoteHead: string;
  /** 本机任务分支的头。 */
  readonly localHead: string;
  /** 已保存未提交的工作树条目数（`status().entryCount`）。 */
  readonly saved: number;
  /** 工作树来自一次未结束的历史恢复。 */
  readonly restoring: boolean;
  /** 共同起点之后的本机提交，新到旧。 */
  readonly commits: readonly LocalCommit[];
  /** 远端头之后、尚未被服务端确认的本机提交数。 */
  readonly unpushed: number;
  /** 正在确认中的上传（至多一条）。 */
  readonly uploads: readonly PendingUpload[];
  /** 另存为新任务时带走的本机头；原任务之后可以跟随远端。 */
  readonly forkArchive?: { readonly taskId: string; readonly head: string };
}
/** 共享分支在团队库里的镜像分支：只经导入推进，用户不在这里编辑。 */
export const sharedBranchId = 'main';
/** 一次请求里提交之外的部分（命令类型、任务 ID、幂等键、期望头）预留的字节数。 */
const envelopeBytes = 4096;
const utf8 = new TextEncoder();

/**
 * 团队任务在团队库（平台 working-tree）上的全部本机动作：镜像共享分支、按任务建分支并导入远端提交、形成提交、
 * 交出待上传的交换记录、放弃、恢复、另存与快进。记录、工作树与提交都在团队库里，账本只记同步与解锁需要的元数据。
 *
 * @remarks
 * - 同一时刻只开一个团队库（当前用户 × 团队 × 应用），换作用域时先关旧库；
 * - 所有动作串行执行：切分支、导入与提交都依赖「当前分支」，交错执行会把别的任务的数据写进这个任务；
 * - 解锁按会话：联网验证打开（{@link TeamTasks.prepare}）或离线冷启动（{@link TeamTasks.coldRestore}）之后，任务才可操作；
 *   退出账号锁定账本里该用户的全部任务并关库，迟到的结果按纪元丢弃。
 */
export class TeamTasks {
  private userId: string | null = null;
  private readonly unlocked = new Set<string>();
  private generation = 0;
  private current?: TeamDatabase;
  private queue: Promise<unknown> = Promise.resolve();
  /** 会话纪元：登录、退出与释放都会推进它，迟到的结果据此丢弃。 */
  get epoch() {
    return this.generation;
  }
  /** 当前打开的团队库；没有时为 undefined。 */
  get database(): TeamDatabase | undefined {
    return this.current;
  }
  /**
   * @param ledger 本机任务账本。
   * @param open 打开团队库。
   */
  constructor(
    readonly ledger: TaskLedger,
    private readonly open: TeamOpener
  ) {}
  /** 以某个用户登录；换用户时先按退出处理（锁定原用户的任务、关库）。 */
  async login(userId: string): Promise<void> {
    if (this.userId && this.userId !== userId) await this.logout();
    this.userId = userId;
  }
  /** 退出：锁定该用户账本里的全部任务，清空解锁状态并关闭团队库；团队库里的数据保留。 */
  async logout(): Promise<void> {
    const userId = this.userId;
    this.userId = null;
    this.unlocked.clear();
    this.generation++;
    if (userId) this.ledger.lock(userId);
    await this.detach();
  }
  /** 释放：之后不再响应任何结果，团队库在后台关闭。 */
  dispose(): void {
    this.userId = null;
    this.unlocked.clear();
    this.generation++;
    void this.detach();
  }
  /**
   * 离线冷启动：缓存授权未过期时，交出该用户联网验证过、未锁定的任务并解锁它们；过期即拒绝。
   * @param expiresAt 缓存授权的到期时刻（毫秒）。
   */
  async coldRestore(userId: string, expiresAt: number, now: number): Promise<TaskEntry[]> {
    await this.login(userId);
    demand(expiresAt > now, 'locked', '会话已过期，请联网登录');
    const entries = this.ledger.list(userId).filter(entry => !entry.locked && entry.verifiedAt > 0);
    entries.forEach(entry => this.unlocked.add(contextKey(entry.context)));
    return entries;
  }
  /** 任务必须属于当前用户、已在本会话解锁，且纪元未变，否则按已锁定拒绝。 */
  assert(context: Context, epoch = this.generation): void {
    demand(
      this.userId === context.userId && this.unlocked.has(contextKey(context)) && epoch === this.generation,
      'locked',
      '团队草稿已锁定，请重新验证身份与权限'
    );
  }
  /** 关闭当前团队库（切换团队、退出或锁定时）。 */
  detach(): Promise<void> {
    return this.exclusive(async () => {
      const database = this.current;
      this.current = undefined;
      await database?.close();
    });
  }
  /**
   * 联网验证之后打开任务：本机没有这个任务的分支时，先镜像共享分支、从任务的共同起点建分支并切过去，再导入任务在服务端已有的提交
   * （提交 ID、父链、作者与服务端一致，ADMIN-US-206 AC#2）；已有分支时只切过去，内容原样保留（远端有新版本时由用户拉取）。
   * 之后解锁任务、记下验证时间。
   */
  prepare(context: Context, task: RemoteTask, download: ExchangeDownload): Promise<TaskView> {
    demand(context.userId === this.userId, 'locked', '账号不匹配');
    const epoch = this.generation;
    return this.exclusive(async () => {
      const database = await this.attach(scopeOf(context));
      const existing = this.ledger.read(context);
      const entry = existing ?? (await this.createTaskBranch(database, context, task, download));
      if (existing) await database.switchBranch(existing.branchId);
      demand(epoch === this.generation && context.userId === this.userId, 'cancelled', '上下文已切换');
      this.ledger.write(context, () => ({ ...entry, locked: false, verifiedAt: Date.now() }));
      this.unlocked.add(contextKey(context));
      return this.read(database, context);
    });
  }
  /** 离线打开一个已解锁的任务：切到它的分支。 */
  resume(context: Context): Promise<TaskView> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = await this.attach(scopeOf(context));
      await database.switchBranch(this.entryOf(context).branchId);
      return this.read(database, context);
    });
  }
  /** 重读任务状态。 */
  view(context: Context): Promise<TaskView> {
    this.assert(context);
    return this.exclusive(async () => this.read(this.databaseOf(context), context));
  }
  /**
   * 把工作树的全部已保存改动形成一个普通提交（作者是当前用户，消息是任务名）；工作树干净时什么都不做。
   * 期间若有别的写入让捕获位对不上，重读后重试，仍对不上就按草稿已被修改拒绝。
   * @returns 新提交的 ID；没有改动时为 undefined。
   */
  commit(context: Context, message: string): Promise<string | undefined> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      for (let attempt = 0; attempt < 3; attempt++) {
        const status = await this.branchStatus(database, context);
        if (status.entryCount === 0) return undefined;
        const result = await database.tree.commit(message, {
          ...credentials(status),
          authorId: context.userId,
          operationId: crypto.randomUUID()
        });
        if (result.ok) return result.commitId;
      }
      throw new CollaborationError('stale', '其他页面已修改草稿，请保留输入后重新打开');
    });
  }
  /**
   * 下一次要上传的提交（平台交换记录的 JSON 形态）：有待确认的上传时原样交回它的幂等键与同一批提交；否则取远端头之后的本机提交，
   * 最多 {@link commitBatchLimit} 个、请求不超过 {@link requestBodyLimit}，记成新的待确认上传。没有要上传的提交时为 undefined。
   */
  nextUpload(context: Context): Promise<{ upload: PendingUpload; commits: Commit[] } | undefined> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      const entry = this.entryOf(context);
      const [pending] = entry.uploads;
      if (pending) return { upload: pending, commits: await this.between(database, pending) };
      const { commits } = await database.tree.exportCommits({ afterCommitId: entry.remoteHead });
      if (!commits.length) return undefined;
      const chunk = uploadChunk(commits);
      const upload: PendingUpload = {
        operationId: crypto.randomUUID(),
        expectedHead: entry.remoteHead,
        head: chunk[chunk.length - 1].commitId,
        createdAt: Date.now()
      };
      this.ledger.write(context, current => ({ ...current!, uploads: [upload] }));
      return { upload, commits: parseCommits(chunk.map(serializeCommitExchangeRecord)) };
    });
  }
  /** 服务端确认了一次上传：远端头前进到这次上传的最后一个提交，待确认上传出队。 */
  acknowledge(context: Context, operationId: string, head: string, epoch: number): Promise<TaskView> {
    this.assert(context, epoch);
    return this.exclusive(async () => {
      this.assert(context, epoch);
      this.ledger.write(context, current => {
        const pending = current?.uploads[0];
        demand(current && pending?.operationId === operationId, 'stale', '同步队列已变化');
        demand(pending.head === head, 'invalid', '服务端回执与提交不一致');
        return { ...current, remoteHead: head, uploads: [] };
      });
      return this.read(this.databaseOf(context), context);
    });
  }
  /**
   * 把本机任务快进到服务端的任务头：工作树必须干净、没有未确认或未同步的本机提交，除非这些提交已另存为新任务——
   * 那时从远端头另起一条分支再导入（working-tree 不改写历史，原分支留作新任务的来源）。
   */
  fastForward(context: Context, download: ExchangeDownload): Promise<TaskView> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      const entry = this.entryOf(context);
      const status = await this.branchStatus(database, context);
      const head = await headOf(database);
      const archived = entry.forkArchive?.head === head;
      demand(
        status.entryCount === 0 &&
          !status.restoring &&
          (archived || (head === entry.remoteHead && !entry.uploads.length)),
        'dirty',
        '本机有修改，请先保留或另存为新任务'
      );
      let branchId = entry.branchId;
      if (head !== entry.remoteHead) {
        branchId = taskBranchId(context.taskId);
        await this.branchAt(database, branchId, entry.remoteHead);
        await database.switchBranch(branchId);
      }
      const remoteHead = await pull(database, download, { taskId: context.taskId }, entry.remoteHead);
      this.ledger.write(context, current => ({
        ...current!,
        branchId,
        remoteHead,
        uploads: archived ? [] : current!.uploads,
        forkArchive: undefined
      }));
      return this.read(database, context);
    });
  }
  /**
   * 另存为新任务要发出的提交：远端头之后的本机提交（父先于子，最多一批），作为服务端 `fork` 命令的 `commits`，
   * `expectedHead` 是远端头（分叉起点）。没有本机提交时拒绝。
   */
  forkPlan(context: Context): Promise<{ expectedHead: string; commits: Commit[] }> {
    this.assert(context);
    return this.exclusive(async () => {
      const entry = this.entryOf(context);
      const { commits } = await this.databaseOf(context).tree.exportCommits({ afterCommitId: entry.remoteHead });
      demand(commits.length, 'empty', '没有本机分叉提交');
      return { expectedHead: entry.remoteHead, commits: parseCommits(uploadChunk(commits).map(serializeCommitExchangeRecord)) };
    });
  }
  /**
   * 服务端接受了另存分叉之后在本机落地：从原任务分支的头另起新任务的分支（带着全部本机提交），新任务的远端头是分叉命令最后一个提交；
   * 原任务记下被带走的头，之后可以跟随远端。新任务已在账本里时什么都不做（重放同一个分叉命令）。
   * @param forkHead 分叉命令交给服务端的最后一个提交。
   */
  adoptFork(original: Context, fork: { readonly id: string; readonly name: string }, forkHead: string): Promise<void> {
    this.assert(original);
    return this.exclusive(async () => {
      const forked = { ...original, taskId: fork.id };
      if (this.ledger.read(forked)) return;
      const database = this.databaseOf(original);
      const entry = this.entryOf(original);
      await database.switchBranch(entry.branchId);
      const head = await headOf(database);
      const branchId = taskBranchId(fork.id);
      await this.branchAt(database, branchId, head);
      this.ledger.write(forked, () => ({
        context: forked,
        name: fork.name,
        base: entry.base,
        branchId,
        remoteHead: forkHead,
        uploads: [],
        locked: false,
        verifiedAt: Date.now()
      }));
      this.ledger.write(original, current => ({ ...current!, forkArchive: { taskId: fork.id, head } }));
      this.unlocked.add(contextKey(forked));
    });
  }
  /**
   * 放弃草稿：工作树整体退回任务头，业务表逐行一起退回（US-317），列表与表单随即读到任务头的数据。
   * @returns 丢掉的条目数。
   */
  discard(context: Context): Promise<number> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      const status = await this.branchStatus(database, context);
      const result = await database.tree.discard(credentials(status));
      demand(result.ok, 'stale', '其他页面已修改草稿，请保留输入后重新打开');
      return result.discardedCount;
    });
  }
  /** 把业务表恢复成一个历史提交的数据，差异成为新的未提交改动；HEAD 不动、历史不删（US-317）。被拒成因原样交回。 */
  restore(context: Context, commitId: string): Promise<WorkingTreeRestoreResult> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      const status = await this.branchStatus(database, context);
      return database.tree.restore({ commitId }, credentials(status));
    });
  }
  /** 把一批记录作为普通编辑写进任务分支（匿名数据导入）：经捕获进入工作树，不提交、不上传。`order` 是实体的写入顺序。 */
  write(context: Context, records: Records, order: readonly string[]): Promise<void> {
    this.assert(context);
    return this.exclusive(async () => {
      const database = this.databaseOf(context);
      await this.branchStatus(database, context);
      await database.writeRecords(records, order);
    });
  }
  /** 打开（或沿用）这个作用域的团队库；换作用域时先关旧库。只在排他段里调用。 */
  private async attach(scope: TeamScope): Promise<TeamDatabase> {
    demand(scope.userId === this.userId, 'locked', '账号不匹配');
    if (this.current && sameScope(this.current.scope, scope)) return this.current;
    const previous = this.current;
    this.current = undefined;
    await previous?.close();
    const epoch = this.generation;
    const database = await this.open(scope);
    if (epoch !== this.generation) {
      await database.close();
      throw new CollaborationError('cancelled', '上下文已切换');
    }
    this.current = database;
    return database;
  }
  /** 新设备（或第一次）打开任务：镜像共享分支、从共同起点建分支、切过去并导入任务的已有提交。 */
  private async createTaskBranch(
    database: TeamDatabase,
    context: Context,
    task: RemoteTask,
    download: ExchangeDownload
  ): Promise<TaskEntry> {
    await database.switchBranch(sharedBranchId);
    await pull(database, download, { branch: 'shared' }, await headOf(database));
    const branchId = taskBranchId(task.id);
    await this.branchAt(database, branchId, task.base);
    await database.switchBranch(branchId);
    const remoteHead = await pull(database, download, { taskId: task.id }, task.base);
    return {
      context,
      name: task.name,
      base: task.base,
      branchId,
      remoteHead,
      uploads: [],
      locked: false,
      verifiedAt: 0
    };
  }
  /** 在当前分支历史里的 `commitId` 处建分支；平台拒绝（不可达、没有分叉点、历史被改写）时报错并带上成因。 */
  private async branchAt(database: TeamDatabase, branchId: string, commitId: string): Promise<void> {
    const created = await database.tree.createBranchFromCommit(branchId, commitId);
    if (!created.ok)
      throw new CollaborationError('internal', '无法在本机建立任务分支', { reason: created.reason, commitId });
  }
  /** 待确认上传的那一批提交：`expectedHead` 之后到 `head` 为止（任务分支是线性的，由提交图唯一确定）。 */
  private async between(database: TeamDatabase, upload: PendingUpload): Promise<Commit[]> {
    const { commits } = await database.tree.exportCommits({ afterCommitId: upload.expectedHead });
    const end = commits.findIndex(commit => commit.commitId === upload.head);
    demand(end >= 0, 'stale', '同步队列已变化');
    return parseCommits(commits.slice(0, end + 1).map(serializeCommitExchangeRecord));
  }
  /** 当前分支的工作树摘要；当前分支不是任务的分支（另一个标签页切走了）时拒绝，免得改到别的任务。 */
  private async branchStatus(database: TeamDatabase, context: Context): Promise<TreeStatus> {
    const status = await database.tree.status();
    demand(status.branchId === this.entryOf(context).branchId, 'stale', '其他页面已修改草稿，请保留输入后重新打开');
    return status;
  }
  /** 读出任务状态：工作树摘要、共同起点之后的本机提交与账本里的同步元数据。 */
  private async read(database: TeamDatabase, context: Context): Promise<TaskView> {
    const entry = this.entryOf(context);
    const status = await this.branchStatus(database, context);
    const { entries } = await database.tree.listCommits();
    const own = ownCommits(entries, entry.base);
    const synced = own.findIndex(commit => commit.commitId === entry.remoteHead);
    const unpushed = synced < 0 ? own.length : synced;
    return {
      context: entry.context,
      name: entry.name,
      base: entry.base,
      branchId: entry.branchId,
      remoteHead: entry.remoteHead,
      localHead: own[0]?.commitId ?? entry.base,
      saved: status.entryCount,
      restoring: status.restoring,
      commits: own.map((commit, index) => ({
        id: commit.commitId,
        parentId: commit.parentIds[0],
        authorId: commit.authorId,
        message: commit.message,
        synced: index >= unpushed
      })),
      unpushed,
      uploads: entry.uploads,
      ...(entry.forkArchive && { forkArchive: entry.forkArchive })
    };
  }
  private entryOf(context: Context): TaskEntry {
    const entry = this.ledger.read(context);
    demand(entry, 'missing', '任务不存在');
    return entry;
  }
  /** 当前团队库，且它正是任务所在的作用域。 */
  private databaseOf(context: Context): TeamDatabase {
    const database = this.current;
    demand(database && sameScope(database.scope, scopeOf(context)), 'locked', '团队草稿已锁定，请重新验证身份与权限');
    return database;
  }
  /** 串行执行：前一个动作结束（成功或失败）之后才开始下一个。 */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

/** 任务所在的作用域。 */
const scopeOf = (context: Context): TeamScope => ({
  userId: context.userId,
  teamId: context.teamId,
  appId: context.appId
});
const sameScope = (a: TeamScope, b: TeamScope) => a.userId === b.userId && a.teamId === b.teamId && a.appId === b.appId;
/** 任务的本机分支 ID：任务 ID 加一段随机后缀。另存之后原任务跟随远端要另起分支，后缀让新旧分支互不冲突。 */
const taskBranchId = (taskId: string) => `task/${taskId}/${crypto.randomUUID().slice(0, 8)}`;
/** 工作树三个捕获位组成的凭据。 */
const credentials = (status: TreeStatus) => ({
  expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});
/** 当前分支的头提交（启用之后每条分支都有根节点，头不会为空）。 */
async function headOf(database: TeamDatabase): Promise<string> {
  const { headCommitId } = await database.tree.listCommits({ limit: 1 });
  demand(headCommitId, 'internal', '服务暂时不可用，请稍后按原请求重试');
  return headCommitId;
}
/** 提交历史（子先于父）里共同起点之前的部分：任务分支上自己的提交，新到旧。 */
function ownCommits(entries: readonly TreeLogEntry[], base: string): readonly TreeLogEntry[] {
  const end = entries.findIndex(entry => entry.commitId === base);
  return end < 0 ? entries : entries.slice(0, end);
}
/**
 * 逐页导入一条分支在服务端的提交，直到下发接口说没有更多：每一页原样交给 `importCommits()`，`more` 时把这一页的头加进已知提交。
 * @param known 本机已有的提交（通常是当前头）。
 * @returns 服务端此刻的分支头（导入之后就是本机分支的头）。
 */
async function pull(
  database: TeamDatabase,
  download: ExchangeDownload,
  branch: ExchangeBranch,
  known: string
): Promise<string> {
  const seen = [known];
  for (;;) {
    const page = await download(branch, seen);
    if (page.commits.length) await importPage(database, page.commits);
    if (!page.more) return page.head;
    seen.push(page.commits[page.commits.length - 1].commitId);
  }
}
/** 导入一页提交；平台拒绝时按成因报错（工作树不干净时提示先处理本机修改，其余是本机与服务端的历史对不上）。 */
async function importPage(database: TeamDatabase, commits: readonly CommitExchangeRecord[]): Promise<void> {
  const status = await database.tree.status();
  const result = await database.tree.importCommits(commits, credentials(status));
  if (result.ok) return;
  demand(result.reason !== 'dirty_working_tree', 'dirty', '本机有修改，请先保留或另存为新任务');
  throw new CollaborationError('conflict', '本机历史与服务端不一致，无法导入远端提交', importDetails(result));
}
/** 导入被拒时附带的诊断：成因与平台给出的提交或问题枚举，不含任何补丁内容。 */
function importDetails(result: Exclude<CommitImportResult, { ok: true }>): Record<string, unknown> {
  return {
    reason: result.reason,
    ...('commitId' in result && { commitId: result.commitId }),
    ...('problem' in result && { problem: result.problem })
  };
}
/** 一次上传的提交：从最早的开始，最多 {@link commitBatchLimit} 个，且请求不超过 {@link requestBodyLimit}。 */
function uploadChunk(commits: readonly CommitExchangeRecord[]): CommitExchangeRecord[] {
  const chunk: CommitExchangeRecord[] = [];
  let bytes = envelopeBytes;
  for (const commit of commits.slice(0, commitBatchLimit)) {
    bytes += utf8.encode(JSON.stringify(serializeCommitExchangeRecord(commit))).length + 1;
    if (bytes > requestBodyLimit) break;
    chunk.push(commit);
  }
  demand(chunk.length, 'limit', '请求不能超过 4 MiB');
  return chunk;
}
