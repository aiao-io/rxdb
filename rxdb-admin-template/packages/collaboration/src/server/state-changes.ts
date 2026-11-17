import type {
  Audit,
  Comment,
  Invitation,
  Member,
  Notice,
  Policy,
  PullRequest,
  Receipt,
  Review,
  SchemaManifest,
  StoredCandidate,
  Task,
  Thread,
  Workspace
} from '../model.js';
import { canonical } from '../records.js';
import { auditPr, auditThread } from './engine.js';

/** 一条新审计事件与它所属的 PR、讨论线程（供按 PR、按线程分页；与审计分页的筛选规则一致）。 */
export interface AuditEntry {
  event: Audit;
  prId: string | null;
  threadId: string | null;
}
/** 一条评论连同它所属的线程与 PR：写回评论表时用线程，广播失效通知时用 PR。 */
export type ThreadComment = Comment & { threadId: string; prId: string };
/** 讨论线程自身的字段（不含评论），写回线程表时用。 */
export type ThreadRow = Omit<Thread, 'comments'>;
/** 引用的一次推进：期望的旧头与新头，写回时按旧头比较交换。 */
export interface HeadMove {
  from: string | null;
  to: string | null;
}
/** 新增与改动的一组行。 */
export interface RowChanges<T> {
  created: T[];
  updated: T[];
}

/**
 * 命令执行前后局部状态的差异，即写回存储时要动的全部行：引擎只改它加载过的那几行，
 * 写回因此只与本次命令涉及的内容有关，与工作区的历史长度无关。
 */
export interface WorkspaceChanges {
  /** 新增或改动的成员。 */
  members: Member[];
  /** 新增或改动的邀请。 */
  invitations: Invitation[];
  /** 新的审批策略版本；没有变化时为 null。 */
  policy: Policy | null;
  /** 新登记的数据模式版本（清单只追加，治理行指向它）；没有变化时为 null。 */
  schema: SchemaManifest | null;
  /** 新建的任务（带创建时的头）。 */
  tasks: Task[];
  /** 已有任务的头推进，键为任务 ID。 */
  heads: Record<string, HeadMove>;
  /** 共享头的推进；没有变化时为 null。 */
  shared: HeadMove | null;
  prs: RowChanges<PullRequest>;
  /** 新生成的候选（候选不可变）。 */
  candidates: StoredCandidate[];
  /** 新增的审核记录（审核记录不可变）。 */
  reviews: Review[];
  threads: RowChanges<ThreadRow>;
  comments: RowChanges<ThreadComment>;
  /** 新增的通知与新标为已读的通知。 */
  notifications: { created: Notice[]; read: Notice[] };
  /** 新增的审计事件，按发生顺序。 */
  audit: AuditEntry[];
  /** 新增的回执。 */
  receipts: Receipt[];
  /** 修订号是否前进（命令改变了状态）。 */
  revised: boolean;
}

/** 引擎只新增、改动行，从不删除；删除说明引擎与存储约定不一致，按内部错误处理。 */
function keyed<T>(before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>, name: string) {
  const changes: RowChanges<T> = { created: [], updated: [] };
  for (const id of Object.keys(before))
    if (!Object.hasOwn(after, id)) throw new Error(`The ${name} ${id} disappeared from the workspace state`);
  for (const [id, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, id)) changes.created.push(value);
    else if (canonical(before[id]) !== canonical(value)) changes.updated.push(value);
  }
  return changes;
}
/** 按 ID 对比只追加的列表。 */
function listed<T extends { id: string }>(before: readonly T[], after: readonly T[], name: string) {
  return keyed(
    Object.fromEntries(before.map(item => [item.id, item])),
    Object.fromEntries(after.map(item => [item.id, item])),
    name
  );
}
/** 不可变的行只允许新增。 */
function appended<T>(changes: RowChanges<T>, name: string): T[] {
  if (changes.updated.length) throw new Error(`Immutable ${name} rows were modified`);
  return changes.created;
}
function taskChanges(before: Workspace, after: Workspace) {
  const changes = keyed(before.tasks, after.tasks, 'task');
  const heads: Record<string, HeadMove> = {};
  for (const task of changes.updated) {
    const previous = before.tasks[task.id];
    if (canonical({ ...previous, head: task.head }) !== canonical(task))
      throw new Error(`Only the head of task ${task.id} may change`);
    heads[task.id] = { from: previous.head, to: task.head };
  }
  return { tasks: changes.created, heads };
}
function threadChanges(before: Workspace, after: Workspace) {
  const threads: RowChanges<ThreadRow> = { created: [], updated: [] };
  const comments: RowChanges<ThreadComment> = { created: [], updated: [] };
  const rows = keyed(before.threads, after.threads, 'thread');
  for (const thread of [...rows.created, ...rows.updated]) {
    const previous = Object.hasOwn(before.threads, thread.id) ? before.threads[thread.id] : undefined;
    const { comments: list, ...row } = thread;
    if (!previous) threads.created.push(row);
    else if (canonical({ ...previous, comments: [] }) !== canonical({ ...row, comments: [] }))
      threads.updated.push(row);
    const changed = listed(previous?.comments ?? [], list, 'comment');
    comments.created.push(...changed.created.map(comment => ({ ...comment, threadId: thread.id, prId: thread.prId })));
    comments.updated.push(...changed.updated.map(comment => ({ ...comment, threadId: thread.id, prId: thread.prId })));
  }
  return { threads, comments };
}
function noticeChanges(before: Workspace, after: Workspace) {
  const changes = listed(before.notifications, after.notifications, 'notification');
  for (const notice of changes.updated) {
    const previous = before.notifications.find(item => item.id === notice.id)!;
    if (canonical({ ...previous, read: notice.read }) !== canonical(notice) || !notice.read)
      throw new Error(`Only marking notification ${notice.id} as read is supported`);
  }
  return { created: changes.created, read: changes.updated };
}

/**
 * 对比命令执行前后的局部状态，得到要写回的行。`before` 是加载完成时的副本，`after` 是引擎执行后的同一份状态。
 * 只比较加载过的行：没加载的行两边都不存在，不会被误判为删除或改动。
 */
export function stateChanges(before: Workspace, after: Workspace): WorkspaceChanges {
  const members = keyed(before.members, after.members, 'member');
  const invitations = keyed(before.invitations, after.invitations, 'invitation');
  return {
    members: [...members.created, ...members.updated],
    invitations: [...invitations.created, ...invitations.updated],
    policy: canonical(before.policy) === canonical(after.policy) ? null : after.policy,
    schema: before.schemaVersion === after.schemaVersion ? null : after.schema,
    ...taskChanges(before, after),
    shared: before.head === after.head ? null : { from: before.head, to: after.head },
    prs: keyed(before.prs, after.prs, 'PR'),
    candidates: appended(keyed(before.candidates, after.candidates, 'candidate'), 'candidate'),
    reviews: appended(listed(before.reviews, after.reviews, 'review'), 'review'),
    ...threadChanges(before, after),
    notifications: noticeChanges(before, after),
    audit: appended(listed(before.audit, after.audit, 'audit'), 'audit').map(event => ({
      event,
      prId: auditPr(event, threadId =>
        Object.hasOwn(after.threads, threadId) ? after.threads[threadId].prId : undefined
      ),
      threadId: auditThread(event)
    })),
    receipts: appended(keyed(before.receipts, after.receipts, 'receipt'), 'receipt'),
    revised: before.revision !== after.revision
  };
}
