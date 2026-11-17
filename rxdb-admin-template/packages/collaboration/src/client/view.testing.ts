import type { Identity, PullRequestDetail, Workspace, WorkspaceSummary } from '../model.js';
import type { TeamPage } from '../reader.js';
import { referenceSummary } from '../server/reference.testing.js';

/**
 * 客户端用例的数据：按参照模型（与只读投影相同的可见规则）从完整的引擎状态算出团队页视图与 PR 详情，
 * 等价于浏览器把所有窗口都读满时看到的内容。
 */
export function teamSummary(state: Workspace, user: Identity): WorkspaceSummary {
  const view = referenceSummary(state, user);
  return {
    teamId: view.teamId,
    appId: view.appId,
    name: view.name,
    revision: view.revision,
    schemaVersion: view.schemaVersion,
    head: view.head,
    policy: view.policy,
    members: view.members,
    tasks: view.tasks,
    prs: view.prs,
    notifications: view.notifications,
    unread: view.notifications.filter(notice => !notice.read).length,
    earlier: { prs: false, tasks: false, notices: false },
    invitations: view.invitations,
    presence: [],
    auditCount: view.auditCount
  };
}
/** 团队页视图还原成读取结果（{@link TeamPage}），供替身读取接口返回。 */
export function teamPageOf(summary: WorkspaceSummary): TeamPage {
  return {
    teamId: summary.teamId,
    appId: summary.appId,
    name: summary.name,
    revision: summary.revision,
    schemaVersion: summary.schemaVersion,
    head: summary.head,
    policy: summary.policy,
    members: summary.members,
    invitations: summary.invitations,
    tasks: summary.tasks,
    prs: summary.prs,
    earlier: { prs: summary.earlier.prs, tasks: summary.earlier.tasks },
    notices: { notices: summary.notifications, earlier: summary.earlier.notices, unread: summary.unread },
    auditCount: summary.auditCount
  };
}
/** 参照模型下一个 PR 的详情：它的候选、审核、讨论与审批进度。 */
export function detailOf(state: Workspace, user: Identity, prId: string): PullRequestDetail {
  const view = referenceSummary(state, user);
  const governance = view.governance.find(item => item.prId === prId);
  if (!governance) throw new Error(`PR ${prId} is not in the workspace`);
  return {
    prId,
    candidates: Object.fromEntries(Object.entries(view.candidates).filter(([, candidate]) => candidate.prId === prId)),
    reviews: view.reviews.filter(review => review.prId === prId),
    threads: view.threads.filter(thread => thread.prId === prId),
    governance
  };
}
