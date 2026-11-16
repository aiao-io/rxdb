import { permissions, type Permission, type Stage } from '../model.js';
import type { CollaborationController } from './controller.js';
import { button, checkbox, element, input, row, section, type Perform } from './elements.js';
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
function permissionInputs(values: Permission[], key: string) {
  const container = row();
  const controls = permissions.map(permission => ({
    permission,
    ...checkbox(permissionLabels[permission], values.includes(permission))
  }));
  controls.forEach(control => {
    control.control.dataset['formKey'] = `${key}:${control.permission}`;
    container.append(control.wrapper);
  });
  return {
    container,
    values: () => controls.filter(control => control.control.checked).map(control => control.permission)
  };
}
export function adminView(controller: CollaborationController, perform: Perform) {
  const view = section('成员与权限');
  const data = controller.snapshot!;
  for (const member of data.members) {
    const box = section(member.email);
    const selected = permissionInputs(member.permissions, `${member.id}:${member.generation}`);
    box.append(selected.container);
    box.append(
      button('保存权限', () =>
        perform(() =>
          controller.run({
            type: 'member',
            userId: member.id,
            permissions: selected.values(),
            active: true,
            expectedGeneration: member.generation
          })
        )
      ),
      button('移除成员', () =>
        perform(() =>
          controller.run({
            type: 'member',
            userId: member.id,
            permissions: [],
            active: false,
            expectedGeneration: member.generation
          })
        )
      )
    );
    view.append(box);
  }
  const email = input('邀请邮箱', '', 'email');
  const selected = permissionInputs(['read', 'edit', 'comment'], 'invitation');
  const invitationLink = input('邀请链接（发送给目标邮箱用户）');
  invitationLink.control.readOnly = true;
  const invite = async (
    id: string = crypto.randomUUID(),
    expectedVersion = 0,
    targetEmail = email.control.value,
    grants = selected.values()
  ) => {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await controller.run({
      type: 'invite',
      id,
      email: targetEmail,
      permissions: grants,
      tokenHash: token,
      expiresAt: Date.now() + 7 * 86400000,
      expectedVersion
    });
    const dialog = element('dialog', '', 'modal');
    const content = element('div', '', 'modal-box space-y-4');
    invitationLink.control.value = createInvitationLink(location.href, {
      teamId: data.teamId,
      appId: data.appId,
      id,
      token
    });
    content.append(
      element('h2', '邀请已创建', 'font-semibold'),
      invitationLink.wrapper,
      button('关闭', () => {
        dialog.close();
        dialog.remove();
      })
    );
    dialog.append(content);
    document.body.append(dialog);
    dialog.showModal();
  };
  view.append(
    email.wrapper,
    selected.container,
    button('创建邀请链接', () => perform(() => invite()))
  );
  data.invitations.forEach(invitation => {
    const item = row();
    item.append(element('span', `${invitation.email} · v${invitation.version} · ${invitation.state}`));
    if (invitation.state !== 'accepted')
      item.append(
        button('重发邀请', () =>
          perform(() => invite(invitation.id, invitation.version, invitation.email, invitation.permissions))
        ),
        button('撤销邀请', () =>
          perform(() =>
            controller.run({ type: 'revoke_invite', id: invitation.id, expectedVersion: invitation.version })
          )
        )
      );
    view.append(item);
  });
  view.append(policyView(controller, perform));
  return view;
}
function policyView(controller: CollaborationController, perform: Perform) {
  const policy = controller.snapshot!.policy;
  const view = section(tx('审批策略 v{v0}', { v0: policy.version }));
  view.append(
    element(
      'p',
      '按顺序添加审批阶段；并行阶段不选择前置条件。免审批只跳过批准人数，不会跳过检查、冲突或阻塞意见。',
      'text-sm'
    )
  );
  const key = JSON.stringify([
    controller.user?.id,
    controller.workspace?.teamId,
    controller.workspace?.appId,
    policy.version
  ]);
  if (policyDrafts.get(controller)?.key !== key)
    policyDrafts.set(controller, { key, stages: structuredClone(policy.stages) });
  const stages = policyDrafts.get(controller)!.stages;
  const container = element('div', '', 'space-y-3');
  const draw = () => {
    container.replaceChildren();
    stages.forEach((stage, index) => {
      const item = row();
      const name = input('阶段名称', stage.name);
      const minimum = input('批准人数', String(stage.minimum), 'number');
      const ordered = checkbox('等待前面所有阶段', stage.after.length > 0);
      const reviewers = input('审核人 ID（逗号分隔，留空为所有审核者）', stage.reviewers.join(','));
      for (const [field, control] of Object.entries({ name, minimum, ordered, reviewers }))
        control.control.dataset['formKey'] = `${key}:${stage.id}:${field}`;
      name.control.oninput = () => {
        stage.name = name.control.value;
      };
      minimum.control.oninput = () => {
        stage.minimum = Number(minimum.control.value);
      };
      reviewers.control.oninput = () => {
        stage.reviewers = reviewers.control.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      };
      ordered.control.onchange = () => {
        stage.after = ordered.control.checked ? stages.slice(0, index).map(s => s.id) : [];
      };
      item.append(
        name.wrapper,
        minimum.wrapper,
        reviewers.wrapper,
        ordered.wrapper,
        button('删除阶段', () => {
          const removed = stages.splice(index, 1)[0];
          stages.forEach(s => {
            s.after = s.after.filter(id => id !== removed.id);
          });
          draw();
        })
      );
      container.append(item);
    });
  };
  draw();
  view.append(
    container,
    button('添加审批阶段', () => {
      const stage: Stage = { id: crypto.randomUUID(), name: '新阶段', minimum: 1, reviewers: [], after: [] };
      stages.push(stage);
      draw();
    }),
    button('保存审批策略', () =>
      perform(() => controller.run({ type: 'policy', stages, expectedVersion: policy.version }))
    )
  );
  return view;
}
