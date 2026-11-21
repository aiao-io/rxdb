import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import type { TaskEntry } from './task-ledger.js';
import { openInvitationDialog, teamPicker, type TeamPickerActions } from './team-picker.js';

let window: Window;
function stub(url: string) {
  window = new Window({ url });
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('location', window.location);
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
beforeEach(() => stub('https://app.example/collaboration'));
afterEach(() => {
  vi.unstubAllGlobals();
});
const workspaces = [
  { teamId: 'team', appId: 'assets', name: '团队甲' },
  { teamId: 'other', appId: 'assets', name: '团队乙' }
];
const offline = { name: '离线保留', context: { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 't' } };
function setup(state: Partial<CollaborationController> = {}) {
  const controller = { online: true, workspaces, offlineDrafts: [], ...state } as unknown as CollaborationController;
  const perform: Perform = async work => {
    await work();
  };
  const actions: TeamPickerActions = {
    perform,
    selectWorkspace: vi.fn(async () => undefined),
    openOffline: vi.fn(async () => undefined),
    acceptInvitation: vi.fn(async () => undefined)
  };
  const view = teamPicker(controller, actions);
  /** 按可访问名称找按钮：对辅助技术隐藏的头像首字母不算在名称里。 */
  const button = (root: ParentNode, name: string) =>
    [...root.querySelectorAll('button')].find(node => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"]').forEach(hidden => hidden.remove());
      return copy.textContent === name;
    })!;
  return { view, actions, button };
}

describe('选择团队', () => {
  it('每个可访问的团队一张卡片（可访问名称就是团队名），点击进入该团队', async () => {
    const { view, actions, button } = setup();
    expect(view.querySelector('h2')?.textContent).toBe('选择团队');
    button(view, '团队乙').click();
    await vi.waitFor(() => expect(actions.selectWorkspace).toHaveBeenCalledWith(workspaces[1]));
  });
  it('没有团队也没有离线任务时说明要先接受邀请', () => {
    const { view } = setup({ workspaces: [] });
    expect(view.textContent).toContain('暂无可访问团队，请接受邀请。登录不会自动成为管理员。');
  });
  it('离线冷启动时列出可继续的本机任务，点击打开', async () => {
    const { view, actions, button } = setup({
      online: false,
      workspaces: [],
      offlineDrafts: [offline as unknown as TaskEntry]
    });
    button(view, '离线任务：离线保留').click();
    await vi.waitFor(() => expect(actions.openOffline).toHaveBeenCalledWith(offline));
    // 离线时不能接受邀请
    expect(view.querySelector('input[aria-label="邀请链接"]')).toBeNull();
  });
  it('接受团队邀请：按填写的邀请链接接受；当前地址就是邀请链接时预先填好并提示', async () => {
    const plain = setup();
    const link = plain.view.querySelector<HTMLInputElement>('input[aria-label="邀请链接"]')!;
    expect(link.value).toBe('');
    link.value = 'https://app.example/collaboration#join=x';
    plain.button(plain.view, '接受邀请').click();
    await vi.waitFor(() =>
      expect(plain.actions.acceptInvitation).toHaveBeenCalledWith('https://app.example/collaboration#join=x')
    );
    const ticket = encodeURIComponent(JSON.stringify({ teamId: 'team', appId: 'assets', id: 'i', token: 't' }));
    stub(`https://app.example/collaboration#join=${ticket}`);
    const carried = setup();
    expect(carried.view.querySelector<HTMLInputElement>('input[aria-label="邀请链接"]')!.value).toContain('#join=');
    expect(carried.view.textContent).toContain('已从当前地址读取邀请链接');
  });
  it('团队切换菜单里的「接受团队邀请」对话框：接受成功后关闭', async () => {
    const { actions } = setup();
    openInvitationDialog(actions);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id);
    dialog.querySelector<HTMLInputElement>('input[aria-label="邀请链接"]')!.value = 'link';
    [...dialog.querySelectorAll('button')].find(node => node.textContent === '接受邀请')!.click();
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(actions.acceptInvitation).toHaveBeenCalledWith('link');
  });
});
