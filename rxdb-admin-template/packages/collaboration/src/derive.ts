import { applyChanges, revertChanges } from './changes.js';
import {
  demand,
  historyPageSize,
  type CandidateSummary,
  type ChangeSet,
  type Commit,
  type CommitContent,
  type CommitPage,
  type CommitSummary,
  type Records,
  type StoredCandidate
} from './model.js';
import { sortRecords } from './records.js';

/** 提交图里的一个节点：走图只需要的信息；`merge` 表示它是共享分支上的合并提交。 */
export interface Link {
  id: string;
  parent: string | null;
  merge: boolean;
}
/** 沿父指针走出的一段路径：`links` 从新到旧，`reached` 表示走到了目标（目标是 null 时指走到了根）。 */
export interface Path {
  links: Link[];
  reached: boolean;
}
/** 一个提交的血缘：任务提交从新到旧，直到最近的合并提交（不含）；`anchor` 是那个合并提交的 ID，一路走到根则为 null。 */
export interface Lineage {
  links: Link[];
  anchor: string | null;
}
/** 走图查询返回的一行（PostgreSQL 的递归查询与公开读取函数同一形状）。 */
export interface LinkRow {
  id: string;
  parent_id: string | null;
  merge: boolean;
}
/** 提交元数据的一行（提交表与公开投影 `admin_commits` 同名列）。 */
export interface CommitRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  message: string;
  merge_source: string | null;
  candidate_id: string | null;
}
/** 字段级变更的一行（变更表与公开读取函数同名列）。 */
export interface ChangeRow {
  commit_id: string;
  namespace: string;
  entity: string;
  entity_id: string;
  operation: ChangeSet['operation'];
  patch: ChangeSet['patch'];
  inverse_patch: ChangeSet['inversePatch'];
}

/**
 * 推导提交与候选内容所需的只读存储。服务端的 PostgreSQL 存储、浏览器经 Supabase 公开投影的读取与测试用的内存存储都实现它，
 * 推导因此只有一份代码。读取成本只取决于所问的内容，不取决于工作区里一共有多少提交。
 */
export interface ContentSource {
  /** 按标识读取已存在提交的元数据；不存在的标识不出现在结果里。 */
  commits(ids: readonly string[]): Promise<Map<string, CommitSummary>>;
  /**
   * 从 `from` 沿父指针向前走（含 `from`），到 `until`（不含）为止；`until` 为 null 表示一直走到根。
   * `from` 为 null 时路径为空；`from` 与 `until` 相同时路径为空且已到达。
   */
  path(from: string | null, until: string | null): Promise<Path>;
  /**
   * 提交历史的一段：从 `from` 沿父指针向前（含 `from`），到 `until`（不含）或根为止，最多 `limit` 个，从新到旧。
   * 只读元数据，按 `limit` 截断，成本与工作区的提交总数无关。
   */
  history(from: string | null, until: string | null, limit: number): Promise<CommitSummary[]>;
  /** 从 `id` 沿父指针向前走到最近的合并提交（不含）；`id` 不存在时抛出 `not_found`。 */
  lineage(id: string): Promise<Lineage>;
  /** 读取提交的字段级变更，按提交内的顺序；`records` 给出时只取这些记录的变更。没有变更的提交可以不出现在结果里。 */
  changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeSet[]>>;
  /** 共享分支当前的记录；`records` 给出时只取这些记录。 */
  shared(records?: readonly string[]): Promise<Records>;
}

/** 提交元数据行转成提交摘要：合并关联只在合并提交上出现。 */
export function commitSummaryOf(row: CommitRow): CommitSummary {
  const summary: CommitSummary = { id: row.id, parent: row.parent_id, authorId: row.author_id, message: row.message };
  if (row.merge_source !== null) summary.mergeSource = row.merge_source;
  if (row.candidate_id !== null) summary.candidateId = row.candidate_id;
  return summary;
}
/** 提交的摘要：去掉指纹与变更，合并关联只在合并提交上出现。 */
export function commitSummary(commit: Omit<Commit, 'changes'> | CommitSummary): CommitSummary {
  const summary: CommitSummary = {
    id: commit.id,
    parent: commit.parent,
    authorId: commit.authorId,
    message: commit.message
  };
  if (commit.mergeSource !== undefined) summary.mergeSource = commit.mergeSource;
  if (commit.candidateId !== undefined) summary.candidateId = commit.candidateId;
  return summary;
}
/** 变更行按提交分组，保持每个提交内的顺序（行已按提交与序号排好）。 */
export function changesOf(rows: readonly ChangeRow[]): Map<string, ChangeSet[]> {
  const found = new Map<string, ChangeSet[]>();
  for (const row of rows) {
    const list = found.get(row.commit_id) ?? [];
    list.push({
      namespace: row.namespace,
      entity: row.entity,
      entityId: row.entity_id,
      operation: row.operation,
      patch: row.patch,
      inversePatch: row.inverse_patch
    });
    found.set(row.commit_id, list);
  }
  return found;
}
/** 由走图查询的行还原从 `from` 到 `until` 的路径：从 `from` 起逐个按父指针找，缺行即未到达，遇环即拒绝。 */
export function pathOf(rows: readonly LinkRow[], from: string, until: string | null): Path {
  const byId = new Map(rows.map(row => [row.id, row]));
  const links: Link[] = [];
  let cursor: string | null = from;
  while (cursor !== null && cursor !== until) {
    const row = byId.get(cursor);
    if (!row) return { links, reached: false };
    demand(links.length <= byId.size, 'ancestry', '提交图不能包含环');
    links.push({ id: row.id, parent: row.parent_id, merge: row.merge });
    cursor = row.parent_id;
  }
  return { links, reached: cursor === until };
}
/** 由血缘查询的行还原 `id` 的血缘：一直走到第一个合并提交（它是锚点，不计入）或根。 */
export function lineageOf(rows: readonly LinkRow[], id: string): Lineage {
  const byId = new Map(rows.map(row => [row.id, row]));
  demand(byId.has(id), 'not_found', '提交不存在');
  const links: Link[] = [];
  let cursor: string | null = id;
  while (cursor !== null) {
    const row = byId.get(cursor);
    demand(row && links.length <= byId.size, 'ancestry', '提交图不能包含环');
    if (row.merge) return { links, anchor: row.id };
    links.push({ id: row.id, parent: row.parent_id, merge: false });
    cursor = row.parent_id;
  }
  return { links, anchor: null };
}

/**
 * 共享分支在合并提交 `until` 时的记录：从 `head` 时的记录 `rows` 出发，由新到旧反向应用其间各合并提交的 `inversePatch`。
 * `rows` 被就地修改；`ids` 给出时 `rows` 与变更都只含这些记录。`until` 为 null 表示第一次合并之前，没有记录。
 * `until` 不在共享分支上（找不到可信共同起点）时返回 null。
 */
async function revertShared(
  source: ContentSource,
  rows: Records,
  head: string | null,
  until: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  if (until === null) return {};
  const path = await source.path(head, until);
  if (!path.reached) return null;
  const changes = await source.changes(
    path.links.map(link => link.id),
    ids
  );
  for (const link of path.links) revertChanges(rows, changes.get(link.id) ?? []);
  return rows;
}
/** 把任务分支上的提交由旧到新应用到 `rows` 上（就地修改）。 */
function forward(rows: Records, links: readonly Link[], changes: ReadonlyMap<string, ChangeSet[]>): Records {
  for (const link of [...links].reverse()) applyChanges(rows, changes.get(link.id) ?? []);
  return rows;
}
/** 在 `rows`（共同起点时的记录）上应用 `from` 到 `base`（不含）之间的任务提交；`from` 不经过 `base` 时返回 null。 */
async function forwardTask(
  source: ContentSource,
  rows: Records,
  from: string | null,
  base: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  const path = await source.path(from, base);
  if (!path.reached) return null;
  const changes = await source.changes(
    path.links.map(link => link.id),
    ids
  );
  return forward(rows, path.links, changes);
}

/** 共享分支在合并提交 `commit` 时的记录（可只取 `ids`）：当前共享记录加上其后各合并提交的反向变更。找不到时返回 null。 */
export async function sharedRecordsAt(
  source: ContentSource,
  head: string | null,
  commit: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  if (commit === null) return {};
  return revertShared(source, await source.shared(ids), head, commit, ids);
}
/**
 * 任务分支在提交 `commit` 时的记录（可只取 `ids`）：共同起点 `base` 时的共享记录，加上任务在 `base` 之后的各提交变更。
 * 找不到可信共同起点时返回 null。
 */
export async function taskRecordsAt(
  source: ContentSource,
  head: string | null,
  base: string | null,
  commit: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  const start = await sharedRecordsAt(source, head, base, ids);
  return start && forwardTask(source, start, commit, base, ids);
}
/** 一个提交的完整记录：合并提交取共享分支在它那一刻的记录；任务提交取它最近的合并提交祖先的记录加上其间的任务变更。 */
export async function commitRecords(
  source: ContentSource,
  head: string | null,
  meta: Pick<CommitSummary, 'id' | 'mergeSource'>
): Promise<Records> {
  if (meta.mergeSource !== undefined) {
    const shared = await sharedRecordsAt(source, head, meta.id);
    demand(shared, 'ancestry', '找不到可信共同起点');
    return shared;
  }
  const lineage = await source.lineage(meta.id);
  const start = await sharedRecordsAt(source, head, lineage.anchor);
  demand(start, 'ancestry', '找不到可信共同起点');
  const changes = await source.changes(lineage.links.map(link => link.id));
  return forward(start, lineage.links, changes);
}
/** 候选最终结果的记录（可只取 `ids`）：它生成时的目标版本 T 的记录加上它存储的变更。 */
export async function candidateRecords(
  source: ContentSource,
  head: string | null,
  candidate: StoredCandidate,
  ids?: readonly string[]
): Promise<Records> {
  const target = await sharedRecordsAt(source, head, candidate.target, ids);
  demand(target, 'ancestry', '找不到可信共同起点');
  const wanted = ids && new Set(ids);
  return applyChanges(
    target,
    wanted ? candidate.changes.filter(change => wanted.has(change.entityId)) : candidate.changes
  );
}

/** 候选的元数据：去掉存储的字段级变更；最终记录经按需读取获得。 */
export function candidateSummary(candidate: StoredCandidate): CandidateSummary {
  const summary: Partial<StoredCandidate> = { ...candidate };
  delete summary.changes;
  return summary as CandidateSummary;
}
/** 一个提交的完整内容：元数据、它自身的字段级变更与推导出的整份记录；未知 ID 返回 `not_found`。`head` 是共享头。 */
export async function commitContent(source: ContentSource, head: string | null, id: string): Promise<CommitContent> {
  const meta = (await source.commits([id])).get(id);
  demand(meta, 'not_found', '提交不存在');
  const records = await commitRecords(source, head, meta);
  const changes = (await source.changes([id])).get(id) ?? [];
  return { ...commitSummary(meta), changes, records: sortRecords(records) };
}
/** 一个合并候选的完整内容：摘要加上推导出的最终记录。`head` 是共享头。 */
export async function candidateContent(source: ContentSource, head: string | null, candidate: StoredCandidate) {
  return { ...candidateSummary(candidate), records: sortRecords(await candidateRecords(source, head, candidate)) };
}
/** 分页条数：省略时取默认值，否则必须是 1～上限的整数，审计与提交历史共用。 */
export function pageLimit(limit: number | undefined, size: { default: number; maximum: number }): number {
  const value = limit ?? size.default;
  demand(Number.isInteger(value) && value >= 1 && value <= size.maximum, 'invalid', '请求字段不合法');
  return value;
}
/** 提交历史要读的一段分支：从 `head` 走到 `until`（不含）；共享分支走到根，任务分支走到它的共同起点。 */
export interface HistoryBranchRange {
  head: string | null;
  until: string | null;
}
/**
 * 提交历史的一页（从新到旧，只含元数据）。`before` 是上一页的 `nextBefore`，从它的父提交接着读；未知的 `before`
 * 返回 `not_found`。只沿父指针读本页的提交（多读一个判断是否还有更早的），成本只与页大小有关。
 */
export async function historyPage(
  source: ContentSource,
  branch: HistoryBranchRange,
  query: { before?: string; limit?: number }
): Promise<CommitPage> {
  const limit = pageLimit(query.limit, historyPageSize);
  let from = branch.head;
  if (query.before !== undefined) {
    const cursor = (await source.commits([query.before])).get(query.before);
    demand(cursor, 'not_found', '提交不存在');
    from = cursor.parent;
  }
  const commits = await source.history(from, branch.until, limit + 1);
  const page = commits.slice(0, limit);
  return { commits: page, nextBefore: commits.length > limit ? page[page.length - 1].id : null };
}
