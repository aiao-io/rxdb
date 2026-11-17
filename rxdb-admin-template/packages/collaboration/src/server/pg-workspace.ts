import type { PoolClient } from 'pg';
import {
  auditPageSize,
  auditSummarySize,
  demand,
  receiptRetentionMs,
  type Audit,
  type AuditPage,
  type AuditQuery,
  type Comment,
  type Invitation,
  type Member,
  type Notice,
  type Permission,
  type PullRequest,
  type Receipt,
  type Review,
  type SchemaManifest,
  type StoredCandidate,
  type Task,
  type Thread,
  type Workspace
} from '../model.js';
import { parseSchemaManifest } from '../schema.js';
import { pageLimit } from './engine.js';
import type { Effects, MergeLog } from './plan.js';
import type { HeadMove, RowChanges, ThreadComment, ThreadRow, WorkspaceChanges } from './state-changes.js';
import type { GovernanceLock, RefLock, WorkspaceLoader } from './store.js';

/** 只需要 `query` 的数据库连接：命令与只读查询都在调用方开好的事务里执行。 */
export type Queryable = Pick<PoolClient, 'query'>;
/** 每个写事务最多清理的过期回执条数：清理成本有上限，不会因为积压而让某一条命令变慢。 */
export const receiptSweepLimit = 20;

const lockClause: Record<RefLock, string> = { update: ' FOR UPDATE', share: ' FOR SHARE', none: '' };
const sharedRef = 'shared';
/** 任务引用的名字：`tasks/<任务 ID>`（任务 ID 不含斜杠）。 */
export const taskRef = (taskId: string) => `tasks/${taskId}`;
const asNumber = (value: string | number) => Number(value);

/**
 * 只含治理字段的空局部状态：其余集合由加载器按需填入。修订号不在治理行里，命令只看它是否前进。
 * 数据模式在读到治理行之前是没有实体的占位（版本 0），读到之后换成当前版本的清单；引擎只在治理行读到之后运行。
 */
export function emptyState(teamId: string, appId: string): Workspace {
  return {
    teamId,
    appId,
    name: '',
    bootstrapKey: '',
    initialAdminId: '',
    schemaVersion: 0,
    schema: { schemaVersion: 0, entities: [] },
    revision: 0,
    head: null,
    policy: { version: 1, stages: [] },
    members: {},
    tasks: {},
    prs: {},
    candidates: {},
    invitations: {},
    reviews: [],
    threads: {},
    notifications: [],
    presence: [],
    receipts: {},
    audit: []
  };
}

interface GovernanceRow {
  name: string;
  bootstrap_key: string;
  initial_admin_id: string;
  schema_version: number;
  policy_version: number;
}
interface PrRow {
  id: string;
  task_id: string;
  author_id: string;
  title: string;
  description: string;
  target: 'shared';
  status: PullRequest['status'];
  revision: number;
  candidate_id: string | null;
  subscribers: string[];
}
interface TaskRow {
  id: string;
  name: string;
  owner_id: string;
  base: string | null;
  origin_task_id: string | null;
  head: string | null;
}
interface CandidateRow {
  id: string;
  pr_id: string;
  base: string | null;
  source: string;
  target: string | null;
  schema_version: number;
  policy_version: number;
  resolutions: StoredCandidate['resolutions'];
  conflicts: StoredCandidate['conflicts'];
  checks: StoredCandidate['checks'];
  actor_id: string;
  at: string;
  changes: StoredCandidate['changes'];
}
interface ReviewRow {
  id: string;
  pr_id: string;
  reviewer_id: string;
  source: string | null;
  candidate_id: string | null;
  stage_id: string;
  decision: Review['decision'];
  generation: number;
  revision: number;
  reason: string;
  at: string;
  dismissed_reviewer_id: string | null;
}
interface ThreadRowData {
  id: string;
  pr_id: string;
  candidate_id: string | null;
  record_id: string | null;
  field: string | null;
  required: boolean;
  resolved: boolean;
  resolved_candidate_id: string | null;
  revision: number;
  comments: Comment[];
}
interface NoticeRow {
  id: string;
  user_id: string;
  pr_id: string;
  thread_id: string | null;
  candidate_id: string | null;
  read: boolean;
  at: string;
}
interface InvitationRow {
  id: string;
  email: string;
  permissions: Permission[];
  inviter_id: string;
  token_hash: string;
  version: number;
  expires_at: string;
  state: Invitation['state'];
  accepted_by: string | null;
}
interface ReceiptRow {
  operation_id: string;
  actor_id: string;
  fingerprint: string;
  result: Record<string, unknown>;
  at: string;
}

const prColumns = 'id, task_id, author_id, title, description, target, status, revision, candidate_id, subscribers';
const taskSelect = `SELECT t.id, t.name, t.owner_id, t.base, t.origin_task_id, r.head
  FROM admin_private.tasks t
  JOIN admin_private.refs r ON r.team_id = t.team_id AND r.app_id = t.app_id AND r.ref = 'tasks/' || t.id`;
const candidateColumns =
  'id, pr_id, base, source, target, schema_version, policy_version, resolutions, conflicts, checks, actor_id, at, changes';
const reviewColumns =
  'id, pr_id, reviewer_id, source, candidate_id, stage_id, decision, generation, revision, reason, at, dismissed_reviewer_id';
const threadSelect = `SELECT th.id, th.pr_id, th.candidate_id, th.record_id, th.field, th.required, th.resolved,
    th.resolved_candidate_id, th.revision,
    coalesce((SELECT json_agg(json_build_object('id', c.id, 'authorId', c.author_id, 'body', c.body, 'deleted', c.deleted,
        'revision', c.revision, 'at', c.at) ORDER BY c.seq)
      FROM admin_private.comments c WHERE c.team_id = th.team_id AND c.app_id = th.app_id AND c.thread_id = th.id),
      '[]'::json) AS comments
  FROM admin_private.threads th`;
const noticeColumns = 'id, user_id, pr_id, thread_id, candidate_id, read, at';
const invitationColumns = 'id, email, permissions, inviter_id, token_hash, version, expires_at, state, accepted_by';

const prOf = (row: PrRow): PullRequest => ({
  id: row.id,
  taskId: row.task_id,
  authorId: row.author_id,
  title: row.title,
  description: row.description,
  target: row.target,
  status: row.status,
  revision: row.revision,
  candidateId: row.candidate_id,
  subscribers: row.subscribers
});
const taskOf = (row: TaskRow): Task => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  base: row.base,
  head: row.head,
  originTaskId: row.origin_task_id
});
const candidateOf = (row: CandidateRow): StoredCandidate => ({
  id: row.id,
  prId: row.pr_id,
  base: row.base,
  source: row.source,
  target: row.target,
  schemaVersion: row.schema_version,
  policyVersion: row.policy_version,
  resolutions: row.resolutions,
  conflicts: row.conflicts,
  checks: row.checks,
  actorId: row.actor_id,
  at: asNumber(row.at),
  changes: row.changes
});
const reviewOf = (row: ReviewRow): Review => {
  const review: Review = {
    id: row.id,
    source: row.source,
    prId: row.pr_id,
    reviewerId: row.reviewer_id,
    candidateId: row.candidate_id,
    stageId: row.stage_id,
    decision: row.decision,
    generation: row.generation,
    revision: row.revision,
    reason: row.reason,
    at: asNumber(row.at)
  };
  if (row.dismissed_reviewer_id !== null) review.dismissedReviewerId = row.dismissed_reviewer_id;
  return review;
};
const threadOf = (row: ThreadRowData): Thread => ({
  id: row.id,
  prId: row.pr_id,
  candidateId: row.candidate_id,
  recordId: row.record_id,
  field: row.field,
  required: row.required,
  resolved: row.resolved,
  resolvedCandidateId: row.resolved_candidate_id,
  revision: row.revision,
  comments: row.comments
});
const noticeOf = (row: NoticeRow): Notice => ({
  id: row.id,
  userId: row.user_id,
  prId: row.pr_id,
  threadId: row.thread_id,
  candidateId: row.candidate_id,
  read: row.read,
  at: asNumber(row.at)
});
const invitationOf = (row: InvitationRow): Invitation => ({
  id: row.id,
  email: row.email,
  permissions: row.permissions,
  inviterId: row.inviter_id,
  tokenHash: row.token_hash,
  version: row.version,
  expiresAt: asNumber(row.expires_at),
  state: row.state,
  acceptedBy: row.accepted_by
});
const receiptOf = (row: ReceiptRow): Receipt => ({
  operationId: row.operation_id,
  actorId: row.actor_id,
  fingerprint: row.fingerprint,
  value: row.result,
  at: asNumber(row.at)
});

/**
 * 工作区各表的 PostgreSQL 读取，绑定一个团队下的一个应用与一个连接，随该连接所在的事务执行。
 * 命令路径（{@link PgWorkspaceLoader}）按调用加行锁，只读查询（{@link PgWorkspaceReader}）不加锁、在只读快照里执行。
 * 每个方法只发一两条查询，范围由所问的行决定，不扫描工作区的历史。
 */
class PgWorkspaceRows {
  state: Workspace;
  constructor(
    protected readonly client: Queryable,
    protected readonly teamId: string,
    protected readonly appId: string
  ) {
    this.state = emptyState(teamId, appId);
  }
  async governance(lock: GovernanceLock): Promise<boolean> {
    // 治理行单独加锁：锁等待之后的读取都是新语句，必然看到在此之前提交的成员与策略变更
    const found = await this.query<GovernanceRow>(
      `SELECT name, bootstrap_key, initial_admin_id, schema_version, policy_version
       FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2${lockClause[lock]}`
    );
    const row = found.rows[0];
    if (!row) return false;
    const rest = await this.query<{
      stages: Workspace['policy']['stages'];
      schema: unknown;
      head: string | null;
      members: Member[];
    }>(
      `SELECT
         (SELECT stages FROM admin_private.policies WHERE team_id = $1 AND app_id = $2 AND version = $3) AS stages,
         (SELECT manifest FROM admin_private.schemas WHERE team_id = $1 AND app_id = $2 AND version = $4) AS schema,
         (SELECT head FROM admin_private.refs WHERE team_id = $1 AND app_id = $2 AND ref = 'shared') AS head,
         (SELECT coalesce(json_agg(json_build_object('id', user_id, 'email', email, 'permissions', permissions,
             'generation', generation, 'active', active) ORDER BY seq), '[]'::json)
          FROM admin_private.memberships WHERE team_id = $1 AND app_id = $2) AS members`,
      [row.policy_version, row.schema_version]
    );
    const { stages, schema, head, members } = rest.rows[0];
    // 当前版本的清单随初始化与登记命令写入，缺了说明数据已损坏，按内部错误处理
    if (schema === null) throw new Error(`The schema ${row.schema_version} of ${this.teamId}/${this.appId} is missing`);
    Object.assign(this.state, {
      name: row.name,
      bootstrapKey: row.bootstrap_key,
      initialAdminId: row.initial_admin_id,
      schemaVersion: row.schema_version,
      schema: parseSchemaManifest(schema),
      policy: { version: row.policy_version, stages },
      head,
      members: Object.fromEntries(members.map(member => [member.id, member]))
    });
    return true;
  }
  async receipt(operationId: string, now: number): Promise<boolean> {
    const found = await this.query<ReceiptRow>(
      `SELECT operation_id, actor_id, fingerprint, result, at FROM admin_private.operations
       WHERE team_id = $1 AND app_id = $2 AND operation_id = $3 AND at > $4`,
      [operationId, now - receiptRetentionMs]
    );
    for (const row of found.rows) this.state.receipts[row.operation_id] = receiptOf(row);
    return found.rows.length > 0;
  }
  async prs(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    await this.readPrs(`id = ANY($3::text[]) ORDER BY id`, [[...ids]]);
  }
  async taskPrs(taskId: string): Promise<void> {
    await this.readPrs(`task_id = $3 ORDER BY id`, [taskId]);
  }
  async task(id: string, lock: RefLock): Promise<void> {
    const found = await this.query<TaskRow>(
      `${taskSelect} WHERE t.team_id = $1 AND t.app_id = $2 AND t.id = $3${lock === 'none' ? '' : `${lockClause[lock]} OF r`}`,
      [id]
    );
    for (const row of found.rows) this.state.tasks[row.id] = taskOf(row);
  }
  async candidates(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.query<CandidateRow>(
      `SELECT ${candidateColumns} FROM admin_private.candidates
       WHERE team_id = $1 AND app_id = $2 AND id = ANY($3::text[]) ORDER BY seq`,
      [[...ids]]
    );
    for (const row of found.rows) this.state.candidates[row.id] = candidateOf(row);
  }
  /** 带团队与应用参数（`$1`、`$2`）的查询，其余参数从 `$3` 起。 */
  protected query<R extends object>(sql: string, params: unknown[] = []) {
    return this.client.query<R>(sql, [this.teamId, this.appId, ...params]);
  }
  protected async readPrs(where: string, params: unknown[], lock = ''): Promise<PullRequest[]> {
    const found = await this.query<PrRow>(
      `SELECT ${prColumns} FROM admin_private.prs WHERE team_id = $1 AND app_id = $2 AND ${where}${lock}`,
      params
    );
    const prs = found.rows.map(prOf);
    for (const pr of prs) this.state.prs[pr.id] = pr;
    return prs;
  }
  protected async readThreads(where: string, params: unknown[]): Promise<void> {
    const found = await this.query<ThreadRowData>(
      `${threadSelect} WHERE th.team_id = $1 AND th.app_id = $2 AND ${where} ORDER BY th.seq`,
      params
    );
    for (const row of found.rows) this.state.threads[row.id] = threadOf(row);
  }
}

/**
 * 命令事务的 PostgreSQL 加载器：按调用顺序加行锁（治理行 → PR 行 → 引用行），把命令涉及的行读进局部状态。
 * 引擎在局部状态上裁决，之后由 {@link PgWorkspaceWriter} 只写回差异。
 */
export class PgWorkspaceLoader extends PgWorkspaceRows implements WorkspaceLoader {
  async lockPrs(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    await this.readPrs(`id = ANY($3::text[]) ORDER BY id`, [[...ids]], ' FOR UPDATE');
  }
  async lockTaskPrs(taskId: string): Promise<string[]> {
    return (await this.readPrs(`task_id = $3 ORDER BY id`, [taskId], ' FOR UPDATE')).map(pr => pr.id);
  }
  async taskPrIds(taskId: string): Promise<string[]> {
    const found = await this.query<{ id: string }>(
      'SELECT id FROM admin_private.prs WHERE team_id = $1 AND app_id = $2 AND task_id = $3 ORDER BY id',
      [taskId]
    );
    return found.rows.map(row => row.id);
  }
  async sharedRef(lock: RefLock): Promise<void> {
    const found = await this.query<{ head: string | null }>(
      `SELECT head FROM admin_private.refs WHERE team_id = $1 AND app_id = $2 AND ref = '${sharedRef}'${lockClause[lock]}`
    );
    // 共享引用随工作区初始化建立，缺了说明数据已损坏，按内部错误处理，不当作空分支
    const row = found.rows[0];
    if (!row) throw new Error(`The shared ref of ${this.teamId}/${this.appId} is missing`);
    this.state.head = row.head;
  }
  threads(ids: readonly string[]): Promise<void> {
    return ids.length ? this.readThreads('th.id = ANY($3::text[])', [[...ids]]) : Promise.resolve();
  }
  prThreads(prId: string): Promise<void> {
    return this.readThreads('th.pr_id = $3', [prId]);
  }
  async prReviews(prId: string): Promise<void> {
    const found = await this.query<ReviewRow>(
      `SELECT ${reviewColumns} FROM admin_private.reviews WHERE team_id = $1 AND app_id = $2 AND pr_id = $3 ORDER BY seq`,
      [prId]
    );
    this.state.reviews = found.rows.map(reviewOf);
  }
  async invitation(id: string): Promise<void> {
    const found = await this.query<InvitationRow>(
      `SELECT ${invitationColumns} FROM admin_private.invitations WHERE team_id = $1 AND app_id = $2 AND id = $3`,
      [id]
    );
    for (const row of found.rows) this.state.invitations[row.id] = invitationOf(row);
  }
  async notification(id: string, userId: string): Promise<void> {
    const found = await this.query<NoticeRow>(
      `SELECT ${noticeColumns} FROM admin_private.notifications
       WHERE team_id = $1 AND app_id = $2 AND id = $3 AND user_id = $4`,
      [id, userId]
    );
    this.state.notifications.push(...found.rows.map(noticeOf));
  }
  async threadPr(threadId: string): Promise<string | undefined> {
    const found = await this.query<{ pr_id: string }>(
      'SELECT pr_id FROM admin_private.threads WHERE team_id = $1 AND app_id = $2 AND id = $3',
      [threadId]
    );
    return found.rows[0]?.pr_id;
  }
  async prTask(prId: string): Promise<string | undefined> {
    const found = await this.query<{ task_id: string }>(
      'SELECT task_id FROM admin_private.prs WHERE team_id = $1 AND app_id = $2 AND id = $3',
      [prId]
    );
    return found.rows[0]?.task_id;
  }
}

/** 摘要所需的局部状态：除回执、他人通知与早于最近一窗的审计之外的全部元数据，以及审计总数。 */
export interface SummaryState {
  state: Workspace;
  auditCount: number;
}

/**
 * 只读查询的 PostgreSQL 读取：不加锁、不写库，调用方在只读的可重复读事务里使用，
 * 多条语句看到的是同一份已提交快照（合并同事务更新共享头与共享记录，读者不会看到合并到一半）。
 */
export class PgWorkspaceReader extends PgWorkspaceRows {
  /** 治理字段、成员与共享头；工作区不存在时返回 false。 */
  open(): Promise<boolean> {
    return this.governance('none');
  }
  /** 摘要的全部内容：任务、PR、候选（不含变更）、审核、讨论、本人的通知、邀请、最近一窗审计、修订号与审计总数。 */
  async summary(userId: string): Promise<SummaryState> {
    const version = await this.query<{ revision: string; audit_count: string }>(
      'SELECT revision, audit_count FROM public.admin_workspace_versions WHERE team_id = $1 AND app_id = $2'
    );
    this.state.revision = asNumber(version.rows[0].revision);
    const tasks = await this.query<TaskRow>(`${taskSelect} WHERE t.team_id = $1 AND t.app_id = $2 ORDER BY t.seq`);
    this.state.tasks = Object.fromEntries(tasks.rows.map(row => [row.id, taskOf(row)]));
    await this.readPrs('true ORDER BY seq', []);
    const candidates = await this.query<CandidateRow>(
      `SELECT ${candidateColumns.replace('changes', `'[]'::jsonb AS changes`)} FROM admin_private.candidates
       WHERE team_id = $1 AND app_id = $2 ORDER BY seq`
    );
    this.state.candidates = Object.fromEntries(candidates.rows.map(row => [row.id, candidateOf(row)]));
    const reviews = await this.query<ReviewRow>(
      `SELECT ${reviewColumns} FROM admin_private.reviews WHERE team_id = $1 AND app_id = $2 ORDER BY seq`
    );
    this.state.reviews = reviews.rows.map(reviewOf);
    await this.readThreads('true', []);
    const notices = await this.query<NoticeRow>(
      `SELECT ${noticeColumns} FROM admin_private.notifications
       WHERE team_id = $1 AND app_id = $2 AND user_id = $3 ORDER BY seq`,
      [userId]
    );
    this.state.notifications = notices.rows.map(noticeOf);
    const invitations = await this.query<InvitationRow>(
      `SELECT ${invitationColumns} FROM admin_private.invitations WHERE team_id = $1 AND app_id = $2 ORDER BY seq`
    );
    this.state.invitations = Object.fromEntries(invitations.rows.map(row => [row.id, invitationOf(row)]));
    const audit = await this.query<{ details: Audit }>(
      `SELECT details FROM public.admin_audit WHERE team_id = $1 AND app_id = $2 ORDER BY seq DESC LIMIT $3`,
      [auditSummarySize]
    );
    this.state.audit = audit.rows.map(row => row.details).reverse();
    return { state: this.state, auditCount: asNumber(version.rows[0].audit_count) };
  }
  /** 读取一个候选（含存储的变更）。 */
  candidate(id: string): Promise<void> {
    return this.candidates([id]);
  }
  /** 按版本读取登记过的数据模式清单；没有登记过的版本为 undefined。 */
  async schema(version: number): Promise<SchemaManifest | undefined> {
    const found = await this.query<{ manifest: unknown }>(
      'SELECT manifest FROM admin_private.schemas WHERE team_id = $1 AND app_id = $2 AND version = $3',
      [version]
    );
    return found.rows[0] ? parseSchemaManifest(found.rows[0].manifest) : undefined;
  }
  /** 读取一个 PR 与它的来源任务。 */
  async prWithTask(prId: string): Promise<void> {
    await this.prs([prId]);
    const pr = this.state.prs[prId];
    if (pr) await this.task(pr.taskId, 'none');
  }
  /**
   * 审计分页，与引擎的 `auditPage` 同一份规则：`before` 是游标事件 ID，只返回比它更早（按写入顺序）的事件，
   * `prId` / `threadId` 按写入时登记的归属筛选，走 (team, app, pr_id|thread_id, seq) 索引，成本只与页大小有关。
   */
  async auditPage(query: AuditQuery): Promise<AuditPage> {
    const limit = pageLimit(query.limit, auditPageSize);
    const conditions = ['team_id = $1', 'app_id = $2'];
    const params: unknown[] = [];
    const add = (condition: string, value: unknown) => {
      params.push(value);
      conditions.push(condition.replace('?', `$${params.length + 2}`));
    };
    if (query.before !== undefined) {
      const cursor = await this.query<{ seq: string }>(
        'SELECT seq FROM public.admin_audit WHERE team_id = $1 AND app_id = $2 AND id = $3',
        [query.before]
      );
      demand(cursor.rows[0], 'not_found', '审计事件不存在');
      add('seq < ?', cursor.rows[0].seq);
    }
    if (query.prId !== undefined) add('pr_id = ?', query.prId);
    if (query.threadId !== undefined) add('thread_id = ?', query.threadId);
    params.push(limit + 1);
    const found = await this.query<{ details: Audit }>(
      `SELECT details FROM public.admin_audit WHERE ${conditions.join(' AND ')}
       ORDER BY seq DESC LIMIT $${params.length + 2}`,
      params
    );
    const events = found.rows.slice(0, limit).map(row => row.details);
    return { events, nextBefore: found.rows.length > limit ? events[events.length - 1].id : null };
  }
  /** 读取保留期内的一条回执，不论操作者是谁；是否可读由调用方按操作者裁决。 */
  async receiptRow(operationId: string, now: number): Promise<Receipt | undefined> {
    await this.receipt(operationId, now);
    return Object.hasOwn(this.state.receipts, operationId) ? this.state.receipts[operationId] : undefined;
  }
}

/** 按列名把对象数组批量写入一张表：一条 `INSERT ... SELECT FROM jsonb_to_recordset`，`suffix` 是冲突处理等附加子句。 */
async function insertRows(
  client: Queryable,
  scope: [teamId: string, appId: string],
  table: string,
  columns: [name: string, type: string][],
  rows: Record<string, unknown>[],
  suffix = ''
): Promise<void> {
  if (!rows.length) return;
  const names = columns.map(([name]) => name);
  await client.query(
    `INSERT INTO ${table}(team_id, app_id, ${names.join(', ')})
     SELECT $1, $2, ${names.map(name => `x.${name}`).join(', ')}
     FROM jsonb_to_recordset($3::jsonb) AS x(${columns.map(([name, type]) => `${name} ${type}`).join(', ')})${suffix}`,
    [...scope, JSON.stringify(rows)]
  );
}
/** 按主键批量更新一张表的若干列：一条 `UPDATE ... FROM jsonb_to_recordset`。 */
async function updateRows(
  client: Queryable,
  scope: [teamId: string, appId: string],
  table: string,
  key: string,
  columns: [name: string, type: string][],
  rows: Record<string, unknown>[]
): Promise<void> {
  if (!rows.length) return;
  await client.query(
    `UPDATE ${table} AS t SET ${columns.map(([name]) => `${name} = x.${name}`).join(', ')}
     FROM jsonb_to_recordset($3::jsonb) AS x(${key} text, ${columns.map(([name, type]) => `${name} ${type}`).join(', ')})
     WHERE t.team_id = $1 AND t.app_id = $2 AND t.${key} = x.${key}`,
    [...scope, JSON.stringify(rows)]
  );
}

const prWrite: [string, string][] = [
  ['task_id', 'text'],
  ['author_id', 'text'],
  ['title', 'text'],
  ['description', 'text'],
  ['target', 'text'],
  ['status', 'text'],
  ['revision', 'int'],
  ['candidate_id', 'text'],
  ['subscribers', 'text[]']
];
const prRow = (pr: PullRequest) => ({
  id: pr.id,
  task_id: pr.taskId,
  author_id: pr.authorId,
  title: pr.title,
  description: pr.description,
  target: pr.target,
  status: pr.status,
  revision: pr.revision,
  candidate_id: pr.candidateId,
  subscribers: pr.subscribers
});
const threadWrite: [string, string][] = [
  ['candidate_id', 'text'],
  ['record_id', 'text'],
  ['field', 'text'],
  ['required', 'boolean'],
  ['resolved', 'boolean'],
  ['resolved_candidate_id', 'text'],
  ['revision', 'int']
];
const threadRow = (thread: ThreadRow) => ({
  id: thread.id,
  pr_id: thread.prId,
  candidate_id: thread.candidateId,
  record_id: thread.recordId,
  field: thread.field,
  required: thread.required,
  resolved: thread.resolved,
  resolved_candidate_id: thread.resolvedCandidateId,
  revision: thread.revision
});
const commentWrite: [string, string][] = [
  ['author_id', 'text'],
  ['body', 'text'],
  ['deleted', 'boolean'],
  ['revision', 'int'],
  ['at', 'bigint']
];
const commentRow = (comment: ThreadComment) => ({
  id: comment.id,
  thread_id: comment.threadId,
  author_id: comment.authorId,
  body: comment.body,
  deleted: comment.deleted,
  revision: comment.revision,
  at: comment.at
});

/**
 * 把一条命令的结果写回 PostgreSQL：只写局部状态差异列出的行与命令效果，顺序固定——业务行 → 引用（比较交换）→
 * 审计 → 回执 → 有界清理过期回执 → 版本行。版本行是最后一步：所有写事务只在这一步排队，持锁时间只覆盖提交本身。
 */
export class PgWorkspaceWriter {
  private readonly scope: [string, string];
  constructor(
    private readonly client: Queryable,
    teamId: string,
    appId: string
  ) {
    this.scope = [teamId, appId];
  }
  async save(changes: WorkspaceChanges, effects: Effects, now: number): Promise<void> {
    await this.members(changes.members);
    await this.invitations(changes.invitations);
    if (changes.policy) await this.policy(changes.policy);
    if (changes.schema) await this.schema(changes.schema);
    await this.tasks(changes.tasks);
    for (const [taskId, move] of Object.entries(changes.heads)) await this.advanceTask(taskId, move);
    await this.prs(changes.prs);
    await this.candidates(changes.candidates);
    await this.reviews(changes.reviews);
    await this.threads(changes.threads, changes.comments);
    await this.notifications(changes.notifications);
    if (changes.shared) await this.advanceShared(changes.shared);
    if (effects.log) await this.changeLog(effects.log);
    await this.audit(changes);
    await this.receipts(changes.receipts);
    if (!changes.revised) return;
    await this.sweep(now);
    await this.client.query(
      `UPDATE public.admin_workspace_versions SET revision = revision + 1, audit_count = audit_count + $3
       WHERE team_id = $1 AND app_id = $2`,
      [...this.scope, changes.audit.length]
    );
  }
  /** 成员变更：写回成员行；失去读权限的成员同时移出在线状态。 */
  private async members(members: Member[]): Promise<void> {
    await insertRows(
      this.client,
      this.scope,
      'admin_private.memberships',
      [
        ['user_id', 'text'],
        ['email', 'text'],
        ['permissions', 'text[]'],
        ['generation', 'int'],
        ['active', 'boolean']
      ],
      members.map(member => ({ user_id: member.id, ...member })),
      ` ON CONFLICT (team_id, app_id, user_id) DO UPDATE SET email = EXCLUDED.email, permissions = EXCLUDED.permissions,
          generation = EXCLUDED.generation, active = EXCLUDED.active`
    );
    const revoked = members.filter(member => !member.active || !member.permissions.includes('read'));
    if (revoked.length)
      await this.client.query(
        'DELETE FROM public.admin_presence WHERE team_id = $1 AND app_id = $2 AND user_id = ANY($3::text[])',
        [...this.scope, revoked.map(member => member.id)]
      );
  }
  private invitations(invitations: Invitation[]): Promise<void> {
    return insertRows(
      this.client,
      this.scope,
      'admin_private.invitations',
      [
        ['id', 'text'],
        ['email', 'text'],
        ['permissions', 'text[]'],
        ['inviter_id', 'text'],
        ['token_hash', 'text'],
        ['version', 'int'],
        ['expires_at', 'bigint'],
        ['state', 'text'],
        ['accepted_by', 'text']
      ],
      invitations.map(item => ({
        id: item.id,
        email: item.email,
        permissions: item.permissions,
        inviter_id: item.inviterId,
        token_hash: item.tokenHash,
        version: item.version,
        expires_at: item.expiresAt,
        state: item.state,
        accepted_by: item.acceptedBy
      })),
      ` ON CONFLICT (team_id, app_id, id) DO UPDATE SET email = EXCLUDED.email, permissions = EXCLUDED.permissions,
          inviter_id = EXCLUDED.inviter_id, token_hash = EXCLUDED.token_hash, version = EXCLUDED.version,
          expires_at = EXCLUDED.expires_at, state = EXCLUDED.state, accepted_by = EXCLUDED.accepted_by`
    );
  }
  /** 新策略版本只追加，治理行指向它；只有持治理行排他锁的策略命令会走到这里。 */
  private async policy(policy: Workspace['policy']): Promise<void> {
    await this.client.query(
      'INSERT INTO admin_private.policies(team_id, app_id, version, stages) VALUES ($1, $2, $3, $4)',
      [...this.scope, policy.version, JSON.stringify(policy.stages)]
    );
    await this.client.query(
      'UPDATE admin_private.workspaces SET policy_version = $3 WHERE team_id = $1 AND app_id = $2',
      [...this.scope, policy.version]
    );
  }
  /** 新的数据模式版本只追加，治理行指向它；只有持治理行排他锁的登记命令会走到这里。 */
  private async schema(schema: SchemaManifest): Promise<void> {
    await this.client.query(
      'INSERT INTO admin_private.schemas(team_id, app_id, version, manifest) VALUES ($1, $2, $3, $4)',
      [...this.scope, schema.schemaVersion, JSON.stringify(schema)]
    );
    await this.client.query(
      'UPDATE admin_private.workspaces SET schema_version = $3 WHERE team_id = $1 AND app_id = $2',
      [...this.scope, schema.schemaVersion]
    );
  }
  private async tasks(tasks: Task[]): Promise<void> {
    await insertRows(
      this.client,
      this.scope,
      'admin_private.tasks',
      [
        ['id', 'text'],
        ['name', 'text'],
        ['owner_id', 'text'],
        ['base', 'text'],
        ['origin_task_id', 'text']
      ],
      tasks.map(task => ({
        id: task.id,
        name: task.name,
        owner_id: task.ownerId,
        base: task.base,
        origin_task_id: task.originTaskId
      }))
    );
    await insertRows(
      this.client,
      this.scope,
      'admin_private.refs',
      [
        ['ref', 'text'],
        ['head', 'text']
      ],
      tasks.map(task => ({ ref: taskRef(task.id), head: task.head }))
    );
  }
  /** 推进任务引用：按期望的旧头比较交换，失败时给出与「任务已分叉」相同的冲突错误和远端头。 */
  private async advanceTask(taskId: string, move: HeadMove): Promise<void> {
    const current = await advance(this.client, this.scope, taskRef(taskId), move);
    demand(current === undefined, 'diverged', '任务已分叉，请另存为新任务', { remoteHead: current ?? null });
  }
  /** 推进共享引用并同步公开的共享头投影；比较交换失败时给出「版本已变化」。 */
  private async advanceShared(move: HeadMove): Promise<void> {
    const current = await advance(this.client, this.scope, sharedRef, move);
    demand(current === undefined, 'stale', '版本已变化，请刷新后重试', { current: current ?? null });
    await this.client.query('UPDATE public.admin_shared SET head = $3 WHERE team_id = $1 AND app_id = $2', [
      ...this.scope,
      move.to
    ]);
  }
  private async prs(prs: RowChanges<PullRequest>): Promise<void> {
    await insertRows(
      this.client,
      this.scope,
      'admin_private.prs',
      [['id', 'text'], ...prWrite],
      prs.created.map(prRow)
    );
    await updateRows(this.client, this.scope, 'admin_private.prs', 'id', prWrite, prs.updated.map(prRow));
  }
  private candidates(candidates: StoredCandidate[]): Promise<void> {
    return insertRows(
      this.client,
      this.scope,
      'admin_private.candidates',
      [
        ['id', 'text'],
        ['pr_id', 'text'],
        ['base', 'text'],
        ['source', 'text'],
        ['target', 'text'],
        ['schema_version', 'int'],
        ['policy_version', 'int'],
        ['resolutions', 'jsonb'],
        ['conflicts', 'jsonb'],
        ['checks', 'jsonb'],
        ['actor_id', 'text'],
        ['at', 'bigint'],
        ['changes', 'jsonb']
      ],
      candidates.map(item => ({
        id: item.id,
        pr_id: item.prId,
        base: item.base,
        source: item.source,
        target: item.target,
        schema_version: item.schemaVersion,
        policy_version: item.policyVersion,
        resolutions: item.resolutions,
        conflicts: item.conflicts,
        checks: item.checks,
        actor_id: item.actorId,
        at: item.at,
        changes: item.changes
      }))
    );
  }
  private reviews(reviews: Review[]): Promise<void> {
    return insertRows(
      this.client,
      this.scope,
      'admin_private.reviews',
      [
        ['id', 'text'],
        ['pr_id', 'text'],
        ['reviewer_id', 'text'],
        ['source', 'text'],
        ['candidate_id', 'text'],
        ['stage_id', 'text'],
        ['decision', 'text'],
        ['generation', 'int'],
        ['revision', 'int'],
        ['reason', 'text'],
        ['at', 'bigint'],
        ['dismissed_reviewer_id', 'text']
      ],
      reviews.map(review => ({
        id: review.id,
        pr_id: review.prId,
        reviewer_id: review.reviewerId,
        source: review.source,
        candidate_id: review.candidateId,
        stage_id: review.stageId,
        decision: review.decision,
        generation: review.generation,
        revision: review.revision,
        reason: review.reason,
        at: review.at,
        dismissed_reviewer_id: review.dismissedReviewerId ?? null
      }))
    );
  }
  private async threads(threads: RowChanges<ThreadRow>, comments: RowChanges<ThreadComment>): Promise<void> {
    await insertRows(
      this.client,
      this.scope,
      'admin_private.threads',
      [['id', 'text'], ['pr_id', 'text'], ...threadWrite],
      threads.created.map(threadRow)
    );
    await updateRows(
      this.client,
      this.scope,
      'admin_private.threads',
      'id',
      threadWrite,
      threads.updated.map(threadRow)
    );
    await insertRows(
      this.client,
      this.scope,
      'admin_private.comments',
      [['id', 'text'], ['thread_id', 'text'], ...commentWrite],
      comments.created.map(commentRow)
    );
    await updateRows(
      this.client,
      this.scope,
      'admin_private.comments',
      'id',
      commentWrite,
      comments.updated.map(commentRow)
    );
  }
  private async notifications(notifications: WorkspaceChanges['notifications']): Promise<void> {
    await insertRows(
      this.client,
      this.scope,
      'admin_private.notifications',
      [
        ['id', 'text'],
        ['user_id', 'text'],
        ['pr_id', 'text'],
        ['thread_id', 'text'],
        ['candidate_id', 'text'],
        ['read', 'boolean'],
        ['at', 'bigint']
      ],
      notifications.created.map(notice => ({
        id: notice.id,
        user_id: notice.userId,
        pr_id: notice.prId,
        thread_id: notice.threadId,
        candidate_id: notice.candidateId,
        read: notice.read,
        at: notice.at
      }))
    );
    if (notifications.read.length)
      await this.client.query(
        'UPDATE admin_private.notifications SET read = true WHERE team_id = $1 AND app_id = $2 AND id = ANY($3::text[])',
        [...this.scope, notifications.read.map(notice => notice.id)]
      );
  }
  /** 逐记录变更日志：每次合并改动到的记录各一行，带合并前后的整行；它是合并改动的唯一载体。 */
  private changeLog(log: MergeLog): Promise<void> {
    return insertRows(
      this.client,
      this.scope,
      'public.admin_changes',
      [
        ['merge_id', 'text'],
        ['record_id', 'text'],
        ['before_data', 'jsonb'],
        ['after_data', 'jsonb']
      ],
      log.records.map(record => ({
        merge_id: log.head,
        record_id: record.id,
        before_data: record.before,
        after_data: record.after
      }))
    );
  }
  /** 审计只追加：整条事件存进 details，另登记所属 PR 与线程供分页筛选；seq 由数据库按写入顺序生成。 */
  private async audit(changes: WorkspaceChanges): Promise<void> {
    if (!changes.audit.length) return;
    await this.client.query(
      `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at, pr_id, thread_id)
       SELECT $1, $2, x.id, x.actor_id, x.action, x.event, to_timestamp(x.at / 1000.0), x.pr_id, x.thread_id
       FROM jsonb_to_recordset($3::jsonb)
         AS x(ord int, id text, actor_id text, action text, event jsonb, at double precision, pr_id text, thread_id text)
       ORDER BY x.ord`,
      [
        ...this.scope,
        JSON.stringify(
          changes.audit.map((entry, ord) => ({
            ord,
            id: entry.event.id,
            actor_id: entry.event.actorId,
            action: entry.event.action,
            event: entry.event,
            at: entry.event.at,
            pr_id: entry.prId,
            thread_id: entry.threadId
          }))
        )
      ]
    );
  }
  private receipts(receipts: Receipt[]): Promise<void> {
    return insertRows(
      this.client,
      this.scope,
      'admin_private.operations',
      [
        ['operation_id', 'text'],
        ['actor_id', 'text'],
        ['fingerprint', 'text'],
        ['result', 'jsonb'],
        ['at', 'bigint']
      ],
      receipts.map(receipt => ({
        operation_id: receipt.operationId,
        actor_id: receipt.actorId,
        fingerprint: receipt.fingerprint,
        result: receipt.value,
        at: receipt.at
      }))
    );
  }
  /**
   * 有界清理过期回执：每个写事务最多删 {@link receiptSweepLimit} 条最旧的；并发的写事务用 SKIP LOCKED 各删各的，
   * 不会因为争同一批过期行而互相等待。待删的 ID 先收进数组（InitPlan 只求值一次）：若写成 `DELETE ... USING (子查询)`，
   * 规划器可能重扫带锁的子查询，而本语句已删的行在重扫时被跳过，LIMIT 就会越取越多，清理不再有界。
   */
  private async sweep(now: number): Promise<void> {
    await this.client.query(
      `DELETE FROM admin_private.operations
       WHERE team_id = $1 AND app_id = $2 AND operation_id = ANY(ARRAY(
         SELECT operation_id FROM admin_private.operations
         WHERE team_id = $1 AND app_id = $2 AND at <= $3 ORDER BY at LIMIT $4 FOR UPDATE SKIP LOCKED
       ))`,
      [...this.scope, now - receiptRetentionMs, receiptSweepLimit]
    );
  }
}

/**
 * 按期望头比较交换推进一个引用：成功返回 undefined；引用当前的头不是期望值时不改动，返回当前头
 * （引用不存在时返回 null）。调用方已对引用加锁时它总会成功，仍保留比较交换作为防线。
 */
export async function advance(
  client: Queryable,
  scope: [teamId: string, appId: string],
  ref: string,
  move: HeadMove
): Promise<string | null | undefined> {
  const moved = await client.query(
    `UPDATE admin_private.refs SET head = $5, revision = revision + 1
     WHERE team_id = $1 AND app_id = $2 AND ref = $3 AND head IS NOT DISTINCT FROM $4::text RETURNING revision`,
    [...scope, ref, move.from, move.to]
  );
  if (moved.rowCount) return undefined;
  const current = await client.query<{ head: string | null }>(
    'SELECT head FROM admin_private.refs WHERE team_id = $1 AND app_id = $2 AND ref = $3',
    [...scope, ref]
  );
  return current.rows[0]?.head ?? null;
}
