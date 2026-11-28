import type {
  Comment,
  Invitation,
  InvitationSummary,
  Notice,
  Permission,
  PullRequest,
  Review,
  StoredCandidate,
  Task,
  Thread
} from './model.js';

/**
 * 协作表的行与模型之间的转换。服务端命令路径读私有表，浏览器经 PostgREST 读 public 下的只读投影，
 * 两者列名相同，因此共用这里的行类型与转换。PostgreSQL 驱动把 bigint 读成字符串、PostgREST 读成数字，统一按数字处理。
 */
export const asNumber = (value: string | number) => Number(value);

/** PR 行。 */
export interface PrRow {
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
/** 任务行（含引用表里的任务头；共享分支有根，共同起点与任务头都不为空）。 */
export interface TaskRow {
  id: string;
  name: string;
  owner_id: string;
  base: string;
  origin_task_id: string | null;
  head: string;
}
/** 候选行；摘要读取时 `changes` 为空数组。 */
export interface CandidateRow {
  id: string;
  pr_id: string;
  base: string;
  source: string;
  target: string;
  schema_version: number;
  policy_version: number;
  resolutions: StoredCandidate['resolutions'];
  conflicts: StoredCandidate['conflicts'];
  checks: StoredCandidate['checks'];
  actor_id: string;
  at: string | number;
  changes: StoredCandidate['changes'];
}
/** 审核行。 */
export interface ReviewRow {
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
  at: string | number;
  dismissed_reviewer_id: string | null;
}
/** 讨论线程行（评论另读，按线程拼回）。 */
export interface ThreadRow {
  id: string;
  pr_id: string;
  candidate_id: string | null;
  record_id: string | null;
  field: string | null;
  required: boolean;
  resolved: boolean;
  resolved_candidate_id: string | null;
  revision: number;
}
/** 评论行。 */
export interface CommentRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  deleted: boolean;
  revision: number;
  at: string | number;
}
/** 通知行。 */
export interface NoticeRow {
  id: string;
  user_id: string;
  pr_id: string;
  thread_id: string | null;
  candidate_id: string | null;
  read: boolean;
  at: string | number;
}
/** 邀请行；公开投影里没有令牌摘要。 */
export interface InvitationRow {
  id: string;
  email: string;
  permissions: Permission[];
  inviter_id: string;
  version: number;
  expires_at: string | number;
  state: Invitation['state'];
  accepted_by: string | null;
}

/** PR 行的列，按表里的顺序。 */
export const prColumns = [
  'id',
  'task_id',
  'author_id',
  'title',
  'description',
  'target',
  'status',
  'revision',
  'candidate_id',
  'subscribers'
] as const;
/** 候选行的列（不含变更）。 */
export const candidateSummaryColumns = [
  'id',
  'pr_id',
  'base',
  'source',
  'target',
  'schema_version',
  'policy_version',
  'resolutions',
  'conflicts',
  'checks',
  'actor_id',
  'at'
] as const;
/** 审核行的列。 */
export const reviewColumns = [
  'id',
  'pr_id',
  'reviewer_id',
  'source',
  'candidate_id',
  'stage_id',
  'decision',
  'generation',
  'revision',
  'reason',
  'at',
  'dismissed_reviewer_id'
] as const;
/** 通知行的列。 */
export const noticeColumns = ['id', 'user_id', 'pr_id', 'thread_id', 'candidate_id', 'read', 'at'] as const;

/** PR 行转模型。 */
export const prOf = (row: PrRow): PullRequest => ({
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
/** 任务行转模型。 */
export const taskOf = (row: TaskRow): Task => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  base: row.base,
  head: row.head,
  originTaskId: row.origin_task_id
});
/** 候选行转模型（存储形态，含相对目标版本的变更）。 */
export const candidateOf = (row: CandidateRow): StoredCandidate => ({
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
/** 审核行转模型；撤销他人阻塞意见的记录才带 `dismissedReviewerId`。 */
export const reviewOf = (row: ReviewRow): Review => {
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
/** 评论行转模型。 */
export const commentOf = (row: CommentRow): Comment => ({
  id: row.id,
  authorId: row.author_id,
  body: row.body,
  deleted: row.deleted,
  revision: row.revision,
  at: asNumber(row.at)
});
/** 线程行连同它的评论（按写入顺序）转模型。 */
export const threadOf = (row: ThreadRow, comments: Comment[]): Thread => ({
  id: row.id,
  prId: row.pr_id,
  candidateId: row.candidate_id,
  recordId: row.record_id,
  field: row.field,
  required: row.required,
  resolved: row.resolved,
  resolvedCandidateId: row.resolved_candidate_id,
  revision: row.revision,
  comments
});
/** 通知行转模型。 */
export const noticeOf = (row: NoticeRow): Notice => ({
  id: row.id,
  userId: row.user_id,
  prId: row.pr_id,
  threadId: row.thread_id,
  candidateId: row.candidate_id,
  read: row.read,
  at: asNumber(row.at)
});
/** 邀请行转管理者可见的邀请视图（不含令牌摘要）。 */
export const invitationOf = (row: InvitationRow): InvitationSummary => ({
  id: row.id,
  email: row.email,
  permissions: row.permissions,
  inviterId: row.inviter_id,
  version: row.version,
  expiresAt: asNumber(row.expires_at),
  state: row.state,
  acceptedBy: row.accepted_by
});
