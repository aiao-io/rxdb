import { demand, type Command, type Commit, type Environment, type Identity, type Workspace } from '../model.js';
import { authorize, editTask, expected, managePr, prFor, taskFor } from './access.js';
import { preloaded, type Plan, type Run } from './plan.js';

/** 上传与另存分叉需要预加载的数据：命令里已存在的提交，分叉另需原任务头到共同起点的路径；其余任务命令不需要。 */
export function taskPlan(state: Workspace, user: Identity, command: Command): Plan | undefined {
  if (command.type !== 'upload' && command.type !== 'fork') return undefined;
  const task = taskFor(state, command.taskId);
  editTask(state, user, task);
  const ids = command.commits.map(commit => commit.id);
  return command.type === 'upload' ? { type: 'upload', ids } : { type: 'fork', ids, head: task.head, base: task.base };
}

export function taskCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment,
  run: Run
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
  if (command.type === 'upload') return upload(state, user, command, run);
  if (command.type === 'fork') return fork(state, user, command, run);
  if (command.type === 'pr') {
    demand(command.target === 'shared', 'invalid', 'PR 目标必须是共享分支');
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
      description: command.description,
      target: command.target,
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
function upload(state: Workspace, user: Identity, command: Extract<Command, { type: 'upload' }>, run: Run) {
  const task = taskFor(state, command.taskId);
  editTask(state, user, task);
  demand(task.head === command.expectedHead, 'diverged', '任务已分叉，请另存为新任务', { remoteHead: task.head });
  demand(
    !Object.values(state.prs).some(pr => pr.taskId === task.id && pr.status === 'merged'),
    'state',
    '已合并任务请开始新任务'
  );
  // 起点就是任务头，而任务头沿父链必然回到共同起点（建任务与每次上传都保持这一点），无需再回溯整条链
  const head = acceptChain(user, command.expectedHead, command.commits, run);
  task.head = head;
  for (const pr of Object.values(state.prs).filter(item => item.taskId === task.id)) {
    pr.revision++;
    pr.candidateId = null;
  }
  return { taskId: task.id, head };
}
function fork(state: Workspace, user: Identity, command: Extract<Command, { type: 'fork' }>, run: Run) {
  const original = taskFor(state, command.taskId);
  editTask(state, user, original);
  demand(!state.tasks[command.id], 'exists', '任务标识已存在');
  // 分叉起点必须落在原任务头到共同起点（含）之间；没有提交的共同起点（null）只对从空共享分支开始的任务有效
  demand(
    command.expectedHead === null ?
      original.base === null
    : preloaded(run.facts.path, 'fork path').has(command.expectedHead),
    'ancestry',
    '无法确认分叉起点'
  );
  const head = acceptChain(user, command.expectedHead, command.commits, run);
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
/**
 * 接受一条提交链：每个提交的父指针必须接上前一个（第一个接上 `start`）。已存在的提交只做指纹相等与归属校验，
 * 不重复写入，归属以预加载的路径为准；新提交的作者必须是当前用户。
 * 新 ID 的提交不可能成环（此前没有任何提交引用它），所以不需要沿祖先链回溯，成本只与本次上传的提交数有关。
 */
function acceptChain(user: Identity, start: string | null, commits: Commit[], run: Run): string {
  demand(commits.length > 0 && commits.length <= 100, 'invalid', '一次同步需要 1～100 个提交');
  const known = new Map(preloaded(run.facts.existing, 'existing commits'));
  const path = preloaded(run.facts.path, 'commit ancestry');
  let head = start;
  for (const commit of commits) {
    demand(commit.parent === head, 'ancestry', '提交父链不连续');
    const existing = known.get(commit.id);
    demand(!existing || existing.fingerprint === commit.fingerprint, 'idempotency', '相同提交 ID 不能修改内容或作者');
    demand(existing || commit.authorId === user.id, 'forbidden', '新提交作者必须是当前用户');
    demand(!existing || path.has(commit.id), 'ancestry', '不能接管其他任务的提交');
    demand(commit.id !== commit.parent, 'ancestry', '提交图不能包含环');
    if (!existing) {
      known.set(commit.id, {
        id: commit.id,
        parent: commit.parent,
        authorId: commit.authorId,
        message: commit.message,
        fingerprint: commit.fingerprint
      });
      run.effects.commits.push(structuredClone(commit));
    }
    head = commit.id;
  }
  demand(head !== null, 'empty', '没有可上传的提交');
  return head;
}
