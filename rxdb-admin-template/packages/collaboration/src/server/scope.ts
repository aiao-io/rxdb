import type { Command, Workspace } from '../model.js';
import type { GovernanceLock, WorkspaceLoader } from './store.js';

/**
 * 锁定之后发现需要的行集合变了（例如上传锁定任务名下的 PR 之后、取得任务引用之前，又有人在这个任务上建了 PR），
 * 已取得的锁不够覆盖新行，又不能逆着锁顺序补锁。仓储收到它就回滚整个事务并从头重试。
 */
export class RetryCommand extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RetryCommand';
  }
}

/**
 * 成员、邀请、策略与数据模式命令对治理行加排他锁；其余命令加共享锁，彼此并行，但都要等在途的这些变更提交。
 * 登记数据模式要校验全部共享记录，持排他锁期间合并（共享锁）无法推进共享分支。
 */
const exclusive: readonly Command['type'][] = [
  'invite',
  'revoke_invite',
  'accept_invite',
  'member',
  'policy',
  'schema'
];
/** 命令对治理行加的锁。 */
export const governanceLock = (command: Command): GovernanceLock =>
  exclusive.includes(command.type) ? 'update' : 'share';

type Gatherer<K extends Command['type']> = (
  loader: WorkspaceLoader,
  command: Extract<Command, { type: K }>
) => Promise<void>;
type Gatherers = { [K in Command['type']]: Gatherer<K> };

const nothing = () => Promise.resolve();
const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * 上传：锁定任务名下的全部 PR（上传要让它们的候选过期）→ 共享引用加共享锁（推导父内容要读共享记录并沿共享分支回退，
 * 期间合并不能推进）→ 锁定任务引用 → 确认这期间没有新建 PR。
 */
async function upload(loader: WorkspaceLoader, command: Extract<Command, { type: 'upload' }>) {
  const locked = await loader.lockTaskPrs(command.taskId);
  await loader.sharedRef('share');
  await loader.task(command.taskId, 'update');
  if (!sameIds(locked, await loader.taskPrIds(command.taskId))) throw new RetryCommand('PRs of the task changed');
}
/** 改 PR 状态：锁定 PR → 锁定其任务引用（与建 PR、重开同一任务的其他 PR 串行）→ 读该任务名下的全部 PR。 */
async function prState(loader: WorkspaceLoader, command: Extract<Command, { type: 'pr_state' }>) {
  const taskId = await loader.prTask(command.prId);
  await loader.lockPrs([command.prId]);
  if (taskId === undefined) return;
  await loader.task(taskId, 'update');
  await loader.taskPrs(taskId);
}
/** 生成候选：锁定 PR → 共享引用加共享锁（读共享内容期间不许合并推进）→ 来源任务、讨论与重新打开线程要比较的历史候选。 */
async function candidate(loader: WorkspaceLoader, command: Extract<Command, { type: 'candidate' }>) {
  await loader.lockPrs([command.prId]);
  const pr = loader.state.prs[command.prId];
  if (!pr) return;
  await loader.sharedRef('share');
  await loader.task(pr.taskId, 'none');
  await loader.prThreads(pr.id);
  const anchored = Object.values(loader.state.threads)
    .filter(thread => thread.required && thread.resolved && thread.candidateId && thread.recordId)
    .map(thread => thread.resolvedCandidateId ?? thread.candidateId!);
  await loader.candidates([...new Set(anchored)]);
}
/** 审核：锁定 PR → 来源任务、该 PR 的审核记录与所审的候选；共享头只用来判断候选是否当前，读最新已提交值即可。 */
async function review(loader: WorkspaceLoader, command: Extract<Command, { type: 'review' }>) {
  await loader.lockPrs([command.prId]);
  const pr = loader.state.prs[command.prId];
  if (!pr) return;
  await loader.task(pr.taskId, 'none');
  await loader.prReviews(pr.id);
  if (command.candidateId !== null) await loader.candidates([command.candidateId]);
}
/** 发起讨论：锁定 PR → 同 ID 的线程（判重）与锚定的候选；锚定到记录时共享引用加共享锁，保证推导锚点时共享内容不变。 */
async function thread(loader: WorkspaceLoader, command: Extract<Command, { type: 'thread' }>) {
  await loader.lockPrs([command.prId]);
  await loader.threads([command.id]);
  if (command.candidateId !== null) await loader.candidates([command.candidateId]);
  if (command.recordId !== null) await loader.sharedRef('share');
}
/** 回复、编辑评论、处理线程：经线程找到所属 PR 并锁定 → 读线程与全部评论。 */
async function threadAction(loader: WorkspaceLoader, command: { threadId: string }) {
  const prId = await loader.threadPr(command.threadId);
  if (prId === undefined) return;
  await loader.lockPrs([prId]);
  await loader.threads([command.threadId]);
}
/** 在线状态：读 PR 与其来源任务；带记录时共享引用加共享锁，保证判断记录是否存在时共享内容不变。 */
async function presence(loader: WorkspaceLoader, command: Extract<Command, { type: 'presence' }>) {
  if (command.prId !== null) await loader.prs([command.prId]);
  const pr = command.prId === null ? undefined : loader.state.prs[command.prId];
  if (command.recordId !== null) await loader.sharedRef('share');
  if (pr) await loader.task(pr.taskId, 'none');
}
/** 合并：锁定 PR → 锁定共享引用 → 来源任务引用加共享锁 → 候选、审核记录与讨论线程。 */
async function merge(loader: WorkspaceLoader, command: Extract<Command, { type: 'merge' }>) {
  await loader.lockPrs([command.prId]);
  const pr = loader.state.prs[command.prId];
  if (!pr) return;
  await loader.sharedRef('update');
  await loader.task(pr.taskId, 'share');
  await loader.candidates([command.candidateId]);
  await loader.prReviews(pr.id);
  await loader.prThreads(pr.id);
}

/** 每种命令要加载与加锁的行，调用顺序就是加锁顺序：PR 行在前，引用行在后，共享引用先于任务引用。 */
const gatherers: Gatherers = {
  invite: (loader, command) => loader.invitation(command.id),
  revoke_invite: (loader, command) => loader.invitation(command.id),
  accept_invite: (loader, command) => loader.invitation(command.id),
  member: nothing,
  policy: nothing,
  schema: nothing,
  task: (loader, command) => loader.task(command.id, 'none'),
  upload,
  fork: async (loader, command) => {
    // 推导父内容要读共享记录并沿共享分支回退，共享引用加共享锁，期间合并不能推进
    await loader.sharedRef('share');
    await loader.task(command.taskId, 'none');
    await loader.task(command.id, 'none');
  },
  pr: async (loader, command) => {
    // 锁定任务引用后再读任务名下的 PR：建 PR 与重开 PR 都先锁任务引用，「每个任务至多一个打开的 PR」因此不会被并发打破
    await loader.task(command.taskId, 'update');
    await loader.taskPrs(command.taskId);
    await loader.prs([command.id]);
  },
  pr_state: prState,
  candidate,
  review,
  dismiss: async (loader, command) => {
    await loader.lockPrs([command.prId]);
    await loader.prReviews(command.prId);
  },
  thread,
  reply: threadAction,
  edit_comment: threadAction,
  resolve_thread: threadAction,
  subscribe: (loader, command) => loader.lockPrs([command.prId]),
  read_notice: nothing,
  presence,
  merge
};

/**
 * 按命令加载并锁定它涉及的行，返回只含这些行的局部状态；工作区不存在时返回 undefined。
 * 顺序固定：治理行（普通命令共享锁，成员、邀请、策略命令排他锁）→ 回执 → PR 行 → 引用行，所有读取都在取得治理行锁之后，
 * 因此撤权一旦提交，后续命令必然按撤权后的成员关系裁决；撤权本身要等在途的共享锁持有者（批准、合并、评论）提交。
 * 保留期内已有回执的重试不再加 PR 与引用的锁，只按任务校验编辑权限后原样返回回执。
 */
export async function gather(
  loader: WorkspaceLoader,
  user: { id: string },
  command: Command,
  now: number
): Promise<Workspace | undefined> {
  if (!(await loader.governance(governanceLock(command)))) return undefined;
  if (command.type === 'presence') {
    await presence(loader, command);
    return loader.state;
  }
  if (await loader.receipt(command.operationId, now)) {
    if (command.type === 'upload' || command.type === 'fork') await loader.task(command.taskId, 'none');
    return loader.state;
  }
  if (command.type === 'read_notice') await loader.notification(command.id, user.id);
  await (gatherers[command.type] as (loader: WorkspaceLoader, command: Command) => Promise<void>)(loader, command);
  return loader.state;
}
