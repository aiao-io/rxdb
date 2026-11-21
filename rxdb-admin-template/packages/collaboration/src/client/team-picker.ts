import type { CollaborationController, WorkspaceEntry } from './controller.js';
import {
  alert,
  avatar,
  button,
  element,
  emptyState,
  input,
  modal,
  modalActions,
  section,
  type Perform
} from './elements.js';
import { icon } from './icons.js';
import { carriesInvitation } from './invitation-link.js';
import type { TaskEntry } from './task-ledger.js';
import { tx } from './translate.js';

/** 选择团队页用到的动作，由挂载方提供。 */
export interface TeamPickerActions {
  perform: Perform;
  /** 进入一个团队（已经包在 `perform` 里）。 */
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  /** 离线时打开一个已解锁的本机任务（已经包在 `perform` 里）。 */
  openOffline: (entry: TaskEntry) => Promise<void>;
  /** 按邀请链接加入团队；调用方负责包进 `perform`。 */
  acceptInvitation: (link: string) => Promise<void>;
}

/**
 * 登录之后、还没进入团队时的页面：可访问团队的卡片、离线可继续的本机任务，以及接受团队邀请。
 * 没有任何团队时说明需要先接受邀请（登录不会自动成为管理员）。
 */
export function teamPicker(controller: CollaborationController, actions: TeamPickerActions): HTMLElement {
  const view = element('div', '', 'mx-auto w-full max-w-3xl space-y-6 py-2 sm:py-4');
  const intro = element('div', '', 'space-y-1');
  intro.append(
    element('h2', '选择团队', 'text-xl font-semibold'),
    element('p', '进入团队后可以浏览共享数据、新建任务并参与数据 PR 审核', 'text-sm text-base-content/70')
  );
  view.append(intro);
  if (controller.workspaces.length) {
    const list = element('ul', '', 'grid gap-3 sm:grid-cols-2');
    for (const workspace of controller.workspaces) list.append(teamCard(workspace, actions));
    view.append(list);
  }
  if (controller.offlineDrafts.length) view.append(offlineTasks(controller.offlineDrafts, actions));
  if (!controller.workspaces.length && !controller.offlineDrafts.length)
    view.append(emptyState('inbox', '暂无可访问团队，请接受邀请。登录不会自动成为管理员。'));
  if (controller.online) view.append(invitationCard(actions));
  return view;
}

/** 一个团队的卡片：整张卡片是一个按钮，可访问名称就是团队名。 */
function teamCard(workspace: WorkspaceEntry, actions: TeamPickerActions): HTMLLIElement {
  const item = element('li');
  const card = element(
    'button',
    '',
    'group/team flex w-full items-center gap-3 rounded-box border border-base-300 bg-base-100 p-4 text-start transition hover:border-primary hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary'
  );
  card.type = 'button';
  card.append(
    avatar(workspace.name, 'md', 'square'),
    element('span', workspace.name, 'min-w-0 flex-1 truncate font-medium', true),
    icon('arrow-right', 'size-4 text-base-content/70 transition group-hover/team:translate-x-0.5')
  );
  card.addEventListener('click', () => void actions.selectWorkspace(workspace));
  item.append(card);
  return item;
}

/** 离线冷启动时可以继续编辑的本机任务（原用户上次在线验证过、未锁定的）。 */
function offlineTasks(entries: readonly TaskEntry[], actions: TeamPickerActions): HTMLElement {
  const view = section('离线可继续的任务', {
    icon: 'cloud-off',
    description: '离线时只能打开上次在线验证过、仍然解锁的本机任务；联网后才能同步与审核'
  });
  const list = element('div', '', 'flex flex-wrap gap-2');
  for (const entry of entries)
    list.append(
      button(tx('离线任务：{v0}', { v0: entry.name }), () => actions.openOffline(entry), false, {
        icon: 'git-branch',
        literal: true
      })
    );
  view.append(list);
  return view;
}

/** 接受邀请的表单：邀请链接 + 「接受邀请」；页面地址就是邀请链接时预先填好并提示。 */
function invitationForm(actions: TeamPickerActions, done?: () => void): HTMLElement {
  const form = element('div', '', 'space-y-3');
  const carried = carriesInvitation(location.href);
  if (carried) form.append(alert('已从当前地址读取邀请链接，确认后点「接受邀请」', 'info'));
  const link = input('邀请链接', carried ? location.href : '', 'text', {
    placeholder: '粘贴管理员发来的邀请链接'
  });
  const accept = button(
    '接受邀请',
    () =>
      actions.perform(async () => {
        await actions.acceptInvitation(link.control.value);
        done?.();
      }),
    false,
    { tone: 'primary', icon: 'check' }
  );
  const row = element('div', '', 'flex flex-col gap-2 sm:flex-row sm:items-end');
  link.wrapper.classList.add('flex-1');
  row.append(link.wrapper, accept);
  form.append(row);
  return form;
}

/** 选择团队页上的「接受团队邀请」卡片。 */
function invitationCard(actions: TeamPickerActions): HTMLElement {
  const card = section('接受团队邀请', {
    icon: 'user-plus',
    description: '邀请链接由团队管理员创建，只对受邀邮箱有效；接受后即进入该团队'
  });
  card.append(invitationForm(actions));
  return card;
}

/** 已经在某个团队里时，从团队切换菜单打开的「接受团队邀请」对话框。 */
export function openInvitationDialog(actions: TeamPickerActions): void {
  const { dialog, box, close } = modal('接受团队邀请', {
    icon: 'user-plus',
    description: '邀请链接由团队管理员创建，只对受邀邮箱有效；接受后即进入该团队'
  });
  box.append(invitationForm(actions, close), modalActions(button('取消', close, false, { tone: 'ghost' })));
  dialog.showModal();
}
