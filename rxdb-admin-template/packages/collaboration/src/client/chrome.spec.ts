import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSummary } from '../model.js';
import { canManage, pageHeader, viewTabs, type HeaderActions } from './chrome.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { useTranslation } from './translate.js';

beforeEach(() => {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('KeyboardEvent', window.KeyboardEvent);
});
afterEach(() => {
  useTranslation(undefined);
  vi.unstubAllGlobals();
});
const alice = { id: 'alice', email: 'alice@example.test', verified: true };
function snapshot(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    teamId: 'team',
    appId: 'assets',
    name: '团队甲',
    members: [
      {
        id: 'alice',
        email: 'alice@example.test',
        permissions: ['read', 'edit', 'manage'],
        generation: 1,
        active: true
      },
      { id: 'bob', email: 'bob@example.test', permissions: ['read', 'review'], generation: 1, active: true }
    ],
    prs: [
      { id: 'p1', title: 'Rename', status: 'review' },
      { id: 'p2', title: 'Draft', status: 'draft' },
      { id: 'p3', title: 'Done', status: 'merged' }
    ],
    presence: [],
    unread: 2,
    ...overrides
  } as unknown as WorkspaceSummary;
}
function setup(state: Partial<CollaborationController> = {}) {
  const controller = {
    user: null,
    online: true,
    workspace: null,
    workspaces: [],
    snapshot: null,
    refresh: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...state
  } as unknown as CollaborationController;
  const perform: Perform = async work => {
    await work();
  };
  const actions: HeaderActions = { perform, selectWorkspace: vi.fn(async () => undefined), openInvitation: vi.fn() };
  const header = pageHeader(controller, actions);
  const button = (name: string) =>
    [...header.querySelectorAll('button')].find(
      node => node.textContent === name || node.getAttribute('aria-label') === name
    );
  return { controller, actions, header, button };
}

describe('页面顶栏', () => {
  it('还没进团队：只有标题与连接状态；账号与退出在外壳顶栏的全局账号菜单里，页头不重复', () => {
    const { header, button } = setup({ user: alice });
    expect(header.querySelector('h1')?.textContent).toBe('团队协作');
    expect(header.querySelector('[role="status"]')?.textContent).toBe('在线');
    expect(header.querySelector('a')).toBeNull();
    expect(header.querySelector('[data-testid="team-switcher"]')).toBeNull();
    expect(header.querySelector('[data-testid="presence"]')).toBeNull();
    expect(button('退出账号')).toBeUndefined();
    expect(header.textContent).not.toContain('alice@example.test');
  });
  it('离线时连接状态说明只能编辑已解锁的本机任务', () => {
    const status = setup({ online: false }).header.querySelector<HTMLElement>('[role="status"]')!;
    expect(status.textContent).toBe('离线');
    expect(status.title).toBe('离线 · 仅能编辑已解锁的本机任务');
  });
  it('进入团队后：团队切换列出可访问的团队并标出当前团队，选别的团队即切换并收起下拉', async () => {
    const workspaces = [
      { teamId: 'team', appId: 'assets', name: '团队甲' },
      { teamId: 'other', appId: 'assets', name: '团队乙' }
    ];
    const { header, actions } = setup({ user: alice, snapshot: snapshot(), workspace: workspaces[0], workspaces });
    const switcher = header.querySelector<HTMLDetailsElement>('[data-testid="team-switcher"]')!;
    expect(switcher.querySelector('summary')?.getAttribute('aria-label')).toBe('切换团队：团队甲');
    const items = [...switcher.querySelectorAll('ul button')];
    expect(items.map(node => node.textContent)).toEqual(['团队甲', '团队乙', '接受团队邀请…']);
    expect(items.map(node => node.getAttribute('aria-current'))).toEqual(['true', null, null]);
    switcher.open = true;
    (items[1] as HTMLButtonElement).click();
    expect(switcher.open).toBe(false);
    await vi.waitFor(() => expect(actions.selectWorkspace).toHaveBeenCalledWith(workspaces[1]));
    (items[2] as HTMLButtonElement).click();
    expect(actions.openInvitation).toHaveBeenCalledTimes(1);
  });
  it('团队名是用户数据：与产品文案同名时也不翻译', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    const workspace = { teamId: 'team', appId: 'assets', name: '同步' };
    const { header } = setup({ user: alice, snapshot: snapshot({ name: '同步' }), workspace, workspaces: [workspace] });
    expect(header.querySelector('[data-testid="team-switcher"] summary span')?.textContent).toBe('同步');
  });
  it('在线成员：每人一项（同一人多个页面合并，优先显示正在查看的位置），标出自己', () => {
    const presence = [
      { userId: 'alice', sessionId: 's1', prId: null, recordId: null },
      { userId: 'bob', sessionId: 's2', prId: null, recordId: null },
      { userId: 'bob', sessionId: 's3', prId: 'p1', recordId: null }
    ];
    const { header } = setup({ user: alice, snapshot: snapshot({ presence }), workspace: null, workspaces: [] });
    const summary = header.querySelector('details[data-disclosure-key="presence"] summary')!;
    expect(summary.textContent).toContain('2 人在线');
    const items = [...header.querySelectorAll<HTMLElement>('[data-testid="presence"] li')];
    expect(items.map(item => item.dataset['userId'])).toEqual(['alice', 'bob']);
    expect(items[0].textContent).toContain('alice@example.test（你）');
    expect(items[0].textContent).toContain('在线');
    expect(items[1].textContent).toContain('正在查看 PR：Rename');
  });
  it('刷新团队状态只在进入团队且在线时提供', async () => {
    const workspace = { teamId: 'team', appId: 'assets', name: '团队甲' };
    const online = setup({ user: alice, snapshot: snapshot(), workspace, workspaces: [workspace] });
    online.button('刷新团队状态')!.click();
    await vi.waitFor(() => expect(online.controller.refresh).toHaveBeenCalledTimes(1));
    expect(
      setup({ user: alice, snapshot: snapshot(), workspace, online: false }).button('刷新团队状态')
    ).toBeUndefined();
    expect(setup({ user: alice, workspace }).button('刷新团队状态')).toBeUndefined();
  });
});

describe('分区页签', () => {
  const controller = (members = snapshot().members) =>
    ({ user: alice, snapshot: snapshot({ members }) }) as unknown as CollaborationController;
  it('列出工作区、数据 PR（进行中的数量）、历史与审计、通知（未读数）；成员管理者另有成员与权限', () => {
    const tabs = [...viewTabs(controller(), 'workspace', vi.fn()).querySelectorAll('[role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['工作区', '数据 PR 2', '历史与审计', '通知 2', '成员与权限']);
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    const reader = controller([{ ...snapshot().members[0], permissions: ['read'] }]);
    expect(canManage(reader)).toBe(false);
    expect([...viewTabs(reader, 'workspace', vi.fn()).querySelectorAll('[role="tab"]')]).toHaveLength(4);
  });
  it('点击选中，左右方向键移动并要求把焦点交给新页签', () => {
    const choose = vi.fn();
    const tabs = [...viewTabs(controller(), 'prs', choose).querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs[2].click();
    expect(choose).toHaveBeenLastCalledWith('history', false);
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(choose).toHaveBeenLastCalledWith('history', true);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(choose).toHaveBeenLastCalledWith('members', true);
  });
});
