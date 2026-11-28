import { demand, type Command, type Environment, type Identity, type Thread, type Workspace } from '../model.js';
import { authorize, expected, openPr, prFor } from './access.js';
import { preloaded, type Facts, type Plan, type Run } from './plan.js';

export function notify(
  state: Workspace,
  userId: string,
  prId: string,
  threadId: string | null,
  mentions: string[],
  env: Environment
): void {
  const pr = prFor(state, prId);
  for (const id of new Set([...pr.subscribers, ...mentions])) {
    const member = state.members[id];
    if (id === userId || !member?.active || !member.permissions.includes('read')) continue;
    state.notifications.push({
      id: env.id(),
      userId: id,
      prId,
      threadId,
      candidateId: pr.candidateId,
      read: false,
      at: env.now
    });
  }
}
/** 评论锚点需要预加载的数据：锚定的那条记录在候选结果、来源与目标三处的取值；其余讨论命令不需要。 */
export function discussionPlan(state: Workspace, user: Identity, command: Command): Plan | undefined {
  if (command.type === 'thread') {
    threadGuards(state, user, command);
    return command.recordId ?
        {
          type: 'anchor',
          shared: { head: state.head, root: state.root },
          candidate: state.candidates[command.candidateId!],
          recordId: command.recordId
        }
      : undefined;
  }
  return undefined;
}
export function discussionCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment,
  run: Run
): Record<string, unknown> | undefined {
  if (command.type === 'thread') return startThread(state, user, command, env, run.facts);
  if (command.type === 'reply') {
    authorize(state, user, 'comment');
    const thread = threadFor(state, command.threadId);
    openPr(state, thread.prId);
    demand(command.body.trim(), 'invalid', '评论不能为空');
    const id = env.id();
    thread.comments.push({ id, authorId: user.id, body: command.body, deleted: false, revision: 0, at: env.now });
    thread.revision++;
    notify(state, user.id, thread.prId, thread.id, command.mentions, env);
    return { commentId: id };
  }
  if (command.type === 'edit_comment') {
    authorize(state, user, 'comment');
    const thread = threadFor(state, command.threadId);
    openPr(state, thread.prId);
    const comment = thread.comments.find(c => c.id === command.commentId);
    demand(comment && comment.authorId === user.id, 'forbidden', '只能修改自己的评论');
    expected(comment.revision, command.expectedRevision);
    demand(!comment.deleted && (command.deleted || command.body.trim()), 'invalid', '评论已删除或内容为空');
    comment.body = command.deleted ? '' : command.body;
    comment.deleted = command.deleted;
    comment.revision++;
    return { commentId: comment.id, revision: comment.revision };
  }
  if (command.type === 'resolve_thread') {
    authorize(state, user, 'comment');
    const thread = threadFor(state, command.threadId);
    const pr = openPr(state, thread.prId);
    demand(
      thread.comments[0].authorId === user.id ||
        state.members[user.id].permissions.includes('review') ||
        state.members[user.id].permissions.includes('merge'),
      'forbidden',
      '只有线程发起者、审核者或合并者能处理线程'
    );
    expected(thread.revision, command.expectedRevision);
    thread.resolved = command.resolved;
    thread.resolvedCandidateId = command.resolved ? (pr.candidateId ?? thread.candidateId) : null;
    thread.revision++;
    return { threadId: thread.id, prId: pr.id };
  }
  if (command.type === 'subscribe') {
    authorize(state, user, 'read');
    const pr = prFor(state, command.prId);
    pr.subscribers = pr.subscribers.filter(id => id !== user.id);
    if (command.subscribed) pr.subscribers.push(user.id);
    return { subscribed: command.subscribed };
  }
  if (command.type === 'read_notice') {
    authorize(state, user, 'read');
    const notice = state.notifications.find(n => n.id === command.id && n.userId === user.id);
    demand(notice, 'not_found', '通知不存在');
    notice.read = true;
    return { noticeId: notice.id };
  }
  return undefined;
}
function threadFor(state: Workspace, id: string): Thread {
  const thread = state.threads[id];
  demand(thread, 'not_found', '讨论不存在');
  return thread;
}
/** 开始讨论前的授权与锚点校验（不含需要预加载数据才能判断的记录与字段是否属于所选版本）。 */
function threadGuards(state: Workspace, user: Identity, command: Extract<Command, { type: 'thread' }>) {
  authorize(state, user, 'comment');
  const pr = openPr(state, command.prId);
  if (command.required)
    demand(
      state.members[user.id].permissions.includes('review') || state.members[user.id].permissions.includes('merge'),
      'forbidden',
      '标记必须处理需要审核或合并权限'
    );
  if (command.candidateId)
    demand(state.candidates[command.candidateId]?.prId === pr.id, 'not_found', '候选不属于此 PR');
  demand(!command.recordId || command.candidateId, 'invalid', '记录讨论必须绑定候选版本');
  demand(!command.field || command.recordId, 'invalid', '字段讨论必须绑定记录');
  demand(!state.threads[command.id] && command.body.trim(), 'invalid', '讨论已存在或内容为空');
  return pr;
}
function startThread(
  state: Workspace,
  user: Identity,
  command: Extract<Command, { type: 'thread' }>,
  env: Environment,
  facts: Facts
) {
  const pr = threadGuards(state, user, command);
  if (command.recordId) validateAnchor(command, facts);
  state.threads[command.id] = {
    id: command.id,
    prId: pr.id,
    candidateId: command.candidateId,
    recordId: command.recordId,
    field: command.field,
    required: command.required,
    resolved: false,
    resolvedCandidateId: null,
    revision: 0,
    comments: [{ id: env.id(), authorId: user.id, body: command.body, deleted: false, revision: 0, at: env.now }]
  };
  notify(state, user.id, pr.id, command.id, command.mentions, env);
  return { threadId: command.id };
}
/** 锚定的记录必须存在于候选结果、来源或目标之一，字段锚点还要存在于其中某一份的这条记录里。 */
function validateAnchor(command: Extract<Command, { type: 'thread' }>, facts: Facts): void {
  const anchor = preloaded(facts.anchor, 'discussion anchor');
  const rows = [anchor.candidate, anchor.source, anchor.target];
  demand(rows.some(Boolean), 'not_found', '记录不属于所选版本');
  demand(
    !command.field || rows.some(row => row && Object.hasOwn(row.fields, command.field!)),
    'not_found',
    '字段不属于所选版本'
  );
}
