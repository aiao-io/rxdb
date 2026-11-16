import { demand, type Identity, type Permission, type PullRequest, type Task, type Workspace } from '../model.js';
export function authorize(state: Workspace, user: Identity, permission: Permission) {
  const member = state.members[user.id];
  demand(
    user.verified && member?.active && member.permissions.includes('read') && member.permissions.includes(permission),
    'forbidden',
    '当前用户没有操作权限'
  );
  return member;
}
export function taskFor(state: Workspace, id: string): Task {
  const task = state.tasks[id];
  demand(task, 'not_found', '任务不存在');
  return task;
}
export function editTask(state: Workspace, user: Identity, task: Task): void {
  authorize(state, user, 'edit');
  demand(task.ownerId === user.id, 'forbidden', '只有任务所有者可以编辑此任务');
}
export function prFor(state: Workspace, id: string): PullRequest {
  const pr = state.prs[id];
  demand(pr, 'not_found', 'PR 不存在');
  return pr;
}
export function openPr(state: Workspace, id: string): PullRequest {
  const pr = prFor(state, id);
  demand(pr.status !== 'closed' && pr.status !== 'merged', 'state', 'PR 已关闭或合并');
  return pr;
}
export function managePr(state: Workspace, user: Identity, pr: PullRequest): void {
  authorize(state, user, 'read');
  demand(
    (pr.authorId === user.id && state.members[user.id].permissions.includes('edit')) ||
      state.members[user.id].permissions.includes('merge'),
    'forbidden',
    '没有管理此 PR 的权限'
  );
}
export function expected(actual: number | string | null, wanted: number | string | null): void {
  demand(actual === wanted, 'stale', '版本已变化，请刷新后重试', { current: actual });
}
