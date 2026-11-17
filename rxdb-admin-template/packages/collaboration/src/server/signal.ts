import { signalKinds, type SignalKind, type WorkspaceSignal } from '../model.js';
import type { WorkspaceChanges } from './state-changes.js';

/** 一次写事务要广播的内容：失效通知（修订号由写回的最后一条语句补上）与失去读权限的成员。 */
export interface Broadcast {
  changed: Omit<WorkspaceSignal, 'revision'>;
  revoked: string[];
}

const sorted = (values: Iterable<string | null>) =>
  [...new Set([...values].filter((value): value is string => value !== null))].sort();

/**
 * 由一条命令写回的行推导广播内容：哪些部分变了（类别）、涉及哪些 PR 与哪些成员的通知，以及谁失去了读权限。
 * 只用行的标识与类别，不带任何字段内容；与命令类型无关，任何写回同样的行的命令都发同样的通知。
 */
export function broadcastOf(changes: WorkspaceChanges): Broadcast {
  const kinds = new Set<SignalKind>();
  const mark = (kind: SignalKind, when: boolean) => {
    if (when) kinds.add(kind);
  };
  mark('members', changes.members.length > 0 || changes.invitations.length > 0);
  mark('policy', changes.policy !== null);
  mark('schema', changes.schema !== null);
  mark('tasks', changes.tasks.length > 0 || Object.keys(changes.heads).length > 0);
  mark('prs', changes.prs.created.length > 0 || changes.prs.updated.length > 0);
  const details = [
    ...changes.candidates.map(candidate => candidate.prId),
    ...changes.reviews.map(review => review.prId),
    ...[...changes.threads.created, ...changes.threads.updated].map(thread => thread.prId),
    ...[...changes.comments.created, ...changes.comments.updated].map(comment => comment.prId)
  ];
  mark('details', details.length > 0);
  mark('shared', changes.shared !== null);
  const notices = [...changes.notifications.created, ...changes.notifications.read];
  mark('notices', notices.length > 0);
  mark('audit', changes.audit.length > 0);
  return {
    changed: {
      kinds: signalKinds.filter(kind => kinds.has(kind)),
      prIds: sorted([
        ...[...changes.prs.created, ...changes.prs.updated].map(pr => pr.id),
        ...details,
        ...changes.audit.map(entry => entry.prId)
      ]),
      noticeUserIds: sorted(notices.map(notice => notice.userId))
    },
    revoked: sorted(
      changes.members.filter(member => !member.active || !member.permissions.includes('read')).map(member => member.id)
    )
  };
}
