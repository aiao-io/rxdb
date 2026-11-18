import type { CollaborationController } from './controller.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import { button, element, input, row, section, type Perform } from './elements.js';
import { tx } from './translate.js';

/** 任务视图用到的控制器部分。 */
export type TaskViewController = Pick<
  CollaborationController,
  'task' | 'snapshot' | 'syncing' | 'online' | 'uploadExpired' | 'sync' | 'discardDraft' | 'fork' | 'fetchRemote'
>;

/**
 * 打开着的团队任务的状态与动作（ADMIN-US-205 AC#3～5、ADMIN-US-206）。记录的新增、修改与删除在应用渲染的模型驱动编辑界面里，
 * 每次保存都进入任务工作树；这里把三种可见状态分开显示——已保存未提交（工作树有条目）、已提交未同步（远端头之后有本机提交）、
 * 已同步——并提供同步、确认过期上传、放弃草稿、另存为新任务、拉取远端版本，以及共同起点之后的本机提交历史。
 * 表单里还没点保存的输入属于编辑界面，不在工作树里，同步也不会带上它。
 */
export function taskView(controller: TaskViewController, perform: Perform, disclosures: Disclosures): HTMLElement {
  const task = controller.task!;
  const view = section(tx('任务：{v0}', { v0: task.name }));
  const state = element('p', stateText(controller), 'font-medium');
  state.setAttribute('role', 'status');
  state.dataset['taskState'] = stateKind(controller);
  view.append(
    state,
    element(
      'p',
      tx('本地版本：{v0} · 远端确认：{v1} · 待上传提交：{v2} · 已保存未提交：{v3}', {
        v0: versionText(controller, task.localHead),
        v1: versionText(controller, task.remoteHead),
        v2: task.unpushed,
        v3: task.saved || task.restoring ? tx('有') : tx('无')
      }),
      'text-xs break-all'
    ),
    element('p', '表单里的输入点「保存」之后才进入任务工作树；同步只提交已保存的改动', 'text-xs opacity-70')
  );
  if (task.restoring) view.append(element('p', '工作树来自历史版本的恢复，同步后形成新的提交', 'text-sm'));
  view.append(actions(controller, perform), localHistory(controller, disclosures));
  return view;
}

/** 三种状态之一：已保存未提交（`saved`）优先，其次已提交未同步（`committed`），否则已同步（`synced`）。 */
function stateKind(controller: TaskViewController): 'saved' | 'committed' | 'synced' {
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
/** 版本在界面上的写法：共享分支根（任务从空分支起步、还没有提交）显示为「空」，其余显示提交 ID。 */
function versionText(controller: TaskViewController, head: string): string {
  return head === controller.snapshot?.root ? tx('空') : head;
}

function actions(controller: TaskViewController, perform: Perform): HTMLElement {
  const task = controller.task!;
  const bar = row();
  bar.append(button('同步', () => perform(() => controller.sync()), controller.syncing));
  // 待确认的上传已超过自动重试期限：同步不会自动重发，用户核对远端版本后在这里确认
  if (controller.uploadExpired())
    bar.append(button('确认同步过期提交', () => perform(() => controller.sync(true)), controller.syncing));
  if (task.saved || task.restoring) bar.append(button('放弃草稿', () => confirmDiscard(controller, perform)));
  const name = input('另存任务名称', tx('{v0}（分叉）', { v0: task.name }));
  bar.append(
    name.wrapper,
    button('另存为新任务', () => perform(() => controller.fork(name.control.value)), !controller.online)
  );
  const remote = controller.snapshot?.tasks.find(item => item.id === task.context.taskId);
  if (remote && remote.head !== task.remoteHead)
    bar.append(button('拉取远端版本', () => perform(() => controller.fetchRemote())));
  return bar;
}

/** 放弃草稿前确认：已保存未提交的改动会全部撤回，列表与表单回到任务头；已形成的提交不受影响。 */
function confirmDiscard(controller: TaskViewController, perform: Perform): void {
  const dialog = element('dialog', '', 'modal');
  const box = element('div', '', 'modal-box space-y-4');
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const choices = row();
  choices.append(
    button('取消', close),
    button('确认放弃', () => {
      close();
      return perform(() => controller.discardDraft());
    })
  );
  box.append(
    element('h2', '放弃草稿', 'font-semibold'),
    element('p', '已保存未提交的改动会全部撤回，列表与表单回到任务上次提交的版本；已形成的提交不受影响。'),
    choices
  );
  dialog.append(box);
  document.body.append(dialog);
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.showModal();
}

/**
 * 本机提交历史：任务分支上共同起点之后的提交（新到旧），每个提交的 ID、作者与第一父与服务端一致（跨设备续作时由导入保证），
 * 标出已同步与待上传。展开时才生成内容。
 */
function localHistory(controller: TaskViewController, disclosures: Disclosures): HTMLElement {
  const task = controller.task!;
  const { details, open } = lazyDetails(`task-commits:${task.context.taskId}`, disclosures);
  details.append(element('summary', tx('本机提交历史（{v0} 个）', { v0: task.commits.length })));
  if (!open) return details;
  for (const commit of task.commits) {
    const item = element('p', `${commit.message} · ${commit.authorId ?? ''} · ${commit.id}`, 'text-xs break-all', true);
    item.dataset['commitId'] = commit.id;
    details.append(
      item,
      element(
        'p',
        `${tx('父提交：{v0}', { v0: versionText(controller, commit.parentId) })} · ${commit.synced ? tx('已同步') : tx('待上传')}`,
        'text-xs break-all',
        true
      )
    );
  }
  return details;
}
