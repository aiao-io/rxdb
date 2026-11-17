import {
  demand,
  receiptRetentionMs,
  type Candidate,
  type ChangeSet,
  type Command,
  type Commit,
  type CommitContent,
  type CommitMeta,
  type CommitPage,
  type CommitSummary,
  type Environment,
  type HistoryQuery,
  type Identity,
  type Records,
  type SharedRecords,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { bootstrap } from './engine.js';
import type { Effects, MergeLog } from './plan.js';
import { readCandidate, readCommit, readHistory, readSharedRecords, readSummary, runCommand } from './service.js';
import type { WorkspaceChanges } from './state-changes.js';
import {
  commitSummary,
  type CommandStore,
  type CommitStore,
  type Lineage,
  type Link,
  type Path,
  type SharedChange,
  type WorkspaceLoader
} from './store.js';

/** 每个写事务最多清理的过期回执条数，与 PostgreSQL 实现一致。 */
export const memoryReceiptSweep = 20;

/**
 * 纯内存的提交存储：与 PostgreSQL 实现遵守同一份 {@link CommitStore} 约定，用来在不起数据库的情况下测试引擎与内容推导。
 * `stats` 记录读取方法的调用与读到的提交数，用来断言读取成本不随提交总数增长。
 */
export class MemoryCommitStore implements CommitStore {
  private readonly rows = new Map<string, Commit>();
  private records: Records = {};
  /** 读取方法的调用名（按调用顺序）与读到的提交行数。 */
  readonly stats = { calls: [] as string[], rows: 0 };

  commits(ids: readonly string[]): Promise<Map<string, CommitMeta>> {
    this.stats.calls.push('commits');
    const found = new Map<string, CommitMeta>();
    for (const id of ids) {
      const commit = this.rows.get(id);
      if (!commit) continue;
      this.stats.rows++;
      found.set(id, this.meta(commit));
    }
    return Promise.resolve(found);
  }
  path(from: string | null, until: string | null): Promise<Path> {
    this.stats.calls.push('path');
    const links: Link[] = [];
    let cursor = from;
    while (cursor !== null && cursor !== until) {
      const commit = this.rows.get(cursor);
      if (!commit) return Promise.resolve({ links, reached: false });
      this.stats.rows++;
      links.push(this.link(commit));
      cursor = commit.parent;
    }
    return Promise.resolve({ links, reached: cursor === until });
  }
  history(from: string | null, until: string | null, limit: number): Promise<CommitSummary[]> {
    this.stats.calls.push('history');
    const found: CommitSummary[] = [];
    let cursor = from;
    while (cursor !== null && cursor !== until && found.length < limit) {
      const commit = this.rows.get(cursor);
      if (!commit) break;
      this.stats.rows++;
      found.push(commitSummary(this.meta(commit)));
      cursor = commit.parent;
    }
    return Promise.resolve(found);
  }
  lineage(id: string): Promise<Lineage> {
    this.stats.calls.push('lineage');
    const links: Link[] = [];
    let cursor: string | null = id;
    while (cursor !== null) {
      const commit = this.rows.get(cursor);
      demand(commit, 'not_found', '提交不存在');
      this.stats.rows++;
      if (commit.mergeSource !== undefined) return Promise.resolve({ links, anchor: commit.id });
      links.push(this.link(commit));
      cursor = commit.parent;
    }
    return Promise.resolve({ links, anchor: null });
  }
  changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeSet[]>> {
    this.stats.calls.push('changes');
    const wanted = records && new Set(records);
    const found = new Map<string, ChangeSet[]>();
    for (const id of ids) {
      const commit = this.rows.get(id);
      if (!commit) continue;
      this.stats.rows++;
      found.set(
        id,
        structuredClone(wanted ? commit.changes.filter(change => wanted.has(change.entityId)) : commit.changes)
      );
    }
    return Promise.resolve(found);
  }
  shared(records?: readonly string[]): Promise<Records> {
    this.stats.calls.push('shared');
    if (!records) return Promise.resolve(structuredClone(this.records));
    const rows: Records = {};
    for (const id of records) if (Object.hasOwn(this.records, id)) rows[id] = structuredClone(this.records[id]);
    return Promise.resolve(rows);
  }
  append(commits: readonly Commit[]): Promise<void> {
    for (const commit of commits) {
      demand(!this.rows.has(commit.id), 'exists', '提交已存在');
      demand(commit.parent === null || this.rows.has(commit.parent), 'ancestry', '提交父链不连续');
      this.rows.set(commit.id, structuredClone(commit));
    }
    return Promise.resolve();
  }
  apply(change: SharedChange): Promise<void> {
    for (const id of change.remove) delete this.records[id];
    Object.assign(this.records, structuredClone(change.upsert));
    return Promise.resolve();
  }
  /** 清零读取统计，用来只统计接下来这一条命令的读取。 */
  resetStats(): void {
    this.stats.calls.length = 0;
    this.stats.rows = 0;
  }
  private meta(commit: Commit): CommitMeta {
    const meta: CommitMeta = {
      id: commit.id,
      parent: commit.parent,
      authorId: commit.authorId,
      message: commit.message,
      fingerprint: commit.fingerprint
    };
    if (commit.mergeSource !== undefined) meta.mergeSource = commit.mergeSource;
    if (commit.candidateId !== undefined) meta.candidateId = commit.candidateId;
    return meta;
  }
  private link(commit: Commit): Link {
    return { id: commit.id, parent: commit.parent, merge: commit.mergeSource !== undefined };
  }
}

/** 只含治理字段、全部成员、在线记录与共享头的空局部状态；其余集合由加载器按需填入。 */
function governanceState(full: Workspace): Workspace {
  return structuredClone({
    ...full,
    tasks: {},
    prs: {},
    candidates: {},
    invitations: {},
    reviews: [],
    threads: {},
    notifications: [],
    receipts: {},
    audit: []
  });
}
const copy = <T>(source: Readonly<Record<string, T>>, target: Record<string, T>, ids: readonly string[]) => {
  for (const id of ids) if (Object.hasOwn(source, id)) target[id] = structuredClone(source[id]);
};

/**
 * 内存加载器：从完整状态里截取命令涉及的行，与 PostgreSQL 加载器返回同样形状的局部状态；没有锁，
 * 但截取范围与 PostgreSQL 一致，引擎在局部状态上缺了哪一行，单元测试就会像集成测试一样失败。
 */
class MemoryLoader implements WorkspaceLoader {
  state = {} as Workspace;
  constructor(private readonly full: Workspace) {}
  governance(): Promise<boolean> {
    this.state = governanceState(this.full);
    return Promise.resolve(true);
  }
  receipt(operationId: string, now: number): Promise<boolean> {
    const receipt = Object.hasOwn(this.full.receipts, operationId) ? this.full.receipts[operationId] : undefined;
    const valid = !!receipt && receipt.at > now - receiptRetentionMs;
    if (valid) this.state.receipts[operationId] = structuredClone(receipt);
    return Promise.resolve(valid);
  }
  lockPrs(ids: readonly string[]): Promise<void> {
    return this.prs(ids);
  }
  async lockTaskPrs(taskId: string): Promise<string[]> {
    const ids = await this.taskPrIds(taskId);
    await this.prs(ids);
    return ids;
  }
  taskPrIds(taskId: string): Promise<string[]> {
    return Promise.resolve(
      Object.values(this.full.prs)
        .filter(pr => pr.taskId === taskId)
        .map(pr => pr.id)
        .sort()
    );
  }
  prs(ids: readonly string[]): Promise<void> {
    copy(this.full.prs, this.state.prs, ids);
    return Promise.resolve();
  }
  async taskPrs(taskId: string): Promise<void> {
    await this.prs(await this.taskPrIds(taskId));
  }
  sharedRef(): Promise<void> {
    this.state.head = this.full.head;
    return Promise.resolve();
  }
  task(id: string): Promise<void> {
    copy(this.full.tasks, this.state.tasks, [id]);
    return Promise.resolve();
  }
  threads(ids: readonly string[]): Promise<void> {
    copy(this.full.threads, this.state.threads, ids);
    return Promise.resolve();
  }
  prThreads(prId: string): Promise<void> {
    return this.threads(
      Object.values(this.full.threads)
        .filter(thread => thread.prId === prId)
        .map(thread => thread.id)
    );
  }
  prReviews(prId: string): Promise<void> {
    this.state.reviews = structuredClone(this.full.reviews.filter(review => review.prId === prId));
    return Promise.resolve();
  }
  candidates(ids: readonly string[]): Promise<void> {
    copy(this.full.candidates, this.state.candidates, ids);
    return Promise.resolve();
  }
  invitation(id: string): Promise<void> {
    copy(this.full.invitations, this.state.invitations, [id]);
    return Promise.resolve();
  }
  notification(id: string, userId: string): Promise<void> {
    const notice = this.full.notifications.find(item => item.id === id && item.userId === userId);
    if (notice) this.state.notifications.push(structuredClone(notice));
    return Promise.resolve();
  }
  threadPr(threadId: string): Promise<string | undefined> {
    return Promise.resolve(Object.hasOwn(this.full.threads, threadId) ? this.full.threads[threadId].prId : undefined);
  }
  prTask(prId: string): Promise<string | undefined> {
    return Promise.resolve(Object.hasOwn(this.full.prs, prId) ? this.full.prs[prId].taskId : undefined);
  }
}

/**
 * 内存里的一个工作区：完整状态加上 {@link MemoryCommitStore}，走与仓储相同的加载、`runCommand` 与写回，
 * 区别只在不经过数据库事务；供引擎、HTTP 路由与随机历史测试使用。`state` 是完整的逻辑状态，测试可以直接读改。
 */
export class MemoryWorkspace {
  readonly store = new MemoryCommitStore();
  /** 每次合并写进变更日志的内容，按合并顺序。 */
  readonly changeLog: MergeLog[] = [];
  /** 最近一条命令加载的局部状态（引擎执行之后的样子），用来断言命令只读了它涉及的行。 */
  lastLoaded: Workspace | undefined;
  constructor(readonly state: Workspace) {}
  /** 用初始管理员建一个空工作区。 */
  static create(input: Parameters<typeof bootstrap>[0], env: Environment): MemoryWorkspace {
    return new MemoryWorkspace(bootstrap(input, env));
  }
  /** 执行一条命令；失败时状态与存储保持原样（只在引擎成功之后才写回）。 */
  async run(user: Identity, command: Command, env: Environment): Promise<Record<string, unknown>> {
    const loader = new MemoryLoader(this.state);
    const store: CommandStore = {
      commits: this.store,
      loader,
      save: (changes, effects, now) => {
        this.save(changes, effects, now);
        return Promise.resolve();
      }
    };
    try {
      return await runCommand(store, user, command, env);
    } finally {
      this.lastLoaded = loader.state;
    }
  }
  /** 摘要；授权失败以被拒绝的 Promise 报告，与仓储一致。 */
  async summary(user: Identity, now: number): Promise<WorkspaceSummary> {
    return readSummary(this.state, user, now);
  }
  records(user: Identity): Promise<SharedRecords> {
    return readSharedRecords(this.store, this.state, user);
  }
  commit(user: Identity, id: string): Promise<CommitContent> {
    return readCommit(this.store, this.state, user, id);
  }
  candidate(user: Identity, id: string): Promise<Candidate> {
    return readCandidate(this.store, this.state, user, id);
  }
  history(user: Identity, query: HistoryQuery): Promise<CommitPage> {
    return readHistory(this.store, this.state, user, query);
  }
  /** 把局部状态的差异写回完整状态：只动差异列出的行，引用按期望头比较交换，与 PostgreSQL 写回的语义一致。 */
  private save(changes: WorkspaceChanges, effects: Effects, now: number): void {
    const state = this.state;
    for (const member of changes.members) state.members[member.id] = structuredClone(member);
    for (const invitation of changes.invitations) state.invitations[invitation.id] = structuredClone(invitation);
    if (changes.policy) state.policy = structuredClone(changes.policy);
    for (const task of changes.tasks) state.tasks[task.id] = structuredClone(task);
    for (const [taskId, move] of Object.entries(changes.heads)) {
      demand(state.tasks[taskId].head === move.from, 'diverged', '任务已分叉，请另存为新任务', {
        remoteHead: state.tasks[taskId].head
      });
      state.tasks[taskId].head = move.to;
    }
    if (changes.shared) {
      demand(state.head === changes.shared.from, 'stale', '版本已变化，请刷新后重试', { current: state.head });
      state.head = changes.shared.to;
    }
    for (const pr of [...changes.prs.created, ...changes.prs.updated]) state.prs[pr.id] = structuredClone(pr);
    for (const candidate of changes.candidates) state.candidates[candidate.id] = structuredClone(candidate);
    state.reviews.push(...structuredClone(changes.reviews));
    this.saveThreads(changes);
    state.notifications.push(...structuredClone(changes.notifications.created));
    for (const notice of changes.notifications.read)
      state.notifications.find(item => item.id === notice.id)!.read = true;
    if (effects.log) this.changeLog.push(structuredClone(effects.log));
    state.audit.push(...structuredClone(changes.audit.map(entry => entry.event)));
    for (const receipt of changes.receipts) state.receipts[receipt.operationId] = structuredClone(receipt);
    if (changes.presence) state.presence = structuredClone(changes.presence);
    if (!changes.revised) return;
    this.sweepReceipts(now);
    state.revision++;
  }
  private saveThreads(changes: WorkspaceChanges): void {
    const threads = this.state.threads;
    for (const thread of changes.threads.created) threads[thread.id] = { ...structuredClone(thread), comments: [] };
    for (const thread of changes.threads.updated) Object.assign(threads[thread.id], structuredClone(thread));
    for (const { threadId, ...comment } of changes.comments.created) threads[threadId].comments.push(comment);
    for (const { threadId, ...comment } of changes.comments.updated) {
      const index = threads[threadId].comments.findIndex(item => item.id === comment.id);
      threads[threadId].comments[index] = comment;
    }
  }
  /** 有界清理：每个写事务最多删除 {@link memoryReceiptSweep} 条过期回执，最旧的先删。 */
  private sweepReceipts(now: number): void {
    const expired = Object.values(this.state.receipts)
      .filter(receipt => receipt.at <= now - receiptRetentionMs)
      .sort((a, b) => a.at - b.at)
      .slice(0, memoryReceiptSweep);
    for (const receipt of expired) delete this.state.receipts[receipt.operationId];
  }
}
