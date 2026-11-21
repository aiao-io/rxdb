import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '../model.js';
import { adminView } from './admin-view.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';

beforeEach(() => {
  const window = new Window({ url: 'https://app.example/collaboration' });
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('location', window.location);
  vi.stubGlobal('Event', window.Event);
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const day = 86_400_000;
function setup() {
  const snapshot = {
    teamId: 'team',
    appId: 'assets',
    members: [
      {
        id: 'alice',
        email: 'alice@example.test',
        permissions: ['read', 'edit', 'manage'],
        generation: 2,
        active: true
      },
      { id: 'bob', email: 'bob@example.test', permissions: ['read', 'review'], generation: 1, active: true }
    ],
    invitations: [
      {
        id: 'i1',
        email: 'a@example.test',
        permissions: ['read'],
        version: 1,
        state: 'accepted',
        expiresAt: Date.now() + day
      },
      {
        id: 'i2',
        email: 'b@example.test',
        permissions: ['read'],
        version: 1,
        state: 'pending',
        expiresAt: Date.now() + day
      },
      {
        id: 'i3',
        email: 'c@example.test',
        permissions: ['read'],
        version: 2,
        state: 'pending',
        expiresAt: Date.now() - day
      },
      {
        id: 'i4',
        email: 'd@example.test',
        permissions: ['read'],
        version: 3,
        state: 'revoked',
        expiresAt: Date.now() + day
      }
    ],
    policy: { version: 4, stages: [{ id: 's1', name: '审核', minimum: 1, reviewers: [], after: [] }] }
  } as unknown as WorkspaceSummary;
  const controller = {
    user: { id: 'alice', email: 'alice@example.test', verified: true },
    workspace: { teamId: 'team', appId: 'assets', name: '团队甲' },
    snapshot,
    run: vi.fn<(command: Record<string, unknown>) => Promise<Record<string, unknown>>>(async () => ({}))
  };
  const perform: Perform = async work => {
    await work();
  };
  const view = adminView(controller as unknown as CollaborationController, perform);
  const button = (root: ParentNode, name: string) =>
    [...root.querySelectorAll('button')].find(node => node.textContent === name)!;
  return { view, controller, button };
}
const dialog = () => document.querySelector('dialog')!;

describe('成员与权限', () => {
  it('每个成员一行：邮箱（自己另标「你」）与六项权限的勾选；保存按勾选的权限提交', async () => {
    const { view, controller, button } = setup();
    const rows = [...view.querySelectorAll<HTMLTableRowElement>('tr[data-member-id]')];
    expect(rows.map(row => row.dataset['memberId'])).toEqual(['alice', 'bob']);
    expect(rows[0].textContent).toContain('alice@example.test你');
    const checks = (row: Element) => [...row.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checks(rows[1]).map(check => check.checked)).toEqual([true, false, false, true, false, false]);
    checks(rows[1])[2].checked = true;
    button(rows[1], '保存权限').click();
    await vi.waitFor(() =>
      expect(controller.run).toHaveBeenCalledWith({
        type: 'member',
        userId: 'bob',
        permissions: ['read', 'comment', 'review'],
        active: true,
        expectedGeneration: 1
      })
    );
  });
  it('移除成员先确认：取消什么都不做，确认后撤销全部权限', async () => {
    const { view, controller, button } = setup();
    const row = view.querySelector('tr[data-member-id="bob"]')!;
    button(row, '移除成员').click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog().textContent).toContain('bob@example.test');
    button(dialog(), '取消').click();
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(controller.run).not.toHaveBeenCalled();
    button(row, '移除成员').click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    button(dialog(), '确认移除').click();
    await vi.waitFor(() =>
      expect(controller.run).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'member', userId: 'bob', permissions: [], active: false })
      )
    );
  });
  it('创建邀请链接：按邮箱与勾选的权限建邀请，之后在对话框里给出带一次性令牌的链接', async () => {
    const { view, controller, button } = setup();
    view.querySelector<HTMLInputElement>('input[aria-label="邀请邮箱"]')!.value = 'new@example.test';
    button(view, '创建邀请链接').click();
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    const command = controller.run.mock.calls[0][0] as {
      email: string;
      permissions: string[];
      tokenHash: string;
      id: string;
    };
    expect(command).toMatchObject({
      type: 'invite',
      email: 'new@example.test',
      permissions: ['read', 'edit', 'comment']
    });
    const link = dialog().querySelector<HTMLInputElement>('input[aria-label="邀请链接（发送给目标邮箱用户）"]')!;
    expect(link.readOnly).toBe(true);
    expect(link.value).toContain('/collaboration#join=');
    expect(decodeURIComponent(link.value)).toContain(command.tokenHash);
    expect(decodeURIComponent(link.value)).toContain(command.id);
  });
  it('邀请记录：状态分为已接受、待接受、已过期与已撤销；未接受的可以重发，待接受的可以撤销', async () => {
    const { view, controller, button } = setup();
    const rows = [...view.querySelectorAll<HTMLTableRowElement>('tr[data-invitation-id]')];
    expect(rows.map(row => row.querySelector('td:nth-child(3)')?.textContent)).toEqual([
      '已接受',
      '待接受',
      '已过期',
      '已撤销'
    ]);
    const actions = (row: Element) => [...row.querySelectorAll('button')].map(node => node.textContent);
    expect(rows.map(actions)).toEqual([[], ['重发邀请', '撤销邀请'], ['重发邀请', '撤销邀请'], ['重发邀请']]);
    button(rows[1], '撤销邀请').click();
    await vi.waitFor(() =>
      expect(controller.run).toHaveBeenCalledWith({ type: 'revoke_invite', id: 'i2', expectedVersion: 1 })
    );
  });
  it('审批策略：阶段的审核人从成员里勾选（没有审核权限的成员另有标注），可以加减阶段，保存提交整份阶段', async () => {
    const { view, controller, button } = setup();
    expect(view.textContent).toContain('审批策略 v4');
    const stage = () => view.querySelector('ol li')!;
    expect(stage().textContent).toContain('alice@example.test（无审核权限）');
    const reviewer = [...stage().querySelectorAll('label')].find(label => label.textContent === 'bob@example.test')!;
    const check = reviewer.querySelector('input')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    button(view, '添加审批阶段').click();
    await vi.waitFor(() => expect(view.querySelectorAll('ol li')).toHaveLength(2));
    button(view, '保存审批策略').click();
    await vi.waitFor(() => expect(controller.run).toHaveBeenCalled());
    const command = controller.run.mock.calls[0][0] as { stages: { reviewers: string[]; name: string }[] };
    expect(command).toMatchObject({ type: 'policy', expectedVersion: 4 });
    expect(command.stages.map(item => item.reviewers)).toEqual([['bob'], []]);
    expect(command.stages[1].name).toBe('新阶段');
  });
});
