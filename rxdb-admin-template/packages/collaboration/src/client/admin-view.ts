import { permissions, type InvitationSummary, type Member, type Permission, type Stage } from '../model.js';
import type { CollaborationController } from './controller.js';
import {
  alert,
  avatar,
  badge,
  button,
  checkbox,
  element,
  input,
  modal,
  modalActions,
  section,
  type BadgeTone,
  type Perform
} from './elements.js';
import { dateTime } from './format.js';
import { createInvitationLink } from './invitation-link.js';
import { tx } from './translate.js';

export const permissionLabels: Record<Permission, string> = {
  read: '查看',
  edit: '编辑与提交',
  comment: '评论',
  review: '审核',
  merge: '合并',
  manage: '成员管理'
};
const policyDrafts = new WeakMap<CollaborationController, { key: string; stages: Stage[] }>();

/** 一组权限复选框：每个权限一个，`key` 区分表单草稿；`values()` 读出勾选的权限。 */
function permissionChecks(values: readonly Permission[], key: string, describe: (label: string) => string) {
  const controls = permissions.map(permission => {
    const wrapper = element('label', '', 'inline-flex cursor-pointer items-center justify-center p-1');
    const control = element('input', '', 'checkbox checkbox-sm');
    control.type = 'checkbox';
    control.checked = values.includes(permission);
    control.dataset['formKey'] = `${key}:${permission}`;
    wrapper.append(control, element('span', describe(tx(permissionLabels[permission])), 'sr-only', true));
    return { permission, wrapper, control };
  });
  return {
    controls,
    values: () => controls.filter(item => item.control.checked).map(item => item.permission)
  };
}

/**
 * 「成员与权限」分区（只有成员管理者可见）：成员表格（权限成列，勾选后保存；移除前确认）、邀请成员、邀请记录与审批策略。
 */
export function adminView(controller: CollaborationController, perform: Perform) {
  const view = element('div', '', 'space-y-4');
  view.append(membersTable(controller, perform), inviteCard(controller, perform));
  if (controller.snapshot!.invitations.length) view.append(invitationsTable(controller, perform));
  view.append(policyView(controller, perform));
  return view;
}

function membersTable(controller: CollaborationController, perform: Perform): HTMLElement {
  const data = controller.snapshot!;
  const view = section('成员与权限', {
    icon: 'users',
    description: '勾选权限后点「保存权限」；移除成员会立即撤销他在这个团队的全部权限'
  });
  const frame = element('div', '', 'overflow-x-auto rounded-box border border-base-300');
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  header.append(element('th', '成员'));
  for (const permission of permissions) header.append(element('th', permissionLabels[permission], 'text-center'));
  header.append(element('th', '操作', 'text-end'));
  head.append(header);
  const body = element('tbody');
  for (const member of data.members) body.append(memberRow(controller, perform, member));
  table.append(head, body);
  frame.append(table);
  view.append(frame);
  return view;
}

function memberRow(controller: CollaborationController, perform: Perform, member: Member): HTMLTableRowElement {
  const row = element('tr');
  row.dataset['memberId'] = member.id;
  const who = element('td');
  const name = element('div', '', 'flex items-center gap-2');
  name.append(avatar(member.email, 'sm'), element('span', member.email, 'break-all font-medium', true));
  if (member.id === controller.user?.id) name.append(badge('你', 'ghost'));
  who.append(name);
  row.append(who);
  const selected = permissionChecks(member.permissions, `${member.id}:${member.generation}`, label =>
    tx('{v0} 的权限：{v1}', { v0: member.email, v1: label })
  );
  for (const item of selected.controls) {
    const cell = element('td', '', 'text-center');
    cell.append(item.wrapper);
    row.append(cell);
  }
  const actions = element('td');
  const bar = element('div', '', 'flex justify-end gap-1');
  bar.append(
    button(
      '保存权限',
      () =>
        perform(() =>
          controller.run({
            type: 'member',
            userId: member.id,
            permissions: selected.values(),
            active: true,
            expectedGeneration: member.generation
          })
        ),
      false,
      { size: 'xs' }
    ),
    button('移除成员', () => confirmRemove(controller, perform, member), false, {
      tone: 'ghost',
      size: 'xs',
      icon: 'trash-2'
    })
  );
  actions.append(bar);
  row.append(actions);
  return row;
}

/** 移除成员前确认：移除即撤销全部权限，对方页面立即锁定；他的本机草稿保留但锁定。 */
function confirmRemove(controller: CollaborationController, perform: Perform, member: Member): void {
  const { dialog, box, close } = modal('移除成员', {
    icon: 'trash-2',
    description: tx('移除 {v0} 后，他会立即失去这个团队的全部权限，页面随即锁定；他本机的草稿保留但不能再同步。', {
      v0: member.email
    })
  });
  box.append(
    modalActions(
      button('取消', close, false, { tone: 'ghost' }),
      button(
        '确认移除',
        () => {
          close();
          return perform(() =>
            controller.run({
              type: 'member',
              userId: member.id,
              permissions: [],
              active: false,
              expectedGeneration: member.generation
            })
          );
        },
        false,
        { tone: 'danger', icon: 'trash-2' }
      )
    )
  );
  dialog.showModal();
}

/** 创建（或重发）邀请：服务端只保存令牌摘要，明文令牌只出现在发给对方的链接里。 */
async function invite(
  controller: CollaborationController,
  target: { email: string; permissions: Permission[]; id?: string; expectedVersion?: number }
): Promise<string> {
  const data = controller.snapshot!;
  const id = target.id ?? crypto.randomUUID();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await controller.run({
    type: 'invite',
    id,
    email: target.email,
    permissions: target.permissions,
    tokenHash: token,
    expiresAt: Date.now() + 7 * 86400000,
    expectedVersion: target.expectedVersion ?? 0
  });
  return createInvitationLink(location.href, { teamId: data.teamId, appId: data.appId, id, token });
}

/** 邀请创建好之后：显示链接并提供复制。 */
function showInvitation(email: string, link: string): void {
  const { dialog, box, close } = modal('邀请已创建', {
    icon: 'user-plus',
    description: tx('把链接发给 {v0}；对方用这个邮箱登录后即可接受邀请，链接 7 天内有效。', { v0: email })
  });
  const field = input('邀请链接（发送给目标邮箱用户）', link, 'text', { size: 'md' });
  field.control.readOnly = true;
  field.control.classList.add('font-mono');
  const feedback = element('div', '', 'empty:hidden');
  const copy = button(
    '复制链接',
    async () => {
      try {
        await navigator.clipboard.writeText(link);
        feedback.replaceChildren(alert('已复制到剪贴板', 'success'));
      } catch {
        field.control.select();
        feedback.replaceChildren(alert('浏览器不允许直接复制，已选中链接，请手动复制', 'warning'));
      }
    },
    false,
    { icon: 'copy' }
  );
  box.append(field.wrapper, feedback, modalActions(copy, button('完成', close, false, { tone: 'primary' })));
  dialog.showModal();
}

function inviteCard(controller: CollaborationController, perform: Perform): HTMLElement {
  const view = section('邀请成员', {
    icon: 'user-plus',
    description: '为一个邮箱创建一次性邀请链接（7 天内有效）；对方用受邀邮箱登录后接受'
  });
  const email = input('邀请邮箱', '', 'email', { placeholder: 'name@company.com' });
  const grants = element('fieldset', '', 'space-y-2');
  grants.append(element('legend', '授予权限', 'mb-1.5 text-sm font-medium'));
  const chips = element('div', '', 'flex flex-wrap gap-x-4 gap-y-2');
  const controls = permissions.map(permission => {
    const item = checkbox(permissionLabels[permission], ['read', 'edit', 'comment'].includes(permission));
    item.control.dataset['formKey'] = `invitation:${permission}`;
    chips.append(item.wrapper);
    return { permission, control: item.control };
  });
  grants.append(chips);
  const create = button(
    '创建邀请链接',
    () =>
      perform(async () => {
        const target = {
          email: email.control.value,
          permissions: controls.filter(item => item.control.checked).map(item => item.permission)
        };
        showInvitation(target.email, await invite(controller, target));
      }),
    false,
    { tone: 'primary', icon: 'link' }
  );
  const form = element('div', '', 'grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]');
  form.append(email.wrapper, grants);
  view.append(form, create);
  return view;
}

/** 邀请的状态：待接受（未过期）、已过期、已接受与已撤销。 */
function invitationState(invitation: InvitationSummary): { label: string; tone: BadgeTone } {
  if (invitation.state === 'accepted') return { label: '已接受', tone: 'success' };
  if (invitation.state === 'revoked') return { label: '已撤销', tone: 'neutral' };
  if (invitation.expiresAt < Date.now()) return { label: '已过期', tone: 'warning' };
  return { label: '待接受', tone: 'info' };
}

function invitationsTable(controller: CollaborationController, perform: Perform): HTMLElement {
  const data = controller.snapshot!;
  const view = section('邀请记录', { icon: 'link', level: 3 });
  const frame = element('div', '', 'overflow-x-auto rounded-box border border-base-300');
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  ['邮箱', '权限', '状态', '有效期至', '操作'].forEach(label => header.append(element('th', label)));
  head.append(header);
  const body = element('tbody');
  for (const invitation of data.invitations) {
    const row = element('tr');
    row.dataset['invitationId'] = invitation.id;
    const grants = element('td');
    const list = element('div', '', 'flex flex-wrap gap-1');
    invitation.permissions.forEach(permission => list.append(badge(permissionLabels[permission], 'ghost')));
    grants.append(list);
    const state = invitationState(invitation);
    const status = element('td');
    status.append(badge(state.label, state.tone));
    const actions = element('td');
    const bar = element('div', '', 'flex flex-wrap gap-1');
    if (invitation.state !== 'accepted')
      bar.append(
        button(
          '重发邀请',
          () =>
            perform(async () =>
              showInvitation(
                invitation.email,
                await invite(controller, {
                  id: invitation.id,
                  expectedVersion: invitation.version,
                  email: invitation.email,
                  permissions: invitation.permissions
                })
              )
            ),
          false,
          { size: 'xs', icon: 'send' }
        )
      );
    if (invitation.state === 'pending')
      bar.append(
        button(
          '撤销邀请',
          () =>
            perform(() =>
              controller.run({ type: 'revoke_invite', id: invitation.id, expectedVersion: invitation.version })
            ),
          false,
          { tone: 'ghost', size: 'xs', icon: 'x' }
        )
      );
    actions.append(bar);
    row.append(
      element('td', invitation.email, 'break-all font-medium'),
      grants,
      status,
      element('td', dateTime(invitation.expiresAt), 'whitespace-nowrap text-xs'),
      actions
    );
    body.append(row);
  }
  table.append(head, body);
  frame.append(table);
  view.append(frame);
  return view;
}

function policyView(controller: CollaborationController, perform: Perform) {
  const data = controller.snapshot!;
  const policy = data.policy;
  const view = section(tx('审批策略 v{v0}', { v0: policy.version }), {
    icon: 'shield-check',
    description: '按顺序添加审批阶段；并行阶段不选择前置条件。免审批只跳过批准人数，不会跳过检查、冲突或阻塞意见。'
  });
  const key = JSON.stringify([
    controller.user?.id,
    controller.workspace?.teamId,
    controller.workspace?.appId,
    policy.version
  ]);
  if (policyDrafts.get(controller)?.key !== key)
    policyDrafts.set(controller, { key, stages: structuredClone(policy.stages) });
  const stages = policyDrafts.get(controller)!.stages;
  const container = element('ol', '', 'space-y-3');
  const draw = () => {
    container.replaceChildren();
    if (!stages.length)
      container.append(alert('没有审批阶段：PR 免审批，但仍要通过检查，且没有冲突与阻塞意见', 'info'));
    stages.forEach((stage, index) => container.append(stageEditor(data.members, stages, stage, index, key, draw)));
  };
  draw();
  const actions = element('div', '', 'flex flex-wrap gap-2');
  actions.append(
    button(
      '添加审批阶段',
      () => {
        const stage: Stage = { id: crypto.randomUUID(), name: tx('新阶段'), minimum: 1, reviewers: [], after: [] };
        stages.push(stage);
        draw();
      },
      false,
      { icon: 'plus' }
    ),
    button(
      '保存审批策略',
      () => perform(() => controller.run({ type: 'policy', stages, expectedVersion: policy.version })),
      false,
      { tone: 'primary', icon: 'check' }
    )
  );
  view.append(container, actions);
  return view;
}

/** 一个审批阶段的编辑卡：名称、批准人数、是否等待前面所有阶段、审核人（从成员里勾选，不选即所有审核者）与删除。 */
function stageEditor(
  members: readonly Member[],
  stages: Stage[],
  stage: Stage,
  index: number,
  key: string,
  redraw: () => void
): HTMLLIElement {
  const item = element('li', '', 'space-y-3 rounded-box border border-base-300 bg-base-200/40 p-3');
  const fields = element('div', '', 'grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_auto_auto]');
  const name = input('阶段名称', stage.name);
  const minimum = input('批准人数', String(stage.minimum), 'number');
  const ordered = checkbox('等待前面所有阶段', stage.after.length > 0, true);
  for (const [field, control] of Object.entries({ name, minimum, ordered }))
    control.control.dataset['formKey'] = `${key}:${stage.id}:${field}`;
  minimum.control.min = '1';
  name.control.oninput = () => {
    stage.name = name.control.value;
  };
  minimum.control.oninput = () => {
    stage.minimum = Number(minimum.control.value);
  };
  ordered.control.onchange = () => {
    stage.after = ordered.control.checked ? stages.slice(0, index).map(s => s.id) : [];
  };
  ordered.wrapper.classList.add('h-8');
  fields.append(
    badge(tx('第 {v0} 阶段', { v0: index + 1 }), 'neutral', true),
    name.wrapper,
    minimum.wrapper,
    ordered.wrapper,
    button(
      '删除阶段',
      () => {
        const removed = stages.splice(index, 1)[0];
        stages.forEach(s => {
          s.after = s.after.filter(id => id !== removed.id);
        });
        redraw();
      },
      false,
      { tone: 'ghost', icon: 'trash-2' }
    )
  );
  const reviewers = element('fieldset', '', 'space-y-1.5');
  reviewers.append(element('legend', '审核人（不选即所有有审核权限的成员）', 'mb-1 text-sm font-medium'));
  const choices = element('div', '', 'flex flex-wrap gap-x-4 gap-y-2');
  for (const member of members) {
    const choice = element('label', '', 'flex cursor-pointer items-center gap-2 text-sm');
    const control = element('input', '', 'checkbox checkbox-sm');
    control.type = 'checkbox';
    control.checked = stage.reviewers.includes(member.id);
    control.dataset['formKey'] = `${key}:${stage.id}:reviewer:${member.id}`;
    control.onchange = () => {
      stage.reviewers =
        control.checked ? [...stage.reviewers, member.id] : stage.reviewers.filter(id => id !== member.id);
    };
    choice.append(control, element('span', member.email, 'break-all', true));
    if (!member.permissions.includes('review'))
      choice.append(element('span', '（无审核权限）', 'text-xs text-base-content/70'));
    choices.append(choice);
  }
  reviewers.append(choices);
  item.append(fields, reviewers);
  return item;
}
