import type { CollaborationController } from './controller.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import {
  alert,
  badge,
  button,
  code,
  element,
  iconTile,
  input,
  modal,
  modalActions,
  statusDot,
  type Perform
} from './elements.js';
import { personName, shortId } from './format.js';
import { icon } from './icons.js';
import { tx } from './translate.js';

/** 任务视图用到的控制器部分。 */
export type TaskViewController = Pick<
  CollaborationController,
  | 'task'
  | 'snapshot'
  | 'user'
  | 'syncing'
  | 'online'
  | 'unsavedInput'
  | 'uploadExpired'
  | 'sync'
  | 'discardDraft'
  | 'fork'
  | 'fetchRemote'
>;

/** 任务视图里与 PR 相关的入口，由挂载方提供；不传则不显示。 */
export interface TaskPrActions {
  /** 这个任务进行中的 PR（草稿或待审核）；有的话显示「查看 PR」而不是「创建 PR…」。 */
  openPr?: { id: string; title: string };
  /** 打开「创建 PR」对话框；任务还没有同步过的提交、或没有编辑权限时为 undefined。 */
  createPr?: () => void;
  /** 切到 PR 分区并选中这个 PR。 */
  showPr?: (id: string) => void;
}

type TaskState = 'saved' | 'committed' | 'synced';

/**
 * 打开着的团队任务的状态条（ADMIN-US-205 AC#3～5、ADMIN-US-206）：任务名、三种可见状态之一——已保存未提交（工作树有条目）、
 * 已提交未同步（远端头之后有本机提交）、已同步——以及同步、确认过期上传、创建或查看 PR、另存为新任务、拉取远端版本与放弃草稿。
 * 下方是版本信息、说明与共同起点之后的本机提交历史。记录的新增、修改与删除在应用渲染的模型驱动编辑界面里，每次保存都进入任务工作树。
 * 表单里还没点保存的输入属于编辑界面，不在工作树里，同步也不会带上它：编辑界面报告有这样的输入时（ADMIN-US-205 AC#5），
 * 在三种状态之外另起一行标出；这时同步与切换都会被控制器拦下，要先在编辑界面里保存或取消。
 */
export function taskView(
  controller: TaskViewController,
  perform: Perform,
  disclosures: Disclosures,
  pr: TaskPrActions = {}
): HTMLElement {
  const task = controller.task!;
  const view = element('section', '', 'rounded-box border border-base-300 bg-base-100');
  const top = element('div', '', 'flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5');
  const title = element('div', '', 'flex min-w-0 items-start gap-3');
  const text = element('div', '', 'min-w-0 space-y-1');
  const heading = element('h2', tx('任务：{v0}', { v0: task.name }), 'text-base font-semibold break-all', true);
  const kind = stateKind(controller);
  const stateRow = element('div', '', 'flex items-center gap-2 text-sm');
  const state = element('p', stateText(controller), 'font-medium', true);
  state.setAttribute('role', 'status');
  state.dataset['taskState'] = kind;
  stateRow.append(statusDot(kind === 'synced' ? 'success' : 'warning'), state);
  text.append(heading, stateRow);
  title.append(iconTile('git-branch'), text);
  top.append(title, actions(controller, perform, pr, kind));
  view.append(top);
  const notices = element('div', '', 'space-y-2 px-4 pb-4 empty:hidden sm:px-5');
  if (controller.unsavedInput) notices.append(unsavedLine());
  if (task.restoring) notices.append(alert('工作树来自历史版本的恢复，同步后形成新的提交', 'info'));
  view.append(notices);
  view.append(meta(controller), localHistory(controller, disclosures));
  return view;
}

/** 「有未保存的输入」那一行：与状态行同为 `status`，屏幕阅读器在它出现、消失时同样会读出。 */
function unsavedLine(): HTMLElement {
  const box = element(
    'div',
    '',
    'flex items-start gap-3 rounded-box border border-warning/60 bg-warning/10 px-4 py-3 text-sm'
  );
  const line = element('p', '有未保存的输入：先在编辑界面里保存或取消，才能同步或切换任务', 'font-medium');
  line.setAttribute('role', 'status');
  line.dataset['unsavedInput'] = 'true';
  box.append(icon('triangle-alert', 'mt-0.5 size-4 text-warning'), line);
  return box;
}

/** 三种状态之一：已保存未提交（`saved`）优先，其次已提交未同步（`committed`），否则已同步（`synced`）。 */
function stateKind(controller: TaskViewController): TaskState {
  const task = controller.task!;
  if (task.saved || task.restoring) return 'saved';
  return task.unpushed ? 'committed' : 'synced';
}
/** 状态行的文案，与 {@link stateKind} 一一对应。 */
function stateText(controller: TaskViewController): string {
  const task = controller.task!;
  if (task.saved || task.restoring) return tx('有已保存未提交的改动（{v0} 项）', { v0: task.saved });
  if (task.unpushed) return tx('有已提交未同步的提交（{v0} 个）', { v0: task.unpushed });
  return tx('已同步：本机与远端确认的版本一致');
}
/** 版本在界面上的写法：共享分支根（任务从空分支起步、还没有提交）显示为「空」，其余显示短标识。 */
function versionText(controller: TaskViewController, head: string): string {
  return head === controller.snapshot?.root ? tx('空') : shortId(head);
}

/** 版本信息条：本地版本、远端确认、待上传提交与已保存未提交，完整版本 ID 放在 data 属性与悬停提示里。 */
function meta(controller: TaskViewController): HTMLElement {
  const task = controller.task!;
  const strip = element(
    'div',
    '',
    'space-y-1 border-t border-base-300 bg-base-200/50 px-4 py-2.5 text-xs text-base-content/70 sm:px-5'
  );
  const versions = element(
    'p',
    tx('本地版本：{v0} · 远端确认：{v1} · 待上传提交：{v2} · 已保存未提交：{v3}', {
      v0: versionText(controller, task.localHead),
      v1: versionText(controller, task.remoteHead),
      v2: task.unpushed,
      v3: task.saved || task.restoring ? tx('有') : tx('无')
    }),
    'font-mono break-all',
    true
  );
  versions.dataset['localHead'] = task.localHead;
  versions.dataset['remoteHead'] = task.remoteHead;
  versions.title = `${task.localHead} / ${task.remoteHead}`;
  strip.append(versions, element('p', '表单里的输入点「保存」之后才进入任务工作树；同步只提交已保存的改动'));
  return strip;
}

function actions(controller: TaskViewController, perform: Perform, pr: TaskPrActions, kind: TaskState): HTMLElement {
  const task = controller.task!;
  const bar = element('div', '', 'flex flex-wrap items-center gap-2');
  bar.append(
    button('同步', () => perform(() => controller.sync()), controller.syncing, {
      tone: kind === 'synced' ? 'default' : 'primary',
      icon: 'cloud-upload'
    })
  );
  // 待确认的上传已超过自动重试期限：同步不会自动重发，用户核对远端版本后在这里确认
  if (controller.uploadExpired())
    bar.append(
      button('确认同步过期提交', () => perform(() => controller.sync(true)), controller.syncing, {
        tone: 'warning',
        icon: 'triangle-alert'
      })
    );
  if (pr.openPr && pr.showPr) {
    const target = pr.openPr.id;
    bar.append(button('查看 PR', () => pr.showPr!(target), false, { icon: 'git-pull-request' }));
  } else if (pr.createPr) bar.append(button('创建 PR…', pr.createPr, false, { icon: 'git-pull-request' }));
  const remote = controller.snapshot?.tasks.find(item => item.id === task.context.taskId);
  if (remote && remote.head !== task.remoteHead)
    bar.append(
      button('拉取远端版本', () => perform(() => controller.fetchRemote()), false, { icon: 'cloud-download' })
    );
  bar.append(
    button('另存为新任务…', () => openFork(controller, perform), !controller.online, {
      tone: 'ghost',
      icon: 'git-fork'
    })
  );
  if (task.saved || task.restoring)
    bar.append(button('放弃草稿', () => confirmDiscard(controller, perform), false, { tone: 'ghost', icon: 'undo-2' }));
  return bar;
}

/** 另存为新任务：先把已保存的改动形成提交，再以远端头为分叉起点另存；原任务与 PR 保持原远端版本。 */
function openFork(controller: TaskViewController, perform: Perform): void {
  const task = controller.task!;
  const { dialog, box, close } = modal('另存为新任务', {
    icon: 'git-fork',
    description:
      '已保存的改动先形成提交，再另存为一个新任务；原任务与它的 PR 保持原来的远端版本，之后可以拉取远端版本跟随。'
  });
  const name = input('另存任务名称', tx('{v0}（分叉）', { v0: task.name }), 'text', { size: 'md' });
  box.append(
    name.wrapper,
    modalActions(
      button('取消', close, false, { tone: 'ghost' }),
      button(
        '另存为新任务',
        () => {
          close();
          return perform(() => controller.fork(name.control.value));
        },
        !controller.online,
        { tone: 'primary', icon: 'git-fork' }
      )
    )
  );
  dialog.showModal();
}

/** 放弃草稿前确认：已保存未提交的改动会全部撤回，列表与表单回到任务头；已形成的提交不受影响。 */
function confirmDiscard(controller: TaskViewController, perform: Perform): void {
  const { dialog, box, close } = modal('放弃草稿', {
    icon: 'undo-2',
    description: '已保存未提交的改动会全部撤回，列表与表单回到任务上次提交的版本；已形成的提交不受影响。'
  });
  box.append(
    modalActions(
      button('取消', close, false, { tone: 'ghost' }),
      button(
        '确认放弃',
        () => {
          close();
          return perform(() => controller.discardDraft());
        },
        false,
        { tone: 'danger', icon: 'undo-2' }
      )
    )
  );
  dialog.showModal();
}

/**
 * 本机提交历史：任务分支上共同起点之后的提交（新到旧），每个提交的 ID、作者与第一父与服务端一致（跨设备续作时由导入保证），
 * 标出已同步与待上传。展开时才生成内容。
 */
function localHistory(controller: TaskViewController, disclosures: Disclosures): HTMLElement {
  const task = controller.task!;
  const { details, open } = lazyDetails(`task-commits:${task.context.taskId}`, disclosures);
  details.className = 'group/history border-t border-base-300';
  const summary = element(
    'summary',
    '',
    'flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-base-200/60 sm:px-5'
  );
  summary.append(
    icon('chevron-down', 'size-4 -rotate-90 transition group-open/history:rotate-0'),
    element('span', tx('本机提交历史（{v0} 个）', { v0: task.commits.length }), '', true)
  );
  details.append(summary);
  if (!open) return details;
  const list = element('ol', '', 'space-y-1 px-4 pb-4 sm:px-5');
  if (!task.commits.length) list.append(element('li', '共同起点之后还没有提交', 'text-sm text-base-content/70'));
  for (const commit of task.commits) {
    const item = element('li', '', 'flex items-start gap-3 rounded-field px-2 py-2 hover:bg-base-200/60');
    item.dataset['commitId'] = commit.id;
    item.dataset['authorId'] = commit.authorId ?? '';
    const body = element('div', '', 'min-w-0 flex-1 space-y-0.5');
    const line = element('p', '', 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70');
    line.append(
      element('span', personName(controller.snapshot?.members ?? [], commit.authorId, controller.user), '', true),
      code(shortId(commit.id), commit.id),
      element('span', tx('父提交：{v0}', { v0: versionText(controller, commit.parentId) }), '', true)
    );
    body.append(element('p', commit.message, 'truncate text-sm font-medium', true), line);
    item.append(
      icon('git-commit-horizontal', 'mt-0.5 size-4 text-base-content/70'),
      body,
      badge(commit.synced ? '已同步' : '待上传', commit.synced ? 'success' : 'warning')
    );
    list.append(item);
  }
  details.append(list);
  return details;
}
