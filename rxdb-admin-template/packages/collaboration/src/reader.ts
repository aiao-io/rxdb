import { parseCommitExchangeRecord, type CommitExchangeRecord } from '@aiao/rxdb-plugin-working-tree/exchange';
import { activeBlockers, stageProgress } from './approval.js';
import {
  candidateContent,
  candidateSummary,
  changesOf,
  commitContent,
  commitSummaryOf,
  historyPage,
  lineageOf,
  pageLimit,
  pathOf,
  type ChangeRow,
  type CommitRow,
  type ContentSource,
  type HistoryBranchRange,
  type LinkRow,
  type SharedBranch
} from './derive.js';
import {
  auditPageSize,
  auditSummarySize,
  demand,
  type Audit,
  type AuditPage,
  type AuditQuery,
  type Candidate,
  type CandidateSummary,
  type CommitContent,
  type CommitExchangePage,
  type CommitPage,
  type CommitSummary,
  type DataRow,
  type InvitationSummary,
  type Member,
  type Notice,
  type Permission,
  type Policy,
  type PullRequest,
  type PullRequestDetail,
  type Records,
  type SchemaManifest,
  type SharedRecords,
  type Task
} from './model.js';
import { readPageSize, type Filter, type ReadSource, type RowQuery } from './read-source.js';
import { sortRecords } from './records.js';
import {
  candidateOf,
  candidateSummaryColumns,
  commentOf,
  invitationOf,
  noticeColumns,
  noticeOf,
  prColumns,
  prOf,
  reviewColumns,
  reviewOf,
  taskOf,
  threadOf,
  type CandidateRow,
  type CommentRow,
  type InvitationRow,
  type NoticeRow,
  type PrRow,
  type ReviewRow,
  type TaskRow,
  type ThreadRow
} from './rows.js';
import { parseSchemaManifest } from './schema.js';

/** 一个可访问的团队与应用；`name` 是展示名。 */
export type WorkspaceEntry = { teamId: string; appId: string; name: string };
/** 团队页的取数窗口：最近多少个 PR、本人最近多少个任务与多少条通知，以及无论窗口如何都要带上的任务（例如当前草稿的任务）。 */
export interface TeamWindow {
  prs: number;
  tasks: number;
  notices: number;
  taskIds: readonly string[];
}
/** 团队页的元数据：成员、策略、引用与 PR 列表元数据、管理者可见的邀请与审计总数。 */
export interface TeamPage {
  teamId: string;
  appId: string;
  name: string;
  revision: number;
  schemaVersion: number;
  head: string;
  /** 共享分支的根（初始化写下的 `baseline` 提交）。 */
  root: string;
  policy: Policy;
  members: Member[];
  invitations: InvitationSummary[];
  tasks: Task[];
  prs: PullRequest[];
  earlier: { prs: boolean; tasks: boolean };
  notices: NoticeWindow;
  auditCount: number;
}
/** 本人通知的一个窗口：最近的若干条（时间正序）、窗口之外是否还有更早的，以及未读总数。 */
export interface NoticeWindow {
  notices: Notice[];
  earlier: boolean;
  unread: number;
}
/** 工作区行：治理字段、当前策略的阶段、共享头、修订号与审计总数。 */
interface WorkspaceRow {
  team_id: string;
  app_id: string;
  name: string;
  schema_version: number;
  policy_version: number;
  policy_stages: Policy['stages'];
  head: string;
  root: string;
  revision: string | number;
  audit_count: string | number;
}
interface MemberRow {
  user_id: string;
  email: string;
  permissions: Permission[];
  generation: number;
}
/** 读取函数 `admin_shared_records` 的结果：同一条语句读出的共享头与（可只取部分的）共享记录。 */
interface SharedRows {
  head: string | null;
  records: { record_id: string; entity: string; fields: DataRow['fields'] }[];
}
/** 读取函数 `admin_commit_exchange` 的结果：分支此刻的头（分支不存在时为 null）、这一页的交换记录（JSON 形态）与是否还有。 */
interface ExchangeRows {
  head: string | null;
  more: boolean;
  commits: unknown[];
}
/**
 * 下发接口要读的分支：共享分支，或某个任务分支。每页最多 {@link exchangePageSize}.maximum 个提交。
 */
export type ExchangeBranch = { branch: 'shared' } | { taskId: string };
/** 下发接口的每页提交数：不传时取 `default`，超过 `maximum` 的请求被拒绝。 */
export const exchangePageSize = { default: 100, maximum: 100 } as const;

const workspaceColumns = [
  'team_id',
  'app_id',
  'name',
  'schema_version',
  'policy_version',
  'policy_stages',
  'head',
  'revision',
  'audit_count',
  'root'
];
const taskColumns = ['id', 'name', 'owner_id', 'base', 'origin_task_id', 'head', 'seq'];
const commitColumns = ['id', 'parent_ids', 'kind', 'author_id', 'message', 'candidate_id', 'created_at'];
const threadColumns = [
  'id',
  'pr_id',
  'candidate_id',
  'record_id',
  'field',
  'required',
  'resolved',
  'resolved_candidate_id',
  'revision',
  'seq'
];
const commentColumns = ['id', 'thread_id', 'author_id', 'body', 'deleted', 'revision', 'at', 'seq'];
const invitationColumns = [
  'id',
  'email',
  'permissions',
  'inviter_id',
  'version',
  'expires_at',
  'state',
  'accepted_by',
  'seq'
];
/** 按标识读取时每次带多少个标识：PostgREST 的筛选写在 URL 里，过长会被网关拒绝。 */
const idsPerRequest = 50;
type Sequenced = { seq: string | number };

/**
 * 协作数据的只读访问：浏览器经 Supabase 的只读投影读取团队页、PR 详情、通知、审计、回执与数据模式，提交与候选的内容
 * 由提交图在客户端推导（与服务端同一份 `derive.ts`）。全部不加锁、不写库，可见范围由投影的成员资格条件裁决：
 * 工作区行读不到（不是成员、被撤权或工作区不存在）即按无权访问处理。
 * 多条查询组成的读取按「先读工作区行、再读其余部分」的顺序发出，其余部分都不早于工作区行里的修订号。
 */
export class CollaborationReader {
  /** @param source 返回当前的读取来源；浏览器里随认证客户端建立，测试里直连数据库。 */
  constructor(private readonly source: () => ReadSource) {}

  /** 当前账号可访问的团队与应用。 */
  async workspaces(): Promise<WorkspaceEntry[]> {
    const rows = await this.all<WorkspaceRow>(
      'admin_workspaces',
      {},
      ['team_id', 'app_id', 'name'],
      [
        ['team_id', 'asc'],
        ['app_id', 'asc']
      ]
    );
    return rows.map(row => ({ teamId: row.team_id, appId: row.app_id, name: row.name }));
  }
  /**
   * 团队页：工作区行之后，成员、邀请（只有管理者读得到）、最近的 PR、本人最近的任务与通知并行读取，
   * 再补读这些 PR 的来源任务与 `window.taskIds` 里不在窗口内的任务。体积只与窗口大小、成员数有关，
   * 与讨论、审核、通知与提交的总条数无关。
   */
  async team(workspace: WorkspaceEntry, userId: string, window: TeamWindow): Promise<TeamPage> {
    const row = await this.workspaceRow(workspace);
    const scope = this.scope(workspace);
    const [members, invitations, prs, mine, notices] = await Promise.all([
      this.all<MemberRow & Sequenced>('admin_members', scope, ['user_id', 'email', 'permissions', 'generation', 'seq']),
      this.all<InvitationRow & Sequenced>('admin_invitations', scope, invitationColumns),
      this.window<PrRow & Sequenced>('admin_prs', scope, [...prColumns, 'seq'], window.prs),
      this.window<TaskRow & Sequenced>(
        'admin_tasks',
        { ...scope, owner_id: { eq: userId } },
        taskColumns,
        window.tasks
      ),
      this.notices(workspace, window.notices)
    ]);
    const known = new Set(mine.rows.map(task => task.id));
    const wanted = [...new Set([...prs.rows.map(pr => pr.task_id), ...window.taskIds])].filter(id => !known.has(id));
    const others = await this.byIds<TaskRow & Sequenced>('admin_tasks', scope, taskColumns, wanted);
    const tasks = [...mine.rows, ...others].sort((a, b) => Number(a.seq) - Number(b.seq));
    return {
      teamId: row.team_id,
      appId: row.app_id,
      name: row.name,
      revision: Number(row.revision),
      schemaVersion: row.schema_version,
      head: row.head,
      root: row.root,
      policy: { version: row.policy_version, stages: row.policy_stages },
      members: members.map(member => ({
        id: member.user_id,
        email: member.email,
        permissions: member.permissions,
        generation: member.generation,
        active: true
      })),
      invitations: invitations.map(invitationOf),
      tasks: tasks.map(taskOf),
      prs: prs.rows.map(prOf),
      earlier: { prs: prs.earlier, tasks: mine.earlier },
      notices,
      auditCount: Number(row.audit_count)
    };
  }
  /** 工作区行里的修订号、审计总数与共享头：失效通知只改动了通知、审计或讨论时，团队页只需重读这一行。 */
  async version(workspace: WorkspaceEntry): Promise<{ revision: number; auditCount: number; head: string }> {
    const row = await this.workspaceRow(workspace);
    return { revision: Number(row.revision), auditCount: Number(row.audit_count), head: row.head };
  }
  /**
   * 一个 PR 的详情：候选（不含变更）、审核记录与讨论（含评论），各自按写入顺序全部读取；
   * 阻塞意见与当前候选的阶段进度按 `approval.ts` 的规则，用团队页的成员与策略推导。
   */
  async prDetail(
    workspace: WorkspaceEntry,
    pr: PullRequest,
    team: { members: readonly Member[]; policy: Policy }
  ): Promise<PullRequestDetail> {
    const scope = { ...this.scope(workspace), pr_id: { eq: pr.id } };
    const [candidates, reviews, threads, comments] = await Promise.all([
      this.all<CandidateRow & Sequenced>('admin_candidates', scope, [...candidateSummaryColumns, 'seq']),
      this.all<ReviewRow & Sequenced>('admin_reviews', scope, [...reviewColumns, 'seq']),
      this.all<ThreadRow & Sequenced>('admin_threads', scope, threadColumns),
      this.all<CommentRow & Sequenced>('admin_comments', scope, commentColumns)
    ]);
    const summaries: Record<string, CandidateSummary> = {};
    for (const row of candidates) summaries[row.id] = candidateSummary(candidateOf({ ...row, changes: [] }));
    const list = reviews.map(reviewOf);
    const members = Object.fromEntries(team.members.map(member => [member.id, member]));
    const current = pr.candidateId === null ? undefined : summaries[pr.candidateId];
    return {
      prId: pr.id,
      candidates: summaries,
      reviews: list,
      threads: threads.map(thread =>
        threadOf(thread, comments.filter(comment => comment.thread_id === thread.id).map(commentOf))
      ),
      governance: {
        prId: pr.id,
        blockers: activeBlockers(list, pr.id),
        stages: current ? stageProgress(team.policy, members, list, pr, current) : []
      }
    };
  }
  /** 本人最近的 `limit` 条通知（时间正序）与未读总数；通知投影只返回本人的。 */
  async notices(workspace: WorkspaceEntry, limit: number): Promise<NoticeWindow> {
    const scope = this.scope(workspace);
    const [page, unread] = await Promise.all([
      this.window<NoticeRow & Sequenced>('admin_notifications', scope, [...noticeColumns, 'seq'], limit),
      this.source().count('admin_notifications', { ...scope, read: { eq: false } })
    ]);
    return { notices: page.rows.map(noticeOf), earlier: page.earlier, unread };
  }
  /** 最近的一窗审计事件（{@link auditSummarySize} 条，时间正序）。 */
  async recentAudit(workspace: WorkspaceEntry): Promise<Audit[]> {
    const page = await this.window<{ details: Audit } & Sequenced>(
      'admin_audit',
      this.scope(workspace),
      ['details', 'seq'],
      auditSummarySize
    );
    return page.rows.map(row => row.details);
  }
  /**
   * 审计分页（新到旧）：`before` 是游标事件 ID，只返回比它更早（按写入顺序）的事件；`prId` / `threadId` 按写入时登记的归属筛选。
   * 还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID。未知游标返回 `not_found`，`limit` 须是 1～100 的整数。
   */
  async audit(workspace: WorkspaceEntry, query: AuditQuery): Promise<AuditPage> {
    const limit = pageLimit(query.limit, auditPageSize);
    const where: Record<string, Filter> = { ...this.scope(workspace) };
    if (query.before !== undefined) {
      const [cursor] = await this.source().rows<Sequenced>('admin_audit', {
        columns: ['seq'],
        where: { ...this.scope(workspace), id: { eq: query.before } }
      });
      demand(cursor, 'not_found', '审计事件不存在');
      where['seq'] = { lt: Number(cursor.seq) };
    }
    if (query.prId !== undefined) where['pr_id'] = { eq: query.prId };
    if (query.threadId !== undefined) where['thread_id'] = { eq: query.threadId };
    const rows = await this.source().rows<{ details: Audit }>('admin_audit', {
      columns: ['details'],
      where,
      order: [['seq', 'desc']],
      limit: limit + 1
    });
    const events = rows.slice(0, limit).map(row => row.details);
    return { events, nextBefore: rows.length > limit ? events[events.length - 1].id : null };
  }
  /** 幂等回执：只读得到本人的、保留期内的回执；读不到即 `unknown`。 */
  async receipt(
    workspace: WorkspaceEntry,
    operationId: string
  ): Promise<{ status: 'accepted' | 'unknown'; value?: Record<string, unknown> }> {
    const [row] = await this.source().rows<{ result: Record<string, unknown> }>('admin_receipts', {
      columns: ['result'],
      where: { ...this.scope(workspace), operation_id: { eq: operationId } }
    });
    return row ? { status: 'accepted', value: row.result } : { status: 'unknown' };
  }
  /** 按版本读取登记过的数据模式清单并严格解析；未登记的版本返回 `not_found`。清单只追加、不可修改，可按版本长期缓存。 */
  async schema(workspace: WorkspaceEntry, version: number): Promise<SchemaManifest> {
    const [row] = await this.source().rows<{ manifest: unknown }>('admin_schemas', {
      columns: ['manifest'],
      where: { ...this.scope(workspace), version: { eq: version } }
    });
    demand(row, 'not_found', '数据模式不存在');
    return parseSchemaManifest(row.manifest);
  }
  /** 共享分支在 `head` 时的全部记录；服务端的共享头已不是 `head` 时按「版本已变化」拒绝。 */
  async records(workspace: WorkspaceEntry, head: string): Promise<SharedRecords> {
    return { head, records: sortRecords(await this.content(workspace, head).shared()) };
  }
  /** 一个提交的完整内容（元数据、自身的单元与推导出的整份记录）；`shared` 是当前共享头与根。未知 ID 返回 `not_found`。 */
  commit(workspace: WorkspaceEntry, shared: SharedBranch, id: string): Promise<CommitContent> {
    return commitContent(this.content(workspace, shared.head), shared, id);
  }
  /** 一个合并候选的完整内容（由它的目标版本加存储的变更推导）；`shared` 是当前共享头与根。未知 ID 返回 `not_found`。 */
  async candidate(workspace: WorkspaceEntry, shared: SharedBranch, id: string): Promise<Candidate> {
    const [row] = await this.source().rows<CandidateRow>('admin_candidates', {
      columns: [...candidateSummaryColumns, 'changes'],
      where: { ...this.scope(workspace), id: { eq: id } }
    });
    demand(row, 'not_found', '候选不存在');
    return candidateContent(this.content(workspace, shared.head), shared, candidateOf(row));
  }
  /**
   * 下发接口（只读函数 `admin_commit_exchange`）：`known` 是客户端已有的提交（连同它们的全部祖先都不再下发），返回其后到分支头
   * 为止要导入的交换记录，按平台 `importCommits()` 收的批次排好——父先于子，最后一个是这一页的头，合并提交带进来的侧枝提交排在它前面；
   * 每条都经平台的 `parseCommitExchangeRecord()` 严格解析（`createdAt` 还原成 `Date`），可以原样交给 `importCommits()`。
   * 分页只在分支第一父链上的提交处断开（合并提交与它的侧枝不拆开）；`more` 为 true 时以这一页的头为 `known` 接着读。
   * 可见范围与其余投影相同（可读成员）；不可读时 `forbidden`，任务不存在时 `not_found`，`limit` 须是 1～100 的整数。
   */
  async exchange(
    workspace: WorkspaceEntry,
    branch: ExchangeBranch,
    known: readonly string[],
    limit?: number
  ): Promise<CommitExchangePage<CommitExchangeRecord>> {
    const found = await this.source().call<ExchangeRows>('admin_commit_exchange', {
      p_team_id: workspace.teamId,
      p_app_id: workspace.appId,
      p_ref: 'taskId' in branch ? `tasks/${branch.taskId}` : 'shared',
      p_known: [...known],
      p_limit: pageLimit(limit, exchangePageSize)
    });
    demand(found !== null, 'forbidden', '当前用户没有操作权限');
    demand(found.head !== null, 'not_found', '任务不存在');
    return { head: found.head, more: found.more, commits: found.commits.map(json => parseCommitExchangeRecord(json)) };
  }
  /** 提交历史的一页（从新到旧，只含元数据）：分支从 `range.head` 走到 `range.until`（不含），`before` 接着上一页往前读。 */
  history(
    workspace: WorkspaceEntry,
    range: HistoryBranchRange,
    query: { before?: string; limit?: number }
  ): Promise<CommitPage> {
    return historyPage(this.content(workspace, range.head), range, query);
  }

  private scope(workspace: WorkspaceEntry): Record<string, Filter> {
    return { team_id: { eq: workspace.teamId }, app_id: { eq: workspace.appId } };
  }
  private async workspaceRow(workspace: WorkspaceEntry): Promise<WorkspaceRow> {
    const [row] = await this.source().rows<WorkspaceRow>('admin_workspaces', {
      columns: workspaceColumns,
      where: this.scope(workspace)
    });
    demand(row, 'forbidden', '当前用户没有操作权限');
    return row;
  }
  /**
   * 读出全部匹配的行（默认按写入顺序）：每页 {@link readPageSize} 行，不足一页即读完。这些投影只追加、不删除，
   * 按升序翻页时新写入的行只会出现在末尾，不会让已读的页错位。
   */
  private async all<T extends object>(
    view: string,
    where: Readonly<Record<string, Filter>>,
    columns: readonly string[],
    order: RowQuery['order'] = [['seq', 'asc']]
  ): Promise<T[]> {
    const found: T[] = [];
    for (;;) {
      const page = await this.source().rows<T>(view, {
        columns,
        where,
        order,
        offset: found.length,
        limit: readPageSize
      });
      found.push(...page);
      if (page.length < readPageSize) return found;
    }
  }
  /**
   * 最近的 `limit` 行（按 seq 从新到旧读，返回时恢复成正序），以及窗口之外是否还有更早的行。
   * 窗口超过一页时按 seq 往前接着读。
   */
  private async window<T extends Sequenced>(
    view: string,
    where: Readonly<Record<string, Filter>>,
    columns: readonly string[],
    limit: number
  ): Promise<{ rows: T[]; earlier: boolean }> {
    const found: T[] = [];
    for (;;) {
      const last = found.at(-1);
      const wanted = Math.min(readPageSize, limit + 1 - found.length);
      const page = await this.source().rows<T>(view, {
        columns,
        where: last ? { ...where, seq: { lt: Number(last.seq) } } : where,
        order: [['seq', 'desc']],
        limit: wanted
      });
      found.push(...page);
      if (page.length < wanted || found.length > limit)
        return { rows: found.slice(0, limit).reverse(), earlier: found.length > limit };
    }
  }
  /** 按标识读取若干行（分批，免得 URL 过长）；读不到的标识不出现在结果里。 */
  private async byIds<T extends object>(
    view: string,
    where: Readonly<Record<string, Filter>>,
    columns: readonly string[],
    ids: readonly string[]
  ): Promise<T[]> {
    const found: T[] = [];
    for (let start = 0; start < ids.length; start += idsPerRequest)
      found.push(
        ...(await this.source().rows<T>(view, {
          columns,
          where: { ...where, id: { in: ids.slice(start, start + idsPerRequest) } }
        }))
      );
    return found;
  }
  /** 推导提交与候选内容用的读取：`expected` 是调用方手里的共享头，读到的共享记录必须正是这个版本。 */
  private content(workspace: WorkspaceEntry, expected: string): ContentSource {
    const source = this.source();
    const args = { p_team_id: workspace.teamId, p_app_id: workspace.appId };
    const readable = <T>(value: T | null): T => {
      demand(value !== null, 'forbidden', '当前用户没有操作权限');
      return value;
    };
    return {
      commits: async ids => {
        const rows = await this.byIds<CommitRow>('admin_commits', this.scope(workspace), commitColumns, ids);
        return new Map<string, CommitSummary>(rows.map(row => [row.id, commitSummaryOf(row)]));
      },
      path: async (from, until) => {
        if (from === until) return { links: [], reached: true };
        const rows = readable(
          await source.call<LinkRow[]>('admin_commit_path', { ...args, p_from: from, p_until: until })
        );
        return pathOf(rows, from, until);
      },
      history: async (from, until, limit) => {
        if (from === until || limit < 1) return [];
        const rows = readable(
          await source.call<CommitRow[]>('admin_commit_history', {
            ...args,
            p_from: from,
            p_until: until,
            p_limit: limit
          })
        );
        return rows.map(commitSummaryOf);
      },
      lineage: async id =>
        lineageOf(readable(await source.call<LinkRow[]>('admin_commit_lineage', { ...args, p_id: id })), id),
      changes: async (ids, records) => {
        if (!ids.length) return new Map();
        const rows = readable(
          await source.call<ChangeRow[]>('admin_commit_changes', {
            ...args,
            p_commit_ids: [...ids],
            p_record_ids: records ? [...records] : null
          })
        );
        return changesOf(rows);
      },
      shared: async records => {
        const found = readable(
          await source.call<SharedRows>('admin_shared_records', {
            ...args,
            p_record_ids: records ? [...records] : null
          })
        );
        demand(found.head === expected, 'stale', '版本已变化，请刷新后重试');
        const rows: Records = {};
        for (const row of found.records) rows[row.record_id] = { entity: row.entity, fields: row.fields };
        return rows;
      }
    };
  }
}
