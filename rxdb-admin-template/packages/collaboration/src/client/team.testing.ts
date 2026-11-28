import type { RxDB } from '@aiao/rxdb';
import type {
  CommitImportOptions,
  CommitImportResult,
  CommitOptions,
  CommitResult,
  WorkingTreeDiscardOptions,
  WorkingTreeDiscardResult,
  WorkingTreeRestoreOptions,
  WorkingTreeRestoreResult,
  WorkingTreeRestoreTarget
} from '@aiao/rxdb-plugin-working-tree';
import {
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord,
  type CommitChangeUnitContent,
  type CommitExchangeRecord
} from '@aiao/rxdb-plugin-working-tree/exchange';
import { uuidv7 } from '../commit.js';
import type { Commit, Records } from '../model.js';
import type { TeamDatabase, TeamScope, TeamWorkingTree, TreeStatus } from './team-database.js';

/** 内存里的键值存储（`localStorage` 的替身），另交出全部键供断言。 */
export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    keys: () => map.keys()
  };
}

/** 线上 JSON 形态的提交还原成平台的交换记录（`createdAt` 是 `Date`）。 */
export const exchangeRecordOf = (commit: Commit): CommitExchangeRecord =>
  parseCommitExchangeRecord(JSON.parse(JSON.stringify(commit)));

/** 桩里一条分支：头、未提交条目、恢复会话的目标与三个捕获位。 */
interface StubBranch {
  head: string;
  entries: CommitChangeUnitContent[];
  restoring: string | null;
  activation: number;
  headRevision: number;
  workingTreeRevision: number;
}
type Credentials = WorkingTreeDiscardOptions;
const conflictOf = (branchId: string, expected: number, actual: number) => ({
  kind: 'working_tree_revision' as const,
  expected,
  actual,
  branchId
});

/**
 * 内存里的团队库桩（只用于控制器的状态机用例）：按平台文档的语义模拟分支、工作树与提交图——
 * 提交的父是当前头、导入只接受快进或空分支、导出是 `after..HEAD`、从提交建分支要求目标在当前分支的历史里、
 * 恢复只沿第一父链、三个捕获位对不上即冲突。业务数据不建模，`edit()` 在当前分支上记一条未提交单元，`writes` 记下按记录写入的批次。
 * 真实平台的行为由 `team-tasks.spec.ts`（PGlite）与集成测试覆盖。
 */
export class MemoryTeamDatabase implements TeamDatabase {
  private readonly listeners = new Set<() => void>();
  /** 只交给编辑界面，控制器不读它。 */
  readonly rxdb = { name: 'team-database-stub' } as unknown as RxDB;
  readonly commits = new Map<string, CommitExchangeRecord>();
  readonly branches = new Map<string, StubBranch>();
  /** 按记录写入的批次（匿名导入）。 */
  readonly writes: { records: Records; order: readonly string[] }[] = [];
  /** 依次发生的分支与提交动作，供断言顺序。 */
  readonly log: string[] = [];
  active = 'main';
  closed = false;
  readonly tree: TeamWorkingTree = {
    status: async () => this.status(),
    commit: async (message, options) => this.commit(message, options),
    discard: async options => this.discard(options),
    restore: async (target, options) => this.restore(target, options),
    importCommits: async (commits, options) => this.importCommits(commits, options),
    exportCommits: async options => this.exportCommits(options.afterCommitId),
    createBranchFromCommit: async (branchId, commitId) => this.createBranchFromCommit(branchId, commitId),
    listCommits: async () => ({
      headCommitId: this.branch().head,
      entries: this.firstParents(this.branch().head).map(id => this.commits.get(id)!)
    })
  };
  constructor(readonly scope: TeamScope) {
    const root = sealed({
      commitId: `local-root-${uuidv7()}`,
      parentIds: [],
      kind: 'baseline',
      message: '本机基线',
      authorId: null,
      createdAt: new Date(),
      units: []
    });
    this.commits.set(root.commitId, root);
    this.branches.set('main', {
      head: root.commitId,
      entries: [],
      restoring: null,
      activation: 1,
      headRevision: 1,
      workingTreeRevision: 1
    });
  }
  /** 当前分支。 */
  branch(): StubBranch {
    return this.branches.get(this.active)!;
  }
  /** 测试：在当前分支上模拟一次保存（记一条未提交的插入），并像真实库一样通知本地写入。 */
  edit(entityId = uuidv7()): void {
    const branch = this.branch();
    branch.entries.push({
      unitId: uuidv7(),
      transactionId: null,
      namespace: 'test',
      entity: 'Item',
      entityId,
      operation: 'insert',
      patch: { name: entityId },
      inversePatch: null,
      origin: 'local'
    });
    branch.workingTreeRevision++;
    this.listeners.forEach(listener => listener());
  }
  async currentBranch() {
    return this.active;
  }
  async switchBranch(branchId: string) {
    if (!this.branches.has(branchId)) throw new Error(`Branch '${branchId}' not found`);
    this.log.push(`switch:${branchId}`);
    if (branchId !== this.active) this.branches.get(branchId)!.activation++;
    this.active = branchId;
  }
  async writeRecords(records: Records, order: readonly string[]) {
    this.writes.push({ records: structuredClone(records), order: [...order] });
    for (const id of Object.keys(records)) this.edit(id);
  }
  onWrite(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  async close() {
    this.closed = true;
  }
  private status(): TreeStatus {
    const branch = this.branch();
    return {
      branchId: this.active,
      entryCount: branch.entries.length,
      restoring: branch.restoring !== null,
      conflicted: false,
      activationRevision: branch.activation,
      headRevision: branch.headRevision,
      workingTreeRevision: branch.workingTreeRevision
    };
  }
  /** 三个捕获位对得上时返回 undefined，否则返回冲突。 */
  private stale(options: Credentials) {
    const branch = this.branch();
    if (
      options.expectedBranch.branchId !== this.active ||
      options.expectedBranch.activationRevision !== branch.activation
    )
      return conflictOf(this.active, options.expectedBranch.activationRevision, branch.activation);
    if (options.expectedHeadRevision !== branch.headRevision)
      return conflictOf(this.active, options.expectedHeadRevision, branch.headRevision);
    if (options.expectedWorkingTreeRevision !== branch.workingTreeRevision)
      return conflictOf(this.active, options.expectedWorkingTreeRevision, branch.workingTreeRevision);
    return undefined;
  }
  private commit(message: string, options: CommitOptions): CommitResult {
    const conflict = this.stale(options);
    if (conflict) return { ok: false, conflict };
    const branch = this.branch();
    if (!branch.entries.length) throw new Error('empty_commit');
    const record = sealed({
      commitId: uuidv7(),
      parentIds: [branch.head],
      kind: 'normal',
      message,
      authorId: options.authorId,
      createdAt: new Date(),
      units: branch.entries
    });
    this.commits.set(record.commitId, record);
    branch.head = record.commitId;
    branch.entries = [];
    branch.restoring = null;
    branch.headRevision++;
    branch.workingTreeRevision++;
    this.log.push(`commit:${record.commitId}`);
    return {
      ok: true,
      commitId: record.commitId,
      changeSetCount: record.units.length,
      headRevision: branch.headRevision
    };
  }
  private discard(options: WorkingTreeDiscardOptions): WorkingTreeDiscardResult {
    const conflict = this.stale(options);
    if (conflict) return { ok: false, conflict };
    const branch = this.branch();
    const discardedCount = branch.entries.length;
    branch.entries = [];
    branch.restoring = null;
    if (discardedCount) branch.workingTreeRevision++;
    this.log.push('discard');
    return { ok: true, discardedCount, workingTreeRevision: branch.workingTreeRevision };
  }
  private restore(target: WorkingTreeRestoreTarget, options: WorkingTreeRestoreOptions): WorkingTreeRestoreResult {
    const conflict = this.stale(options);
    if (conflict) return { ok: false, reason: 'conflict', conflict };
    const branch = this.branch();
    if (branch.entries.length || branch.restoring) return { ok: false, reason: 'dirty_working_tree' };
    if (target.commitId === branch.head)
      return { ok: true, restoredCount: 0, sessionId: null, workingTreeRevision: branch.workingTreeRevision };
    if (!this.firstParents(branch.head).includes(target.commitId))
      return this.reachable(branch.head).has(target.commitId) ?
          { ok: false, reason: 'side_branch_target' }
        : { ok: false, reason: 'unreachable_target' };
    this.edit(`restored-${target.commitId}`);
    branch.restoring = target.commitId;
    this.log.push(`restore:${target.commitId}`);
    return { ok: true, restoredCount: 1, sessionId: uuidv7(), workingTreeRevision: branch.workingTreeRevision };
  }
  private importCommits(commits: readonly CommitExchangeRecord[], options: CommitImportOptions): CommitImportResult {
    const conflict = this.stale(options);
    if (conflict) return { ok: false, reason: 'conflict', conflict };
    const branch = this.branch();
    if (branch.entries.length || branch.restoring) return { ok: false, reason: 'dirty_working_tree' };
    const known = new Map([...this.commits, ...commits.map(record => [record.commitId, record] as const)]);
    const head = commits[commits.length - 1].commitId;
    const chain = firstParentsIn(known, head);
    const empty = this.commits.get(branch.head)?.kind === 'baseline' && !this.reachable(branch.head).size;
    if (!chain.includes(branch.head) && !empty) {
      if (this.reachable(branch.head).has(head))
        return {
          ok: true,
          headCommitId: branch.head,
          headRevision: branch.headRevision,
          importedCount: 0,
          appliedCount: 0
        };
      return { ok: false, reason: 'not_fast_forward', headCommitId: branch.head };
    }
    for (const record of commits) {
      const existing = this.commits.get(record.commitId);
      if (existing && existing.contentFingerprint !== record.contentFingerprint)
        return { ok: false, reason: 'commit_id_conflict', commitId: record.commitId };
    }
    const fresh = commits.filter(record => !this.commits.has(record.commitId));
    fresh.forEach(record => this.commits.set(record.commitId, record));
    if (head === branch.head)
      return { ok: true, headCommitId: head, headRevision: branch.headRevision, importedCount: 0, appliedCount: 0 };
    branch.head = head;
    branch.headRevision++;
    this.log.push(`import:${head}`);
    return {
      ok: true,
      headCommitId: head,
      headRevision: branch.headRevision,
      importedCount: fresh.length,
      appliedCount: 1
    };
  }
  private exportCommits(after: string | undefined) {
    if (after === undefined || !this.commits.has(after)) throw new Error(`Commit ${String(after)} not found`);
    const chain = this.firstParents(this.branch().head);
    const index = chain.indexOf(after);
    const ids = (index < 0 ? chain : chain.slice(0, index)).reverse();
    return { headCommitId: this.branch().head, commits: ids.map(id => this.commits.get(id)!) };
  }
  private createBranchFromCommit(branchId: string, commitId: string) {
    if (this.branches.has(branchId)) throw new Error(`Branch id (${branchId}) already exists`);
    const head = this.branch().head;
    if (head !== commitId && !this.reachable(head).has(commitId))
      return { ok: false as const, reason: 'unreachable_target' as const };
    this.branches.set(branchId, {
      head: commitId,
      entries: [],
      restoring: null,
      activation: 0,
      headRevision: 1,
      workingTreeRevision: 1
    });
    this.log.push(`branch:${branchId}@${commitId}`);
    return { ok: true as const };
  }
  /** 从 `head` 沿第一父链到根的提交 ID（含 `head`）。 */
  private firstParents(head: string): string[] {
    return firstParentsIn(this.commits, head);
  }
  /** `head` 沿全部父链可达的祖先（不含 `head`）。 */
  private reachable(head: string): Set<string> {
    const found = new Set<string>();
    const pending = [...(this.commits.get(head)?.parentIds ?? [])];
    while (pending.length) {
      const id = pending.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      pending.push(...(this.commits.get(id)?.parentIds ?? []));
    }
    return found;
  }
}

/** 记录补上平台算的内容指纹。 */
function sealed(record: Omit<CommitExchangeRecord, 'contentFingerprint'>): CommitExchangeRecord {
  return { ...record, contentFingerprint: computeCommitExchangeRecordFingerprint(record) };
}
/** 在一份提交表里从 `head` 沿第一父链走到根（含 `head`）。 */
function firstParentsIn(commits: ReadonlyMap<string, CommitExchangeRecord>, head: string): string[] {
  const chain: string[] = [];
  for (let id: string | undefined = head; id !== undefined && commits.has(id); id = commits.get(id)?.parentIds[0])
    chain.push(id);
  return chain;
}
