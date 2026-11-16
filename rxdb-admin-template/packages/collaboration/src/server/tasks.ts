import {
  demand,
  type Command,
  type Commit,
  type Environment,
  type Identity,
  type Task,
  type Workspace
} from '../model.js';
import { assertRecords, canonical } from '../records.js';
import { authorize, editTask, expected, managePr, prFor, taskFor } from './access.js';

export function taskCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment
): Record<string, unknown> | undefined {
  if (command.type === 'task') {
    authorize(state, user, 'edit');
    expected(state.head, command.expectedHead);
    demand(!state.tasks[command.id], 'exists', '任务标识已存在');
    state.tasks[command.id] = {
      id: command.id,
      name: command.name,
      ownerId: user.id,
      base: state.head,
      head: state.head,
      originTaskId: null
    };
    return { taskId: command.id, head: state.head };
  }
  if (command.type === 'upload') return upload(state, user, command);
  if (command.type === 'fork') return fork(state, user, command);
  if (command.type === 'pr') {
    const task = taskFor(state, command.taskId);
    editTask(state, user, task);
    demand(task.head !== null && task.head !== task.base, 'empty', '先同步任务变更再创建 PR');
    demand(!state.prs[command.id], 'exists', 'PR 标识已存在');
    demand(
      !Object.values(state.prs).some(pr => pr.taskId === task.id && ['draft', 'review'].includes(pr.status)),
      'exists',
      '任务已有打开的 PR'
    );
    state.prs[command.id] = {
      id: command.id,
      taskId: task.id,
      title: command.title,
      authorId: user.id,
      status: 'draft',
      revision: 0,
      candidateId: null,
      subscribers: [user.id]
    };
    return { prId: command.id, head: task.head };
  }
  if (command.type === 'pr_state') {
    const pr = prFor(state, command.prId);
    managePr(state, user, pr);
    expected(pr.revision, command.expectedRevision);
    demand(pr.status !== 'merged', 'state', '合并后的 PR 不能重开');
    demand(
      !Object.values(state.prs).some(
        other => other.id !== pr.id && other.taskId === pr.taskId && ['draft', 'review'].includes(other.status)
      ) || command.status === 'closed',
      'exists',
      '任务已有打开的 PR'
    );
    pr.status = command.status;
    pr.revision++;
    pr.candidateId = null;
    return { prId: pr.id, revision: pr.revision, at: env.now };
  }
  return undefined;
}
function upload(state: Workspace, user: Identity, command: Extract<Command, { type: 'upload' }>) {
  const task = taskFor(state, command.taskId);
  editTask(state, user, task);
  demand(task.head === command.expectedHead, 'diverged', '任务已分叉，请另存为新任务', { remoteHead: task.head });
  demand(
    !Object.values(state.prs).some(pr => pr.taskId === task.id && pr.status === 'merged'),
    'state',
    '已合并任务请开始新任务'
  );
  const head = acceptChain(state, user, task, command.expectedHead, command.commits);
  task.head = head;
  for (const pr of Object.values(state.prs).filter(item => item.taskId === task.id)) {
    pr.revision++;
    pr.candidateId = null;
  }
  return { taskId: task.id, head };
}
function fork(state: Workspace, user: Identity, command: Extract<Command, { type: 'fork' }>) {
  const original = taskFor(state, command.taskId);
  editTask(state, user, original);
  demand(!state.tasks[command.id], 'exists', '任务标识已存在');
  demand(reachable(state, original.head, command.expectedHead), 'ancestry', '无法确认分叉起点');
  const head = acceptChain(state, user, original, command.expectedHead, command.commits);
  state.tasks[command.id] = {
    ...original,
    id: command.id,
    name: command.name,
    head,
    ownerId: user.id,
    originTaskId: original.id
  };
  return { taskId: command.id, head };
}
function acceptChain(state: Workspace, user: Identity, task: Task, start: string | null, commits: Commit[]): string {
  demand(commits.length > 0 && commits.length <= 100, 'invalid', '一次同步需要 1～100 个提交');
  demand(reachable(state, start, task.base), 'ancestry', '提交起点不属于该任务');
  let head = start;
  for (const commit of commits) {
    demand(commit.parent === head, 'ancestry', '提交父链不连续');
    assertRecords(commit.records);
    const existing = state.commits[commit.id];
    demand(!existing || canonical(existing) === canonical(commit), 'idempotency', '相同提交 ID 不能修改内容或作者');
    demand(existing || commit.authorId === user.id, 'forbidden', '新提交作者必须是当前用户');
    demand(!existing || reachable(state, task.head, commit.id), 'ancestry', '不能接管其他任务的提交');
    demand(!reachable(state, head, commit.id), 'ancestry', '提交图不能包含环');
    state.commits[commit.id] = structuredClone(commit);
    head = commit.id;
  }
  demand(head !== null, 'empty', '没有可上传的提交');
  return head;
}
export function reachable(state: Workspace, head: string | null, ancestor: string | null): boolean {
  const visited = new Set<string>();
  while (head !== null) {
    if (head === ancestor) return true;
    if (visited.has(head) || !state.commits[head]) return false;
    visited.add(head);
    head = state.commits[head].parent;
  }
  return ancestor === null;
}
