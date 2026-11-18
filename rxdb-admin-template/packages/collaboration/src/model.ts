import type { EntityFieldsDescriptor } from '@aiao/rxdb';
import type { CommitExchangeRecordJson, CommitKind } from '@aiao/rxdb-plugin-working-tree/exchange';

/** 成员可被授予的全部权限，顺序即界面展示顺序；新成员默认只给查看。 */
export const permissions = ['read', 'edit', 'comment', 'review', 'merge', 'manage'] as const;
/** 单项权限：查看、编辑与提交、评论、审核、合并、成员管理。 */
export type Permission = (typeof permissions)[number];
/** 记录字段的取值：文本、数字、布尔，或 null（空值）。 */
export type Value = string | number | boolean | null;
/** 一条受管数据记录：所属实体（数据模式清单里的实体名）与字段取值。 */
export type DataRow = { entity: string; fields: Record<string, Value> };
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
 * 字段级变更：一次提交里对一条记录的改动，是平台交换格式单元（`CommitChangeUnitContent`）里推导内容要用的六列。
 * - `insert`：`patch` 是整行字段，`inversePatch` 为 null。
 * - `update`：`patch` 只含变更字段的新值，`inversePatch` 含这些字段的旧值；
 *   只出现在 `patch` 里的字段是新增字段（此前不存在），只出现在 `inversePatch` 里的字段是被移除的字段。
 * - `delete`：`patch` 为 null，`inversePatch` 是被删除记录的整行字段。
 * `namespace` 是实体在数据模式清单里所属的命名空间，服务端按清单核对。取值是写下它的那一端的落库形态，协作只解读、不改写。
 */
export interface ChangeSet {
  namespace: string;
  entity: string;
  entityId: string;
  operation: 'insert' | 'update' | 'delete';
  patch: Record<string, Value> | null;
  inversePatch: Record<string, Value> | null;
}
/**
 * 提交里的一个变更单元：平台交换格式的九列（`CommitChangeUnitContent`），即 {@link ChangeSet} 加上单元 ID、所属事务与来源。
 * 三列都原样保存、原样下发，参与内容指纹；推导内容只用 {@link ChangeSet} 那六列。
 * 协作自己产出的提交（客户端整单提交、服务端合并）各是一笔原子写：全部单元共用一个 `unitId`（取提交 ID），
 * `transactionId` 为 null，`origin` 为 `local`。
 */
export interface ChangeUnit extends ChangeSet {
  unitId: string;
  transactionId: string | null;
  origin: 'local' | 'remote_sync';
}
/**
 * 一次提交：平台 working-tree 的交换记录在 JSON 里的形态（`CommitExchangeRecordJson`，`createdAt` 是 `toISOString()` 的串），
 * 上传、存储与下发都是这一种，中间没有第二种格式。`parentIds` 有序，第 0 个是第一父，单元是相对第一父的增量（合并提交也一样）。
 * 协作用到三种 `kind`：任务提交 `normal`（恰好一个父）、服务端合并 `merge`（第一父是共享头、第二父是任务头）、
 * 初始化写下的共享分支根 `baseline`（没有父、没有作者、没有单元）。`contentFingerprint` 由平台的
 * `computeCommitExchangeRecordFingerprint()` 计算，覆盖种类、父、消息、作者与单元的落库形态，不覆盖提交 ID 与时间。
 */
export type Commit = Omit<CommitExchangeRecordJson, 'units'> & { readonly units: readonly ChangeUnit[] };
/** 提交的种类（平台 `CommitKind`）：协作只产出 `normal`、`merge` 与 `baseline`。 */
export type { CommitKind };
/**
 * 提交摘要：交换记录的元数据，不含单元与内容指纹；`id` 就是交换记录的 `commitId`。
 * 合并提交另带它依据的候选（`candidateId`，产品附加的元数据，不在交换记录里）。提交不可变，客户端可按 ID 长期缓存。
 */
export interface CommitSummary {
  id: string;
  parentIds: string[];
  kind: CommitKind;
  authorId: string | null;
  message: string;
  createdAt: string;
  candidateId?: string;
}
/** 提交的元数据加内容指纹：服务端按提交 ID 去重、核对重传时只读这一部分。 */
export type CommitMeta = CommitSummary & { contentFingerprint: string };
/**
 * 提交的完整内容：元数据、该提交自身的单元（相对第一父，取自变更表），以及该提交时刻的整份记录（由变更推导）。
 * 合并提交的 `changes` 就是这次合并对共享数据的改动；共享分支根没有单元，记录为空。
 */
export interface CommitContent extends CommitSummary {
  changes: ChangeUnit[];
  records: Records;
}
/**
 * 下发接口的一页（只读函数 `admin_commit_exchange`）：`head` 是读取时该分支的头，`commits` 是客户端已知提交之后、
 * 到 `head` 为止需要导入的交换记录（父先于子，最后一个是这一页的头），`more` 表示这一页之后还有。
 */
export interface CommitExchangePage<T = Commit> {
  head: string;
  commits: T[];
  more: boolean;
}
/**
 * 提交历史分页的查询，即 `GET .../history` 的参数：共享分支（`branch: 'shared'`）、某个任务分支（`taskId`）
 * 或某个 PR 的来源任务（`prId`），三者恰好取一。任务分支从任务头走到它的共同起点（不含）。
 * `before` 是上一页的 `nextBefore`，从它的父提交接着往前读。
 */
export interface HistoryQuery {
  branch?: 'shared';
  taskId?: string;
  prId?: string;
  before?: string;
  limit?: number;
}
/** 提交历史的一页：`commits` 从新到旧，只含元数据；还有更早的提交时 `nextBefore` 是本页最旧提交的 ID，否则为 null。 */
export interface CommitPage {
  commits: CommitSummary[];
  nextBefore: string | null;
}
/**
 * 任务：成员私有的工作分支。`base` 是创建时的共享版本（共享分支上的提交，最早是共享分支根），`head` 是已同步到服务端的最新提交
 * （还没有提交时等于 `base`），`originTaskId` 指向另存前的原任务。
 */
export interface Task {
  id: string;
  name: string;
  ownerId: string;
  base: string;
  head: string;
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
 * 候选摘要：针对某个来源与目标版本，在指定的策略与数据模式版本下生成的最终合并结果的元数据，
 * 附带未解决的冲突与检查结果；最终记录经 `GET .../candidates/:id` 按需读取，候选不可变，客户端可按 ID 长期缓存。
 * 来源、目标、策略或模式任一变化后即过期，必须重新生成并审核。
 */
export interface CandidateSummary {
  id: string;
  prId: string;
  base: string;
  source: string;
  target: string;
  schemaVersion: number;
  policyVersion: number;
  resolutions: Resolution[];
  conflicts: Conflict[];
  checks: Check[];
  actorId: string;
  at: number;
}
/** 合并候选的完整内容，即 `GET .../candidates/:id` 的响应：摘要加上最终合并结果的整份记录（服务端由存储的变更推导）。 */
export interface Candidate extends CandidateSummary {
  records: Records;
}
/**
 * 服务端存储的合并候选：摘要加上最终结果相对目标版本 T 的字段级变更；
 * 把 `changes` 应用到 T 的记录上就得到 {@link Candidate.records}。
 */
export interface StoredCandidate extends CandidateSummary {
  changes: ChangeSet[];
}
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
/**
 * 在线状态：成员的一个页面会话经私有频道的 Realtime Presence 上报的当前查看位置，不写数据库。
 * 会话离开频道（关闭页面、切换团队、退出或断网后被 Realtime 判定离线）即消失；只作协作提示，不授予任何权限。
 */
export interface Presence {
  userId: string;
  sessionId: string;
  prId: string | null;
  recordId: string | null;
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
/**
 * 幂等回执：同一 `operationId` 在保留期（{@link receiptRetentionMs}）内重复提交时原样返回已记录的结果；
 * `fingerprint` 用于拒绝换参数复用同一标识，`at` 是记录回执的时间，过期回执由写事务分批清理。
 */
export interface Receipt {
  operationId: string;
  actorId: string;
  fingerprint: string;
  value: Record<string, unknown>;
  at: number;
}
/**
 * 幂等回执的保留期：30 天。期内用原操作 ID 重试返回原结果；过期后同一 ID 按新请求处理，
 * 提交仍按提交 ID 去重，不会重复建提交。客户端超过保留期仍未确认的请求不再自动重试，交给用户确认。
 */
export const receiptRetentionMs = 30 * 86_400_000;
/**
 * 数据模式清单：一个版本的协作实体与字段约束，由应用的 RxDB 实体定义经 `describeEntityFields()` 生成。
 * `schemaVersion` 是从 1 开始的整数，工作区按版本只追加登记，当前版本记在治理行上；
 * `entities` 是各实体的字段描述（必填、唯一、关系、取值类型、枚举、数值范围等），服务端与客户端都按它校验记录。
 */
export interface SchemaManifest {
  schemaVersion: number;
  entities: EntityFieldsDescriptor[];
}
/**
 * 引擎眼里的工作区状态（一个团队下的一个应用）：成员、任务、PR、审核、讨论、回执与审计，以及共享分支的头提交 `head`
 * 与根 `root`（初始化时写下的 `baseline` 提交，之后不变；还没有合并时头就是根）。
 * 它是逻辑视图，不是一行数据：持久化时各集合分表存放，命令只按需加载并加锁它涉及的那几行，
 * 交给引擎的是只含这些行的局部状态；提交与共享记录另在提交表与共享记录表。
 */
export interface Workspace {
  teamId: string;
  appId: string;
  name: string;
  bootstrapKey: string;
  initialAdminId: string;
  /** 当前数据模式版本，与 `schema.schemaVersion` 相同；候选按它判断是否过期。 */
  schemaVersion: number;
  /** 当前版本的数据模式清单：上传、候选、合并与新版本登记都按它校验记录。 */
  schema: SchemaManifest;
  revision: number;
  head: string;
  /** 共享分支的根：初始化时写下的 `baseline` 提交，没有父、没有单元，内容为空记录。 */
  root: string;
  policy: Policy;
  members: Record<string, Member>;
  tasks: Record<string, Task>;
  prs: Record<string, PullRequest>;
  candidates: Record<string, StoredCandidate>;
  invitations: Record<string, Invitation>;
  reviews: Review[];
  threads: Record<string, Thread>;
  notifications: Notice[];
  receipts: Record<string, Receipt>;
  audit: Audit[];
}
/** 摘要里内嵌的最近审计事件条数；更早的事件经审计分页接口读取。 */
export const auditSummarySize = 50;
/** 审计分页的每页条数：不传 `limit` 时取 `default`，超过 `maximum` 的请求被拒绝。 */
export const auditPageSize = { default: 50, maximum: 100 } as const;
/** 提交历史分页的每页条数：不传 `limit` 时取 `default`，超过 `maximum` 的请求被拒绝。 */
export const historyPageSize = { default: 50, maximum: 100 } as const;
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
 * 团队页：浏览器经 Supabase 的只读投影（PostgREST + RLS）组装的当前工作区视图，只含团队页需要的元数据——
 * 成员、审批策略、引用与 PR 列表元数据、本人的通知窗口与在线状态。体积不随讨论、审核、通知与提交的条数增长：
 * PR 的候选、审核与讨论在打开 PR 时另读（{@link PullRequestDetail}），提交历史、共享记录、提交与候选内容、审计都按需分页读取。
 * 只含当前用户可见的内容：通知只含本人的，`invitations` 只对有 manage 权限者非空。
 */
export interface WorkspaceSummary {
  teamId: string;
  appId: string;
  name: string;
  /** 工作区修订号：每条改变状态的命令提交时加一；客户端按失效通知里的修订号推进，跳号说明漏了通知，整页重读。 */
  revision: number;
  schemaVersion: number;
  /** 共享分支的头提交；共享数据以它为版本，头变化后需重新读取。 */
  head: string;
  /** 共享分支的根（初始化时写下的 `baseline` 提交）：头等于根即还没有任何合并，界面按「空分支」显示。 */
  root: string;
  policy: Policy;
  /** 有效成员，按加入顺序。 */
  members: Member[];
  /** 本人最近创建的任务（窗口内，按创建顺序），加上已加载 PR 的来源任务与当前草稿的任务。 */
  tasks: Task[];
  /** 最近创建的 PR（窗口内），按创建顺序。 */
  prs: PullRequest[];
  /** 本人最近的通知（窗口内），按时间正序。 */
  notifications: Notice[];
  /** 本人未读通知的总数（含窗口之外的）。 */
  unread: number;
  /** 窗口之外是否还有更早的 PR、本人任务与通知。 */
  earlier: { prs: boolean; tasks: boolean; notices: boolean };
  /** 管理者可见的邀请；其他成员为空。 */
  invitations: InvitationSummary[];
  /** 在线会话（Realtime Presence），只含当前有效、未被撤权的成员。 */
  presence: Presence[];
  /** 审计事件总数；事件本身在展开审计时间线时按页读取。 */
  auditCount: number;
}
/** 一个 PR 的详情：打开 PR 时读取，失效通知点到这个 PR 时重读。 */
export interface PullRequestDetail {
  prId: string;
  /** 这个 PR 的全部候选（不含最终记录），键为候选 ID。 */
  candidates: Record<string, CandidateSummary>;
  /** 这个 PR 的审核记录，按写入顺序。 */
  reviews: Review[];
  /** 这个 PR 的讨论线程（含评论），按创建顺序。 */
  threads: Thread[];
  /** 仍生效的阻塞意见与当前候选的阶段进度，由审核记录、成员与策略按 `approval.ts` 的规则推导。 */
  governance: Governance;
}
/**
 * 失效通知的类别：变化落在哪一部分，客户端据此只重读这一部分。members 为成员与邀请，policy 为审批策略，
 * schema 为数据模式，tasks 为任务与任务头，prs 为 PR 行（列表元数据），details 为 PR 的候选、审核与讨论，
 * shared 为共享头，notices 为通知，audit 为审计（每条改变状态的命令都有）。
 */
export const signalKinds = [
  'members',
  'policy',
  'schema',
  'tasks',
  'prs',
  'details',
  'shared',
  'notices',
  'audit'
] as const;
/** 单个失效类别，见 {@link signalKinds}。 */
export type SignalKind = (typeof signalKinds)[number];
/**
 * 命令提交后经私有频道广播的失效通知（事件 `changed`）：只含修订号、类别与标识，不含任何业务内容。
 * `prIds` 是 PR 行或详情有变化的 PR，`noticeUserIds` 是通知有变化（新收到或标为已读）的成员。
 */
export interface WorkspaceSignal {
  revision: number;
  kinds: SignalKind[];
  prIds: string[];
  noticeUserIds: string[];
}
/** 撤权事件（事件 `revoked`）：失去读权限的成员。各端把他们移出在线列表，被撤成员锁定团队上下文。 */
export interface RevocationSignal {
  revision: number;
  userIds: string[];
}
/** 一个工作区的私有 Realtime 频道：`collab:<团队>:<应用>`（团队与应用标识不含冒号，频道名因此一一对应）。 */
export function channelTopic(workspace: { teamId: string; appId: string }): string {
  return `collab:${workspace.teamId}:${workspace.appId}`;
}
/** 共享分支的全部记录及其版本：`head` 与摘要的 `head` 一致时内容才与摘要匹配。 */
export interface SharedRecords {
  head: string;
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
 * 涵盖邀请与成员管理、审批策略、数据模式登记、任务与提交同步、PR 与合并候选、审核、讨论与订阅通知；
 * 在线状态不经命令，由私有频道的 Realtime Presence 承载。
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
    | { type: 'schema'; schema: SchemaManifest; expectedVersion: number }
    | { type: 'task'; id: string; name: string; expectedHead: string }
    | { type: 'upload'; taskId: string; expectedHead: string; commits: Commit[] }
    | { type: 'fork'; id: string; name: string; taskId: string; expectedHead: string; commits: Commit[] }
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
    | { type: 'merge'; prId: string; candidateId: string; expectedSource: string; expectedTarget: string }
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
