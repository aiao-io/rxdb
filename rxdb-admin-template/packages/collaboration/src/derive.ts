import { applyChanges, revertChanges } from './changes.js';
import {
  CollaborationError,
  demand,
  historyPageSize,
  type CandidateSummary,
  type ChangeSet,
  type ChangeUnit,
  type CommitContent,
  type CommitKind,
  type CommitPage,
  type CommitSummary,
  type Records,
  type StoredCandidate
} from './model.js';
import { sortRecords } from './records.js';

/**
 * 提交图里的一个节点：走图只需要的信息。`parent` 是第一父（根为 null）：每个提交的单元是相对第一父的增量，
 * 推导内容只沿第一父链走，合并提交的第二父（被合并的任务头）不在走图路径上。
 */
export interface Link {
  id: string;
  parent: string | null;
  kind: CommitKind;
}
/** 共享分支上的提交（合并提交与根）：任务提交的血缘走到它为止。 */
export const isSharedKind = (kind: CommitKind) => kind === 'merge' || kind === 'baseline';
/** 沿第一父走出的一段路径：`links` 从新到旧，`reached` 表示走到了目标（目标是 null 时指走到了根）。 */
export interface Path {
  links: Link[];
  reached: boolean;
}
/** 一个任务提交的血缘：任务提交从新到旧，直到最近的共享分支提交（合并提交或根，不含），`anchor` 就是它。 */
export interface Lineage {
  links: Link[];
  anchor: Link;
}
/** 走图查询返回的一行（PostgreSQL 的递归查询与公开读取函数同一形状）：`parent_id` 是第一父。 */
export interface LinkRow {
  id: string;
  parent_id: string | null;
  kind: CommitKind;
}
/** 提交元数据的一行（提交表与公开投影 `admin_commits` 同名列）；`created_at` 是 `toISOString()` 写法的文本。 */
export interface CommitRow {
  id: string;
  parent_ids: string[];
  kind: CommitKind;
  author_id: string | null;
  message: string;
  created_at: string;
  candidate_id: string | null;
}
/** 单元的一行（变更表与公开读取函数同名列）：交换格式单元的九列加上所属提交与序号。 */
export interface ChangeRow {
  commit_id: string;
  sequence: number;
  unit_id: string;
  transaction_id: string | null;
  namespace: string;
  entity: string;
  entity_id: string;
  operation: ChangeSet['operation'];
  patch: ChangeSet['patch'];
  inverse_patch: ChangeSet['inversePatch'];
  origin: ChangeUnit['origin'];
}
/**
 * 共享分支：头与根。根是初始化写下的 `baseline` 提交，内容恒为空记录；推导时走到根就是空记录，
 * 不必沿共享分支一路回退，成本因此与「从根起步」时的读取一样只取决于所问的内容。
 */
export interface SharedBranch {
  head: string;
  root: string;
}

/**
 * 推导提交与候选内容所需的只读存储。服务端的 PostgreSQL 存储、浏览器经 Supabase 公开投影的读取与测试用的内存存储都实现它，
 * 推导因此只有一份代码。读取成本只取决于所问的内容，不取决于工作区里一共有多少提交。
 */
export interface ContentSource {
  /** 按标识读取已存在提交的元数据；不存在的标识不出现在结果里。 */
  commits(ids: readonly string[]): Promise<Map<string, CommitSummary>>;
  /**
   * 从 `from` 沿第一父向前走（含 `from`），到 `until`（不含）为止；`until` 为 null 表示一直走到根。
   * `from` 与 `until` 相同时路径为空且已到达。
   */
  path(from: string, until: string | null): Promise<Path>;
  /**
   * 提交历史的一段：从 `from` 沿第一父向前（含 `from`），到 `until`（不含）或根为止，最多 `limit` 个，从新到旧。
   * 只读元数据，按 `limit` 截断，成本与工作区的提交总数无关。
   */
  history(from: string, until: string | null, limit: number): Promise<CommitSummary[]>;
  /** 从任务提交 `id` 沿第一父向前走到最近的共享分支提交（不含）；`id` 不存在时抛出 `not_found`。 */
  lineage(id: string): Promise<Lineage>;
  /** 读取提交的单元，按提交内的顺序；`records` 给出时只取这些记录的单元。没有单元的提交可以不出现在结果里。 */
  changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeUnit[]>>;
  /** 共享分支当前的记录；`records` 给出时只取这些记录。 */
  shared(records?: readonly string[]): Promise<Records>;
}

/** 提交元数据行转成提交摘要：合并提交另带它依据的候选。 */
export function commitSummaryOf(row: CommitRow): CommitSummary {
  const summary: CommitSummary = {
    id: row.id,
    parentIds: [...row.parent_ids],
    kind: row.kind,
    authorId: row.author_id,
    message: row.message,
    createdAt: row.created_at
  };
  if (row.candidate_id !== null) summary.candidateId = row.candidate_id;
  return summary;
}
/** 单元行按提交分组，保持每个提交内的顺序（行已按提交与序号排好）；九列原样还原，不改写取值。 */
export function changesOf(rows: readonly ChangeRow[]): Map<string, ChangeUnit[]> {
  const found = new Map<string, ChangeUnit[]>();
  for (const row of rows) {
    const list = found.get(row.commit_id) ?? [];
    list.push({
      unitId: row.unit_id,
      transactionId: row.transaction_id,
      namespace: row.namespace,
      entity: row.entity,
      entityId: row.entity_id,
      operation: row.operation,
      patch: row.patch,
      inversePatch: row.inverse_patch,
      origin: row.origin
    });
    found.set(row.commit_id, list);
  }
  return found;
}
/** 由走图查询的行还原从 `from` 到 `until` 的路径：从 `from` 起逐个按第一父找，缺行即未到达，遇环即拒绝。 */
export function pathOf(rows: readonly LinkRow[], from: string, until: string | null): Path {
  const byId = new Map(rows.map(row => [row.id, row]));
  const links: Link[] = [];
  let cursor: string | null = from;
  while (cursor !== null && cursor !== until) {
    const row = byId.get(cursor);
    if (!row) return { links, reached: false };
    demand(links.length <= byId.size, 'ancestry', '提交图不能包含环');
    links.push({ id: row.id, parent: row.parent_id, kind: row.kind });
    cursor = row.parent_id;
  }
  return { links, reached: cursor === until };
}
/** 由血缘查询的行还原任务提交 `id` 的血缘：一直走到第一个共享分支提交（它是锚点，不计入）；走到头也没有即不可信。 */
export function lineageOf(rows: readonly LinkRow[], id: string): Lineage {
  const byId = new Map(rows.map(row => [row.id, row]));
  demand(byId.has(id), 'not_found', '提交不存在');
  const links: Link[] = [];
  let cursor: string | null = id;
  while (cursor !== null) {
    const row = byId.get(cursor);
    demand(row && links.length <= byId.size, 'ancestry', '提交图不能包含环');
    const link = { id: row.id, parent: row.parent_id, kind: row.kind };
    if (isSharedKind(row.kind)) return { links, anchor: link };
    links.push(link);
    cursor = row.parent_id;
  }
  // 任务提交的第一父链没有接到共享分支上：提交图不可信
  throw new CollaborationError('ancestry', '找不到可信共同起点');
}

/**
 * 共享分支在提交 `until` 时的记录：从 `head` 时的记录 `rows` 出发，由新到旧反向应用其间各合并提交的 `inversePatch`。
 * `rows` 被就地修改；`ids` 给出时 `rows` 与单元都只含这些记录。`until` 不在共享分支上（找不到可信共同起点）时返回 null。
 */
async function revertShared(
  source: ContentSource,
  rows: Records,
  head: string,
  until: string,
  ids?: readonly string[]
): Promise<Records | null> {
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
  from: string,
  base: string,
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

/**
 * 共享分支在共享提交 `commit` 时的记录（可只取 `ids`）：当前共享记录加上其后各合并提交的反向变更；`commit` 是根时是空记录。
 * 找不到时返回 null。
 */
export async function sharedRecordsAt(
  source: ContentSource,
  shared: SharedBranch,
  commit: string,
  ids?: readonly string[]
): Promise<Records | null> {
  if (commit === shared.root) return {};
  return revertShared(source, await source.shared(ids), shared.head, commit, ids);
}
/**
 * 任务分支在提交 `commit` 时的记录（可只取 `ids`）：共同起点 `base` 时的共享记录，加上任务在 `base` 之后的各提交单元。
 * 找不到可信共同起点时返回 null。
 */
export async function taskRecordsAt(
  source: ContentSource,
  shared: SharedBranch,
  base: string,
  commit: string,
  ids?: readonly string[]
): Promise<Records | null> {
  const start = await sharedRecordsAt(source, shared, base, ids);
  return start && forwardTask(source, start, commit, base, ids);
}
/**
 * 一个提交的完整记录：根是空记录；合并提交取共享分支在它那一刻的记录；任务提交取它最近的共享分支提交祖先的记录加上其间的任务单元。
 */
export async function commitRecords(
  source: ContentSource,
  shared: SharedBranch,
  meta: Pick<CommitSummary, 'id' | 'kind'>
): Promise<Records> {
  if (isSharedKind(meta.kind)) {
    const records = await sharedRecordsAt(source, shared, meta.id);
    demand(records, 'ancestry', '找不到可信共同起点');
    return records;
  }
  const lineage = await source.lineage(meta.id);
  const start = await sharedRecordsAt(source, shared, lineage.anchor.id);
  demand(start, 'ancestry', '找不到可信共同起点');
  const changes = await source.changes(lineage.links.map(link => link.id));
  return forward(start, lineage.links, changes);
}
/** 候选最终结果的记录（可只取 `ids`）：它生成时的目标版本 T 的记录加上它存储的变更。 */
export async function candidateRecords(
  source: ContentSource,
  shared: SharedBranch,
  candidate: StoredCandidate,
  ids?: readonly string[]
): Promise<Records> {
  const target = await sharedRecordsAt(source, shared, candidate.target, ids);
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
/** 提交的摘要：只挑摘要的字段（存储可能交回带内容指纹的元数据，读取结果里不带它）。 */
export function commitSummary(meta: CommitSummary): CommitSummary {
  const summary: CommitSummary = {
    id: meta.id,
    parentIds: [...meta.parentIds],
    kind: meta.kind,
    authorId: meta.authorId,
    message: meta.message,
    createdAt: meta.createdAt
  };
  if (meta.candidateId !== undefined) summary.candidateId = meta.candidateId;
  return summary;
}
/** 一个提交的完整内容：元数据、它自身的单元与推导出的整份记录；未知 ID 返回 `not_found`。 */
export async function commitContent(source: ContentSource, shared: SharedBranch, id: string): Promise<CommitContent> {
  const meta = (await source.commits([id])).get(id);
  demand(meta, 'not_found', '提交不存在');
  const records = await commitRecords(source, shared, meta);
  const changes = (await source.changes([id])).get(id) ?? [];
  return { ...commitSummary(meta), changes, records: sortRecords(records) };
}
/** 一个合并候选的完整内容：摘要加上推导出的最终记录。 */
export async function candidateContent(source: ContentSource, shared: SharedBranch, candidate: StoredCandidate) {
  return { ...candidateSummary(candidate), records: sortRecords(await candidateRecords(source, shared, candidate)) };
}
/** 分页条数：省略时取默认值，否则必须是 1～上限的整数，审计与提交历史共用。 */
export function pageLimit(limit: number | undefined, size: { default: number; maximum: number }): number {
  const value = limit ?? size.default;
  demand(Number.isInteger(value) && value >= 1 && value <= size.maximum, 'invalid', '请求字段不合法');
  return value;
}
/** 提交历史要读的一段分支：从 `head` 走到 `until`（不含）；共享分支走到根，任务分支走到它的共同起点。 */
export interface HistoryBranchRange {
  head: string;
  until: string;
}
/**
 * 提交历史的一页（从新到旧，只含元数据）。`before` 是上一页的 `nextBefore`，从它的第一父接着读；未知的 `before`
 * 返回 `not_found`。只沿第一父读本页的提交（多读一个判断是否还有更早的），成本只与页大小有关。
 */
export async function historyPage(
  source: ContentSource,
  branch: HistoryBranchRange,
  query: { before?: string; limit?: number }
): Promise<CommitPage> {
  const limit = pageLimit(query.limit, historyPageSize);
  let from: string | null = branch.head;
  if (query.before !== undefined) {
    const cursor = (await source.commits([query.before])).get(query.before);
    demand(cursor, 'not_found', '提交不存在');
    from = cursor.parentIds[0] ?? null;
  }
  const commits = from === null || from === branch.until ? [] : await source.history(from, branch.until, limit + 1);
  const page = commits.slice(0, limit);
  return { commits: page, nextBefore: commits.length > limit ? page[page.length - 1].id : null };
}
