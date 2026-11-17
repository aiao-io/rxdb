import {
  demand,
  type Candidate,
  type ChangeSet,
  type Command,
  type Commit,
  type CommitContent,
  type CommitMeta,
  type CommitSummary,
  type Environment,
  type Identity,
  type Records,
  type SharedRecords,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { bootstrap } from './engine.js';
import { readCandidate, readCommit, readSharedRecords, readSummary, runCommand } from './service.js';
import { commitSummary, type CommitStore, type Lineage, type Link, type Path, type SharedChange } from './store.js';

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
  summaries(): Promise<Record<string, CommitSummary>> {
    this.stats.calls.push('summaries');
    const found: Record<string, CommitSummary> = {};
    for (const commit of this.rows.values()) found[commit.id] = commitSummary(commit);
    return Promise.resolve(found);
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

/**
 * 内存里的一个工作区：状态加上 {@link MemoryCommitStore}，走与仓储相同的 `runCommand` 与读取函数，
 * 区别只在不经过数据库事务；供引擎、HTTP 路由与随机历史测试使用。
 */
export class MemoryWorkspace {
  readonly store = new MemoryCommitStore();
  constructor(readonly state: Workspace) {}
  /** 用初始管理员建一个空工作区。 */
  static create(input: Parameters<typeof bootstrap>[0], env: Environment): MemoryWorkspace {
    return new MemoryWorkspace(bootstrap(input, env));
  }
  /** 执行一条命令；失败时状态与存储保持原样（引擎只在成功时才更新状态，存储只在引擎成功之后才写入）。 */
  run(user: Identity, command: Command, env: Environment): Promise<Record<string, unknown>> {
    return runCommand(this.store, this.state, user, command, env);
  }
  summary(user: Identity, now: number): Promise<WorkspaceSummary> {
    return readSummary(this.store, this.state, user, now);
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
}
