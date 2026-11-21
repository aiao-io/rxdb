import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notice, WorkspaceSummary } from '../model.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { notificationsView } from './notifications-view.js';

beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const notice = (id: string, overrides: Partial<Notice> = {}): Notice => ({
  id,
  userId: 'alice',
  prId: 'p1',
  threadId: null,
  candidateId: null,
  read: false,
  at: Date.now(),
  ...overrides
});
function setup(notifications: Notice[], earlier = false) {
  const snapshot = {
    unread: notifications.filter(item => !item.read).length,
    notifications,
    prs: [{ id: 'p1', title: '采购电脑', status: 'review' }],
    earlier: { prs: false, tasks: false, notices: earlier }
  } as unknown as WorkspaceSummary;
  const calls: string[] = [];
  const controller = {
    snapshot,
    run: vi.fn(async (command: { type: string; id: string }) => {
      calls.push(`${command.type}:${command.id}`);
      return {};
    }),
    loadEarlierNotices: vi.fn(async () => undefined)
  };
  const perform: Perform = async work => {
    await work();
  };
  const open = vi.fn((item: Notice) => calls.push(`open:${item.id}`));
  const view = notificationsView(controller as unknown as CollaborationController, perform, open);
  return { view, controller, open, calls };
}

describe('通知', () => {
  it('标题显示未读数；新的在上；未读的另有读屏文字与圆点；每条显示 PR 标题与状态', () => {
    const { view } = setup([notice('n1', { read: true, at: 1 }), notice('n2', { threadId: 'th', at: 2 })]);
    expect(view.querySelector('h2')?.textContent).toBe('通知（1 条未读）');
    const items = [...view.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(items.map(item => item.dataset['noticeId'])).toEqual(['n2', 'n1']);
    expect(items[0].textContent).toContain('采购电脑');
    expect(items[0].textContent).toContain('待审核');
    expect(items[0].textContent).toContain('讨论里有新的意见或提及了你');
    expect(items[0].textContent).toContain('未读');
    expect(items[0].querySelector('.status')).not.toBeNull();
    expect(items[1].textContent).toContain('你订阅的 PR 有新动态');
    expect(items[1].textContent).toContain('已读');
    expect(items[1].querySelector('.status')).toBeNull();
  });
  it('点一条通知：先标为已读，再交给挂载方打开对应的 PR', async () => {
    const { view, calls, open } = setup([notice('n1')]);
    view.querySelector<HTMLButtonElement>('ul button')!.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['read_notice:n1', 'open:n1']);
  });
  it('没有通知时显示空状态；窗口之外还有更早的通知时提供加载入口', async () => {
    expect(setup([]).view.textContent).toContain('暂无通知');
    const { view, controller } = setup([notice('n1')], true);
    [...view.querySelectorAll('button')].find(node => node.textContent === '加载更早的通知')!.click();
    await vi.waitFor(() => expect(controller.loadEarlierNotices).toHaveBeenCalledTimes(1));
  });
});
