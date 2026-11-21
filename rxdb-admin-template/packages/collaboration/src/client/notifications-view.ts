import type { Notice } from '../model.js';
import type { CollaborationController } from './controller.js';
import { badge, button, element, emptyState, section, statusDot, type Perform } from './elements.js';
import { timeElement } from './format.js';
import { icon } from './icons.js';
import { prStatus } from './pr-view.js';
import { tx } from './translate.js';

/**
 * 「通知」分区：本人的站内通知（订阅的 PR 有新动态、或在讨论里被提及），新的在上；未读的带圆点与加粗。
 * 点一条通知即标为已读并打开对应的 PR——有讨论线程时打开讨论并定位到它，否则打开检查。
 * @param open 打开通知对应的 PR（挂载方切到 PR 分区并选中它）。
 */
export function notificationsView(
  controller: CollaborationController,
  perform: Perform,
  open: (notice: Notice) => void
): HTMLElement {
  const data = controller.snapshot!;
  const view = section(tx('通知（{v0} 条未读）', { v0: data.unread }), {
    icon: 'bell',
    description: '订阅的 PR 有新动态、或有人在讨论里提及你时收到通知'
  });
  if (!data.notifications.length) {
    view.append(emptyState('inbox', '暂无通知', '订阅一个数据 PR，或等其他成员在讨论里提及你'));
    return view;
  }
  const list = element('ul', '', 'divide-y divide-base-300 rounded-box border border-base-300');
  for (const notice of [...data.notifications].reverse()) {
    const pr = data.prs.find(item => item.id === notice.prId);
    const node = element(
      'button',
      '',
      'flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-base-200/60 focus-visible:outline-2 focus-visible:outline-primary'
    );
    node.type = 'button';
    node.dataset['noticeId'] = notice.id;
    const text = element('span', '', 'min-w-0 flex-1 space-y-0.5');
    const title = element('span', '', 'flex flex-wrap items-center gap-2');
    title.append(
      element('span', pr?.title ?? notice.prId, notice.read ? 'break-words' : 'break-words font-semibold', true),
      ...(pr ? [badge(prStatus[pr.status].label, prStatus[pr.status].tone)] : [])
    );
    const meta = element('span', '', 'flex flex-wrap items-center gap-x-2 text-xs text-base-content/70');
    meta.append(
      element('span', notice.threadId ? '讨论里有新的意见或提及了你' : '你订阅的 PR 有新动态'),
      element('span', '·', '', true),
      timeElement(notice.at)
    );
    text.append(title, meta);
    node.append(
      icon(notice.threadId ? 'message-square' : 'git-pull-request', 'mt-0.5 size-4 text-base-content/70'),
      text,
      element('span', notice.read ? '已读' : '未读', notice.read ? 'text-xs text-base-content/70' : 'sr-only')
    );
    if (!notice.read) node.append(statusDot('info'));
    node.addEventListener(
      'click',
      () =>
        void perform(async () => {
          await controller.run({ type: 'read_notice', id: notice.id });
          open(notice);
        })
    );
    const item = element('li');
    item.append(node);
    list.append(item);
  }
  view.append(list);
  if (data.earlier.notices)
    view.append(
      button('加载更早的通知', () => perform(() => controller.loadEarlierNotices()), false, {
        tone: 'ghost',
        size: 'xs'
      })
    );
  return view;
}
