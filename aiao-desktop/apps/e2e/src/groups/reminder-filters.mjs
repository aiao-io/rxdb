import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$reminder';

export const reminderFilters = {
  name: 'reminder-filters',
  description: 'Reminders 侧栏列表、动态统计与 Flag/Unflag 持久化',
  keys: [
    'reminderFilters.todayCount',
    'reminderFilters.scheduledCount',
    'reminderFilters.allCount',
    'reminderFilters.flaggedCount',
    'reminderFilters.completedCount',
    'reminderFilters.flagPersists',
    'reminderFilters.unflagPersists'
  ],
  async run(session) {
    const { closeAll, launch, win } = session.helpers;
    await session.openDesktop();
    await closeAll();
    await launch('Reminders');
    const window = win('reminders');
    const rows = () => window.locator('[data-ri]');
    const list = id => window.locator(`[data-rlist="${id}"]`);
    const count = id => list(id).locator('[data-rcount]');
    const result = traced('reminder-filters');

    await expect(window).toBeVisible();
    await expect(window.locator('.fx-title')).toHaveText('Today');
    await expect(count('today')).toHaveText('3');
    await expect(rows()).toHaveCount(3);
    result.todayCount = true;

    await list('scheduled').click();
    await expect(window.locator('.fx-title')).toHaveText('Scheduled');
    await expect(count('scheduled')).toHaveText('2');
    await expect(rows()).toHaveCount(2);
    await expect(rows().filter({ hasText: 'Book the car for Saturday' })).toHaveCount(1);
    result.scheduledCount = true;

    await list('all').click();
    await expect(window.locator('.fx-title')).toHaveText('All');
    await expect(count('all')).toHaveText('5');
    await expect(rows()).toHaveCount(5);
    result.allCount = true;

    await list('completed').click();
    await expect(window.locator('.fx-title')).toHaveText('Completed');
    await expect(count('completed')).toHaveText('2');
    await expect(rows()).toHaveCount(2);
    result.completedCount = true;

    await list('flagged').click();
    await expect(window.locator('.fx-title')).toHaveText('Flagged');
    await expect(count('flagged')).toHaveText('2');
    await expect(rows()).toHaveCount(2);
    const target = rows().filter({ hasText: 'Pick up dry cleaning' });
    await expect(target).toHaveCount(1);
    result.flaggedCount = true;

    await target.locator('[data-rflag]').click();
    await expect(count('flagged')).toHaveText('1');
    await expect(target).toHaveCount(0);
    result.unflagPersists =
      (
        await surgery(session, db =>
          db.shell.rows(`SELECT flagged FROM "${TABLE}" WHERE title = ?`, ['Pick up dry cleaning'])
        )
      )?.[0]?.[0] === 0;

    await list('all').click();
    const flag = target.locator('[data-rflag]');
    await expect(flag).toHaveAttribute('aria-label', 'Flag Pick up dry cleaning');
    await flag.click();
    await expect(flag).toHaveAttribute('aria-label', 'Unflag Pick up dry cleaning');
    result.flagPersists =
      (
        await surgery(session, db =>
          db.shell.rows(`SELECT flagged FROM "${TABLE}" WHERE title = ?`, ['Pick up dry cleaning'])
        )
      )?.[0]?.[0] === 1;

    await closeAll();
    return { reminderFilters: result };
  }
};
