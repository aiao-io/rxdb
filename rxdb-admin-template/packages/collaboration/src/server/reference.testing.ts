import { candidateSummary, pageLimit } from '../derive.js';
import {
  auditPageSize,
  auditSummarySize,
  demand,
  type Audit,
  type AuditPage,
  type AuditQuery,
  type CandidateSummary,
  type Governance,
  type Identity,
  type InvitationSummary,
  type Member,
  type Notice,
  type Policy,
  type PullRequest,
  type Review,
  type Task,
  type Thread,
  type Workspace
} from '../model.js';
import { authorize } from './access.js';
import { auditPr, auditThread } from './engine.js';
import { blockers, progress } from './governance.js';

/**
 * 读取的参照模型（测试用）：在完整的内存工作区上，按与 public 只读投影相同的可见规则算出读取结果。
 * 引擎与内存工作区的用例用它描述「成员能读到什么」：有效成员、本人的通知、只对管理者可见的邀请、候选不含记录、
 * 审计最近一窗；PostgreSQL 上的同一套规则由迁移里的投影实现，经 `read-projections.integration.spec.ts` 的矩阵核对，
 * 浏览器经 `reader.ts` 读取。
 */
export interface ReferenceSummary {
  teamId: string;
  appId: string;
  name: string;
  revision: number;
  schemaVersion: number;
  head: string;
  /** 共享分支的根。 */
  root: string;
  policy: Policy;
  members: Member[];
  tasks: Task[];
  prs: PullRequest[];
  candidates: Record<string, CandidateSummary>;
  reviews: Review[];
  threads: Thread[];
  notifications: Notice[];
  invitations: InvitationSummary[];
  audit: Audit[];
  auditCount: number;
  governance: Governance[];
}

/** 参照模型下某个成员读到的整页内容；不是可读成员时与投影一样拒绝。 */
export function referenceSummary(state: Workspace, user: Identity): ReferenceSummary {
  const member = authorize(state, user, 'read');
  const candidates: Record<string, CandidateSummary> = {};
  for (const [id, candidate] of Object.entries(state.candidates)) candidates[id] = candidateSummary(candidate);
  return structuredClone({
    teamId: state.teamId,
    appId: state.appId,
    name: state.name,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    head: state.head,
    root: state.root,
    policy: state.policy,
    members: Object.values(state.members).filter(m => m.active),
    tasks: Object.values(state.tasks),
    prs: Object.values(state.prs),
    candidates,
    reviews: state.reviews,
    threads: Object.values(state.threads),
    notifications: state.notifications.filter(n => n.userId === user.id),
    invitations:
      member.permissions.includes('manage') ?
        Object.values(state.invitations).map(i => ({
          id: i.id,
          email: i.email,
          permissions: i.permissions,
          inviterId: i.inviterId,
          version: i.version,
          expiresAt: i.expiresAt,
          state: i.state,
          acceptedBy: i.acceptedBy
        }))
      : [],
    audit: state.audit.slice(-auditSummarySize),
    auditCount: state.audit.length,
    governance: Object.values(state.prs).map(pr => ({
      prId: pr.id,
      blockers: blockers(state, pr.id),
      stages: pr.candidateId ? progress(state, pr, state.candidates[pr.candidateId]) : []
    }))
  });
}

/** 讨论线程所属的 PR：线程 ID 不是自有属性（例如 `toString`）时视为不存在。 */
const threadPrOf = (state: Workspace) => (threadId: string) =>
  Object.hasOwn(state.threads, threadId) ? state.threads[threadId].prId : undefined;
/**
 * 参照模型的审计分页，按时间从新到旧，规则与 `reader.ts` 的 `audit` 相同：`before` 是游标事件 ID，只返回比它更早的事件
 * （游标事件本身不必匹配筛选）；`prId` 与 `threadId` 同时给出时取交集；还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID。
 * 游标不存在返回 `not_found`，`limit` 必须是 1～{@link auditPageSize}.maximum 的整数。
 */
export function auditPage(state: Workspace, user: Identity, query: AuditQuery): AuditPage {
  authorize(state, user, 'read');
  const limit = pageLimit(query.limit, auditPageSize);
  const threadPr = threadPrOf(state);
  const matches = (event: Audit) =>
    (query.prId === undefined || auditPr(event, threadPr) === query.prId) &&
    (query.threadId === undefined || auditThread(event) === query.threadId);
  let position = state.audit.length;
  if (query.before !== undefined) {
    position = state.audit.findIndex(event => event.id === query.before);
    demand(position >= 0, 'not_found', '审计事件不存在');
  }
  const events: Audit[] = [];
  while (position > 0 && events.length < limit) {
    position--;
    if (matches(state.audit[position])) events.push(state.audit[position]);
  }
  const older = state.audit.slice(0, position).some(matches);
  return structuredClone({ events, nextBefore: older ? events[events.length - 1].id : null });
}
