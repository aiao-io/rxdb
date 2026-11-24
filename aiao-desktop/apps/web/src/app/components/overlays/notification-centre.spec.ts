import { describe, expect, it } from 'vitest';

import type { AppNotification, NotificationSource } from '../../services/app-notifications';
import { SWIPE_THRESHOLD_PX, groupNotifications, swipedPast } from './notification-centre-model';

const mail: NotificationSource = { id: 'mail', name: 'Mail', icon: 'app-mail' };
const code: NotificationSource = { id: 'vscode', name: 'Aiao Code', icon: 'app-aiao-code' };

const note = (id: string, app: NotificationSource): AppNotification => ({
  id,
  app,
  title: id,
  body: '',
  symbol: null,
  image: null,
  dedupeKey: null,
  postedAt: new Date(0)
});

describe('groupNotifications：按来源应用分组', () => {
  it('组按该应用最新一条出现的先后排列，组内保持条目原来的顺序', () => {
    const groups = groupNotifications([
      note('n1', mail),
      note('n2', code),
      note('n3', mail),
      note('n4', code),
      note('n5', code)
    ]);
    expect(groups.map(group => group.app.id)).toEqual(['vscode', 'mail']);
    expect(groups.map(group => group.notes.map(entry => entry.id))).toEqual([
      ['n2', 'n4', 'n5'],
      ['n1', 'n3']
    ]);
    expect(groups[0]?.app.name).toBe('Aiao Code');
  });

  it('单一应用只有一组；空列表得到空数组', () => {
    expect(groupNotifications([note('n1', mail), note('n2', mail)])).toHaveLength(1);
    expect(groupNotifications([])).toEqual([]);
  });
});

describe('swipedPast：滑动的清除阈值', () => {
  it('差一像素不算，达到阈值算；反向（向左）不算', () => {
    expect(swipedPast(SWIPE_THRESHOLD_PX - 1)).toBe(false);
    expect(swipedPast(SWIPE_THRESHOLD_PX)).toBe(true);
    expect(swipedPast(120)).toBe(true);
    expect(swipedPast(-40)).toBe(false);
  });
});
