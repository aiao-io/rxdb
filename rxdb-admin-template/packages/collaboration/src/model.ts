/** 成员可被授予的全部权限，顺序即界面展示顺序；新成员默认只给查看。 */
export const permissions = ['read', 'edit', 'comment', 'review', 'merge', 'manage'] as const;
/** 单项权限：查看、编辑与提交、评论、审核、合并、成员管理。 */
export type Permission = (typeof permissions)[number];
/** 记录字段的取值：文本、数字、布尔，或 null（空值）。 */
export type Value = string | number | boolean | null;
/** 一条受管数据记录：所属实体（资产分类、资产、维护记录）与字段取值。 */
export type DataRow = { entity: 'AssetCategory' | 'Asset' | 'AssetEvent'; fields: Record<string, Value> };
/** 以记录标识为键的整份数据，是工作树、提交与合并候选的内容。 */
export type Records = Record<string, DataRow>;
/** 已认证的用户身份；`verified` 表示认证提供方已确认该邮箱。 */
export interface Identity {
  id: string;
  email: string;
  verified: boolean;
}
/** 团队成员及其权限。`generation` 在每次授权变更后递增，用于乐观并发与废止旧审批；`active` 为 false 表示已被移除。 */
export interface Member {
  id: string;
  email: string;
  permissions: Permission[];
  generation: number;
  active: boolean;
}
/**
 * 一次提交：任务在某一时刻的整单记录快照。`parent` 串成提交图；
 * `mergeSource` 与 `candidateId` 只在合并产生的提交上出现。
 */
export interface Commit {
  id: string;
  parent: string | null;
  authorId: string;
  message: string;
  records: Records;
  mergeSource?: string;
  candidateId?: string;
}
/** 提交摘要：只含元数据，不含记录内容；内容经 `GET .../commits/:id` 按需读取，提交不可变，客户端可按 ID 长期缓存。 */
export type CommitSummary = Omit<Commit, 'records'>;
/** 任务：成员私有的工作分支。`base` 是创建时的共享版本，`head` 是已同步到服务端的最新提交，`originTaskId` 指向另存前的原任务。 */
export interface Task {
  id: string;
  name: string;
  ownerId: string;
  base: string | null;
  head: string | null;
  originTaskId: string | null;
}
/** 审批阶段：所需批准人数、限定审核人（空表示所有审核者）与前置阶段（`after`，空表示可与其他阶段并行）。 */
export interface Stage {
  id: string;
  name: string;
  minimum: number;
  reviewers: string[];
  after: string[];
}
/** 审批策略：版本号与有序阶段；没有阶段表示免审批，但检查、冲突与阻塞意见仍然生效。 */
export interface Policy {
  version: number;
  stages: Stage[];
}
/** 数据 PR：把任务的提交合并进共享分支的申请。`revision` 在每次状态变更后递增，`candidateId` 指向当前合并候选。 */
export interface PullRequest {
  id: string;
  taskId: string;
  authorId: string;
  title: string;
  description: string;
  target: 'shared';
  status: 'draft' | 'review' | 'closed' | 'merged';
  revision: number;
  candidateId: string | null;
  subscribers: string[];
}
/**
 * 对一个冲突的处理。`key` 是冲突位置（`记录/字段` 或 `记录/$record`）；
 * 选择自定义时必须带 `value`，其中 null 表示删除整条记录或清空字段。
 */
export interface Resolution {
  key: string;
  choice: 'source' | 'target' | 'custom';
  value?: Value | DataRow;
}
/** 三方合并中无法自动合并的位置，附带起点、来源与目标三方的取值（undefined 表示该方不存在）。 */
export interface Conflict {
  key: string;
  recordId: string;
  field: string | null;
  base: Value | DataRow | undefined;
  source: Value | DataRow | undefined;
  target: Value | DataRow | undefined;
}
/** 最终结果检查发现的一处问题：记录、字段与中文提示（客户端经词条表翻译）。 */
export interface Check {
  recordId: string;
  field: string;
  message: string;
}
/**
 * 合并候选：针对某个来源与目标版本，在指定的策略与数据模式版本下生成的最终合并结果，
 * 附带未解决的冲突与检查结果。来源、目标、策略或模式任一变化后即过期，必须重新生成并审核。
 */
export interface Candidate {
  id: string;
  prId: string;
  base: string | null;
  source: string;
  target: string | null;
  schemaVersion: number;
  policyVersion: number;
  resolutions: Resolution[];
  records: Records;
  conflicts: Conflict[];
  checks: Check[];
  actorId: string;
  at: number;
}
/**
 * 候选摘要：保留来源、目标、冲突选择、冲突与检查结果，去掉最终记录；记录经 `GET .../candidates/:id` 按需读取，
 * 候选不可变，客户端可按 ID 长期缓存。
 */
export type CandidateSummary = Omit<Candidate, 'records'>;
/**
 * 一条审核记录：批准、要求修改，或撤销他人的阻塞意见（dismiss）。
 * `generation` 记录审核者当时的授权代次，授权变更后旧批准不再有效；`revision` 是同一审核者记录的版本。
 */
export interface Review {
  id: string;
  source: string | null;
  prId: string;
  reviewerId: string;
  candidateId: string | null;
  stageId: string;
  decision: 'approve' | 'request_changes' | 'dismiss';
  generation: number;
  revision: number;
  reason: string;
  at: number;
  dismissedReviewerId?: string;
}
/** 讨论线程里的一条评论；`revision` 在每次编辑后递增，`deleted` 为软删除。 */
export interface Comment {
  id: string;
  authorId: string;
  body: string;
  deleted: boolean;
  revision: number;
  at: number;
}
/**
 * PR 讨论线程。可锚定到某个候选版本的记录或字段；`required` 表示必须处理，
 * 未解决的必须处理线程会阻止合并；`resolvedCandidateId` 记录解决时对应的候选。
 */
export interface Thread {
  id: string;
  prId: string;
  candidateId: string | null;
  recordId: string | null;
  field: string | null;
  required: boolean;
  resolved: boolean;
  resolvedCandidateId: string | null;
  revision: number;
  comments: Comment[];
}
/** 团队邀请。令牌只以 SHA-256 摘要保存（`tokenHash`），明文不进入服务端状态，受邀邮箱以小写保存。 */
export interface Invitation {
  id: string;
  email: string;
  permissions: Permission[];
  inviterId: string;
  tokenHash: string;
  version: number;
  expiresAt: number;
  state: 'pending' | 'revoked' | 'accepted';
  acceptedBy: string | null;
}
/** 站内通知：订阅或被提及时产生，只有接收者本人可见。 */
export interface Notice {
  id: string;
  userId: string;
  prId: string;
  threadId: string | null;
  candidateId: string | null;
  read: boolean;
  at: number;
}
/** 在线状态：按会话上报的心跳，超过 `expiresAt` 后失效。 */
export interface Presence {
  userId: string;
  sessionId: string;
  prId: string | null;
  recordId: string | null;
  expiresAt: number;
}
/** 审计事件：操作者、动作与不含敏感字段（令牌摘要、邮箱、完整提交内容）的详情。 */
export interface Audit {
  id: string;
  actorId: string;
  action: string;
  operationId: string;
  at: number;
  details: Record<string, unknown>;
}
/** 幂等回执：同一 `operationId` 重复提交时原样返回已记录的结果；`fingerprint` 用于拒绝换参数复用同一标识。 */
export interface Receipt {
  operationId: string;
  actorId: string;
  fingerprint: string;
  value: Record<string, unknown>;
}
/** 服务端持久化的完整工作区状态（一个团队下的一个应用）：成员、任务、提交、PR、审核、讨论、回执与审计。 */
export interface Workspace {
  teamId: string;
  appId: string;
  name: string;
  bootstrapKey: string;
  initialAdminId: string;
  schemaVersion: number;
  revision: number;
  head: string | null;
  records: Records;
  policy: Policy;
  members: Record<string, Member>;
  tasks: Record<string, Task>;
  commits: Record<string, Commit>;
  prs: Record<string, PullRequest>;
  candidates: Record<string, Candidate>;
  invitations: Record<string, Invitation>;
  reviews: Review[];
  threads: Record<string, Thread>;
  notifications: Notice[];
  presence: Presence[];
  receipts: Record<string, Receipt>;
  audit: Audit[];
}
/** 摘要里内嵌的最近审计事件条数；更早的事件经审计分页接口读取。 */
export const auditSummarySize = 50;
/** 审计分页的每页条数：不传 `limit` 时取 `default`，超过 `maximum` 的请求被拒绝。 */
export const auditPageSize = { default: 50, maximum: 100 } as const;
/** 一个审批阶段的当前进度：已有效批准的人数与是否达到所需人数。 */
export interface StageProgress {
  id: string;
  name: string;
  minimum: number;
  approved: number;
  complete: boolean;
}
/** 一个 PR 的治理状态：仍生效的阻塞意见与各审批阶段进度（尚无候选时没有阶段进度）。 */
export interface Governance {
  prId: string;
  blockers: Review[];
  stages: StageProgress[];
}
/** 管理者可见的邀请视图：不含令牌摘要，受邀邮箱以小写保存。 */
export type InvitationSummary = Omit<Invitation, 'tokenHash'>;
/**
 * 工作区摘要，即 `GET /workspaces/:teamId/:appId` 的响应：只含成员、任务、PR、审核、讨论、通知等元数据，
 * 体积不随记录数增长。提交与候选的记录、共享分支数据与完整审计都不在其中，需分别经
 * `GET .../records`、`.../commits/:id`、`.../candidates/:id`、`.../audit` 按需读取。
 * 仅返回该用户可见的内容：通知只含本人的，`invitations` 只对有 manage 权限者非空。
 */
export interface WorkspaceSummary {
  teamId: string;
  appId: string;
  name: string;
  revision: number;
  schemaVersion: number;
  /** 共享分支的头提交；共享数据以它为版本，头变化后需重新读取。 */
  head: string | null;
  policy: Policy;
  members: Member[];
  tasks: Task[];
  commits: Record<string, CommitSummary>;
  prs: PullRequest[];
  candidates: Record<string, CandidateSummary>;
  reviews: Review[];
  threads: Thread[];
  notifications: Notice[];
  presence: Presence[];
  invitations: InvitationSummary[];
  /** 最近的 {@link auditSummarySize} 条审计事件，按时间正序。 */
  audit: Audit[];
  /** 审计事件总数，大于 `audit.length` 时更早的事件可经审计分页读取。 */
  auditCount: number;
  governance: Governance[];
}
/** 共享分支的全部记录及其版本：`head` 与摘要的 `head` 一致时内容才与摘要匹配。 */
export interface SharedRecords {
  head: string | null;
  records: Records;
}
/** 审计分页的查询条件；`before` 是游标事件 ID，只返回比它更早的事件。 */
export interface AuditQuery {
  before?: string;
  limit?: number;
  /** 只返回与该 PR 相关的事件：PR 命令本身，以及属于该 PR 的讨论线程上的事件。 */
  prId?: string;
  /** 只返回该讨论线程的创建、回复、编辑与解决事件。 */
  threadId?: string;
}
/** 审计的一页：`events` 按时间从新到旧；`nextBefore` 是继续往前读取用的游标，没有更早事件时为 null。 */
export interface AuditPage {
  events: Audit[];
  nextBefore: string | null;
}
interface Operation {
  operationId: string;
}
/**
 * 浏览器可提交的全部命令，按 `type` 区分，每条都带幂等键 `operationId`。
 * 涵盖邀请与成员管理、审批策略、任务与提交同步、PR 与合并候选、审核、讨论、订阅通知与在线状态。
 * `invite` 与 `accept_invite` 的 `tokenHash` 由客户端提交明文令牌，HTTP 层在进入引擎前替换为 SHA-256 摘要。
 */
export type Command = Operation &
  (
    | {
        type: 'invite';
        id: string;
        email: string;
        permissions: Permission[];
        tokenHash: string;
        expiresAt: number;
        expectedVersion: number;
      }
    | { type: 'revoke_invite'; id: string; expectedVersion: number }
    | { type: 'accept_invite'; id: string; tokenHash: string }
    | { type: 'member'; userId: string; permissions: Permission[]; active: boolean; expectedGeneration: number }
    | { type: 'policy'; stages: Stage[]; expectedVersion: number }
    | { type: 'task'; id: string; name: string; expectedHead: string | null }
    | { type: 'upload'; taskId: string; expectedHead: string | null; commits: Commit[] }
    | { type: 'fork'; id: string; name: string; taskId: string; expectedHead: string | null; commits: Commit[] }
    | { type: 'pr'; id: string; taskId: string; title: string; description: string; target: 'shared' }
    | { type: 'pr_state'; prId: string; status: 'draft' | 'review' | 'closed'; expectedRevision: number }
    | { type: 'candidate'; prId: string; expectedRevision: number; resolutions: Resolution[] }
    | {
        type: 'review';
        prId: string;
        candidateId: string | null;
        expectedSource: string;
        stageId: string;
        decision: 'approve' | 'request_changes';
        reason: string;
        expectedRevision: number;
      }
    | { type: 'dismiss'; prId: string; reviewerId: string; reason: string; expectedRevision: number }
    | {
        type: 'thread';
        id: string;
        prId: string;
        candidateId: string | null;
        recordId: string | null;
        field: string | null;
        body: string;
        required: boolean;
        mentions: string[];
      }
    | { type: 'reply'; threadId: string; body: string; mentions: string[] }
    | {
        type: 'edit_comment';
        threadId: string;
        commentId: string;
        body: string;
        deleted: boolean;
        expectedRevision: number;
      }
    | { type: 'resolve_thread'; threadId: string; resolved: boolean; expectedRevision: number }
    | { type: 'subscribe'; prId: string; subscribed: boolean }
    | { type: 'read_notice'; id: string }
    | { type: 'presence'; sessionId: string; prId: string | null; recordId: string | null; leave: boolean }
    | { type: 'merge'; prId: string; candidateId: string; expectedSource: string; expectedTarget: string | null }
  );
/** 命令执行环境：当前时间与标识生成器，由调用方注入以便测试与保证同一事务内时间一致。 */
export interface Environment {
  now: number;
  id: () => string;
}
/** 带稳定错误码的协作错误：`code` 供程序分支，`message` 是中文词条（客户端经词条表翻译），`details` 携带附加上下文。 */
export class CollaborationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'CollaborationError';
  }
}
/** 断言条件成立，否则抛出 {@link CollaborationError}；`message` 必须是 `collaborationEnglish` 里的词条。 */
export function demand(
  condition: unknown,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): asserts condition {
  if (!condition) throw new CollaborationError(code, message, details);
}
