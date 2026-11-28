import { candidateContent, commitContent, historyPage, isSharedKind, type SharedBranch } from '../derive.js';
import {
  CollaborationError,
  demand,
  receiptRetentionMs,
  type Candidate,
  type ChangeUnit,
  type Command,
  type Comment,
  type Commit,
  type CommitContent,
  type CommitMeta,
  type CommitPage,
  type CommitSummary,
  type Environment,
  type HistoryQuery,
  type Identity,
  type Records,
  type SchemaManifest,
  type SharedRecords,
  type Workspace
} from '../model.js';
import { sortRecords } from '../records.js';
import { recordKeyText, type RecordKey } from '../schema.js';
import { authorize, prFor, taskFor } from './access.js';
import { bootstrap, type EngineOptions } from './engine.js';
import type { Effects, MergeLog, NewCommit } from './plan.js';
import { referenceSummary, type ReferenceSummary } from './reference.testing.js';
import { runCommand } from './service.js';
import type { ThreadComment, WorkspaceChanges } from './state-changes.js';
import type {
  CommandStore,
  CommitStore,
  IndexedKey,
  Lineage,
  Link,
  Path,
  SharedChange,
  WorkspaceLoader
} from './store.js';

/** 写回线程时去掉评论上附带的线程与 PR 标识（它们只是写回与广播用的定位）。 */
const bare = ({ id, authorId, body, deleted, revision, at }: ThreadComment): Comment => ({
  id,
  authorId,
  body,
  deleted,
  revision,
  at
});

/** 每个写事务最多清理的过期回执条数，与 PostgreSQL 实现一致。 */
export const memoryReceiptSweep = 20;

/**
 * 纯内存的提交存储：与 PostgreSQL 实现遵守同一份 {@link CommitStore} 约定，用来在不起数据库的情况下测试引擎与内容推导。
 * 共享记录的键索引与 PostgreSQL 的 `record_keys` 一样随合并维护，唯一与关联查询只按键命中。
 * `stats` 记录读取方法的调用、读到的提交数与读到的共享记录（含键索引命中）数，用来断言读取成本不随提交总数、共享记录总数增长。
 */
export class MemoryCommitStore implements CommitStore {
  private readonly rows = new Map<string, NewCommit>();
  private records: Records = {};
  /** 键索引：每条共享记录的键。 */
  private readonly keys = new Map<string, IndexedKey[]>();
  /** 读取方法的调用名（按调用顺序）、读到的提交行数与读到的共享记录及键索引行数。 */
  readonly stats = { calls: [] as string[], rows: 0, records: 0 };

  commits(ids: readonly string[]): Promise<Map<string, CommitMeta>> {
    this.stats.calls.push('commits');
    const found = new Map<string, CommitMeta>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (!row) continue;
      this.stats.rows++;
      found.set(id, this.meta(row));
    }
    return Promise.resolve(found);
  }
  path(from: string, until: string | null): Promise<Path> {
    this.stats.calls.push('path');
    const links: Link[] = [];
    let cursor: string | null = from;
    while (cursor !== null && cursor !== until) {
      const row = this.rows.get(cursor);
      if (!row) return Promise.resolve({ links, reached: false });
      this.stats.rows++;
      links.push(this.link(row.record));
      cursor = row.record.parentIds[0] ?? null;
    }
    return Promise.resolve({ links, reached: cursor === until });
  }
  history(from: string, until: string | null, limit: number): Promise<CommitSummary[]> {
    this.stats.calls.push('history');
    const found: CommitSummary[] = [];
    let cursor: string | null = from;
    while (cursor !== null && cursor !== until && found.length < limit) {
      const row = this.rows.get(cursor);
      if (!row) break;
      this.stats.rows++;
      found.push(this.summary(row));
      cursor = row.record.parentIds[0] ?? null;
    }
    return Promise.resolve(found);
  }
  lineage(id: string): Promise<Lineage> {
    this.stats.calls.push('lineage');
    const links: Link[] = [];
    let cursor: string | null = id;
    while (cursor !== null) {
      const row = this.rows.get(cursor);
      demand(row, 'not_found', '提交不存在');
      this.stats.rows++;
      const link = this.link(row.record);
      if (isSharedKind(link.kind)) return Promise.resolve({ links, anchor: link });
      links.push(link);
      cursor = link.parent;
    }
    throw new CollaborationError('ancestry', '找不到可信共同起点');
  }
  changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeUnit[]>> {
    this.stats.calls.push('changes');
    const wanted = records && new Set(records);
    const found = new Map<string, ChangeUnit[]>();
    for (const id of ids) {
      const row = this.rows.get(id);
      if (!row) continue;
      this.stats.rows++;
      const units = row.record.units;
      found.set(id, structuredClone(wanted ? units.filter(unit => wanted.has(unit.entityId)) : [...units]));
    }
    return Promise.resolve(found);
  }
  shared(records?: readonly string[]): Promise<Records> {
    this.stats.calls.push('shared');
    if (!records) {
      this.stats.records += Object.keys(this.records).length;
      return Promise.resolve(structuredClone(this.records));
    }
    const rows: Records = {};
    for (const id of records) if (Object.hasOwn(this.records, id)) rows[id] = structuredClone(this.records[id]);
    this.stats.records += Object.keys(rows).length;
    return Promise.resolve(rows);
  }
  holders(keys: readonly RecordKey[]): Promise<Map<string, string[]>> {
    this.stats.calls.push('holders');
    const wanted = new Set(keys.filter(key => key.kind === 'unique').map(recordKeyText));
    const found = new Map([...wanted].map(text => [text, [] as string[]]));
    for (const [recordId, list] of this.keys)
      for (const key of list)
        if (key.kind === 'unique' && wanted.has(recordKeyText(key))) found.get(recordKeyText(key))!.push(recordId);
    for (const list of found.values()) list.sort();
    this.stats.records += [...found.values()].reduce((count, list) => count + list.length, 0);
    return Promise.resolve(found);
  }
  referencing(ids: readonly string[]): Promise<Records> {
    this.stats.calls.push('referencing');
    const wanted = new Set(ids);
    const rows: Records = {};
    for (const [recordId, list] of this.keys)
      if (list.some(key => key.kind === 'reference' && wanted.has(key.value)))
        rows[recordId] = structuredClone(this.records[recordId]);
    this.stats.records += Object.keys(rows).length;
    return Promise.resolve(rows);
  }
  append(commits: readonly NewCommit[]): Promise<void> {
    for (const commit of commits) this.add(commit);
    return Promise.resolve();
  }
  /** 追加一个提交（同步）：同 ID 已存在、或有父不在存储里都拒绝，与提交表的主键与父外键一致。 */
  add(commit: NewCommit): void {
    const { record } = commit;
    demand(!this.rows.has(record.commitId), 'exists', '提交已存在');
    demand(
      record.parentIds.every(parent => this.rows.has(parent)),
      'ancestry',
      '提交父链不连续'
    );
    this.rows.set(record.commitId, structuredClone(commit));
  }
  /** 存储里的交换记录（测试核对「原样存下、原样下发」用）；不存在时为 undefined。 */
  record(id: string): Commit | undefined {
    const row = this.rows.get(id);
    return row && structuredClone(row.record);
  }
  apply(change: SharedChange): Promise<void> {
    for (const id of [...change.remove, ...Object.keys(change.upsert)]) this.keys.delete(id);
    for (const id of change.remove) delete this.records[id];
    Object.assign(this.records, structuredClone(change.upsert));
    this.index(change.keys);
    return Promise.resolve();
  }
  reindex(keys: readonly IndexedKey[]): Promise<void> {
    this.keys.clear();
    this.index(keys);
    return Promise.resolve();
  }
  /** 键索引的全部行（测试核对索引与共享记录一致用），按记录标识排序。 */
  indexRows(): IndexedKey[] {
    return [...this.keys.keys()].sort().flatMap(id => structuredClone(this.keys.get(id)!));
  }
  /** 清零读取统计，用来只统计接下来这一条命令的读取。 */
  resetStats(): void {
    this.stats.calls.length = 0;
    this.stats.rows = 0;
    this.stats.records = 0;
  }
  private index(keys: readonly IndexedKey[]): void {
    for (const key of keys) this.keys.set(key.recordId, [...(this.keys.get(key.recordId) ?? []), structuredClone(key)]);
  }
  private summary({ record, candidateId }: NewCommit): CommitSummary {
    const summary: CommitSummary = {
      id: record.commitId,
      parentIds: [...record.parentIds],
      kind: record.kind,
      authorId: record.authorId,
      message: record.message,
      createdAt: record.createdAt
    };
    if (candidateId !== null) summary.candidateId = candidateId;
    return summary;
  }
  private meta(row: NewCommit): CommitMeta {
    return { ...this.summary(row), contentFingerprint: row.record.contentFingerprint };
  }
  private link(record: Commit): Link {
    return { id: record.commitId, parent: record.parentIds[0] ?? null, kind: record.kind };
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
  /** 登记过的全部数据模式版本（只追加）。 */
  readonly schemas = new Map<number, SchemaManifest>();
  /** 最近一条命令加载的局部状态（引擎执行之后的样子），用来断言命令只读了它涉及的行。 */
  lastLoaded: Workspace | undefined;
  constructor(
    readonly state: Workspace,
    private readonly options: EngineOptions = {}
  ) {
    this.schemas.set(state.schemaVersion, structuredClone(state.schema));
  }
  /** 用初始管理员与第一个数据模式版本建一个空工作区；`options` 是注入引擎的扩展（特殊业务检查），默认没有。 */
  static create(
    input: Parameters<typeof bootstrap>[0],
    env: Environment,
    options: EngineOptions = {}
  ): MemoryWorkspace {
    const { state, root } = bootstrap(input, env);
    const workspace = new MemoryWorkspace(state, options);
    workspace.store.add({ record: root, candidateId: null });
    return workspace;
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
      return await runCommand(store, user, command, env, this.options);
    } finally {
      this.lastLoaded = loader.state;
    }
  }
  /** 参照模型下的整页读取（见 `reference.testing.ts`）；授权失败以被拒绝的 Promise 报告，与读取路径一致。 */
  async summary(user: Identity): Promise<ReferenceSummary> {
    return referenceSummary(this.state, user);
  }
  /** 共享分支当前的全部记录与头提交；需要 read 权限。 */
  async records(user: Identity): Promise<SharedRecords> {
    authorize(this.state, user, 'read');
    return { head: this.state.head, records: sortRecords(await this.store.shared()) };
  }
  /** 一个提交的完整内容，推导与浏览器读取同一份 `derive.ts`；需要 read 权限。 */
  async commit(user: Identity, id: string): Promise<CommitContent> {
    authorize(this.state, user, 'read');
    return commitContent(this.store, this.branch(), id);
  }
  /** 一个合并候选的完整内容；需要 read 权限，未知 ID 返回 `not_found`。 */
  async candidate(user: Identity, id: string): Promise<Candidate> {
    authorize(this.state, user, 'read');
    demand(Object.hasOwn(this.state.candidates, id), 'not_found', '候选不存在');
    return structuredClone(await candidateContent(this.store, this.branch(), this.state.candidates[id]));
  }
  /** 提交历史的一页：共享分支、任务分支或 PR 的来源任务三者恰好取一；需要 read 权限。 */
  async history(user: Identity, query: HistoryQuery): Promise<CommitPage> {
    authorize(this.state, user, 'read');
    const selectors = [query.branch, query.taskId, query.prId].filter(value => value !== undefined);
    demand(selectors.length === 1, 'invalid', '请求字段不合法');
    if (query.branch !== undefined) {
      demand(query.branch === 'shared', 'invalid', '请求字段不合法');
      return historyPage(this.store, { head: this.state.head, until: this.state.root }, query);
    }
    const task = taskFor(this.state, query.taskId ?? prFor(this.state, query.prId!).taskId);
    return historyPage(this.store, { head: task.head, until: task.base }, query);
  }
  /** 按版本读取登记过的数据模式清单；需要 read 权限，未登记的版本返回 `not_found`。 */
  async schema(user: Identity, version: number): Promise<SchemaManifest> {
    authorize(this.state, user, 'read');
    const schema = this.schemas.get(version);
    demand(schema, 'not_found', '数据模式不存在');
    return structuredClone(schema);
  }
  /** 把局部状态的差异写回完整状态：只动差异列出的行，引用按期望头比较交换，与 PostgreSQL 写回的语义一致。 */
  /** 共享分支的头与根：推导内容用。 */
  private branch(): SharedBranch {
    return { head: this.state.head, root: this.state.root };
  }
  private save(changes: WorkspaceChanges, effects: Effects, now: number): void {
    const state = this.state;
    for (const member of changes.members) state.members[member.id] = structuredClone(member);
    for (const invitation of changes.invitations) state.invitations[invitation.id] = structuredClone(invitation);
    if (changes.policy) state.policy = structuredClone(changes.policy);
    if (changes.schema) {
      demand(!this.schemas.has(changes.schema.schemaVersion), 'exists', '数据模式版本必须递增');
      this.schemas.set(changes.schema.schemaVersion, structuredClone(changes.schema));
      state.schema = structuredClone(changes.schema);
      state.schemaVersion = changes.schema.schemaVersion;
    }
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
    if (!changes.revised) return;
    this.sweepReceipts(now);
    state.revision++;
  }
  private saveThreads(changes: WorkspaceChanges): void {
    const threads = this.state.threads;
    for (const thread of changes.threads.created) threads[thread.id] = { ...structuredClone(thread), comments: [] };
    for (const thread of changes.threads.updated) Object.assign(threads[thread.id], structuredClone(thread));
    for (const comment of changes.comments.created) threads[comment.threadId].comments.push(bare(comment));
    for (const comment of changes.comments.updated) {
      const index = threads[comment.threadId].comments.findIndex(item => item.id === comment.id);
      threads[comment.threadId].comments[index] = bare(comment);
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
