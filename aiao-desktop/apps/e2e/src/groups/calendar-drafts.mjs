import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$calendar_event';

export const calendarDrafts = {
  name: 'calendar-drafts',
  description: '日历严格输入、失败草稿、关闭等待、并发冲突与副本恢复',
  keys: [
    'calendarDrafts.invalidInputIsRejected',
    'calendarDrafts.failedCreateKeepsFields',
    'calendarDrafts.closeAndRestartKeepDraft',
    'calendarDrafts.retryCreatesOneEvent',
    'calendarDrafts.pendingSaveBlocksClose',
    'calendarDrafts.failedUpdateKeepsFields',
    'calendarDrafts.conflictAndCopyRecovery',
    'calendarDrafts.failedDeleteKeepsEvent',
    'calendarDrafts.keyboardAndPersistence',
    'calendarDrafts.beforeUnloadGuard',
    'calendarDrafts.noViolations'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('calendar-drafts');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const win = () => helpers.win('calendar');
    const panel = () => page.getByRole('dialog', { name: 'Calendar event editor', exact: true });
    const field = name => panel().getByRole('textbox', { name, exact: true });
    const open = async () => {
      await helpers.launch('Calendar');
      await expect(win().locator('[data-new]')).toBeVisible();
    };
    const newEvent = async title => {
      await win().locator('[data-new]').click();
      await expect(panel()).toBeVisible();
      await field('Event title').fill(title);
      return panel();
    };
    const closeWindow = () => win().locator('.tl .c').click();
    await session.openDesktop();
    await helpers.closeAll();
    await open();
    await newEvent('invalid-calendar');
    await field('Date').fill('2026-02-30');
    await field('Start time').fill('25:00');
    await field('End time').fill('bad');
    await panel().getByRole('button', { name: 'Add', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('valid date');
    await expect(field('Date')).toHaveValue('2026-02-30');
    await field('Date').fill('2026-11-17');
    await expect(panel().getByRole('alert')).toContainText('valid start time');
    await field('Start time').fill('9:00 AM');
    await expect(panel().getByRole('alert')).toContainText('valid end time');
    await field('End time').fill('10:00 AM');
    await panel().getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    result.invalidInputIsRejected = true;

    await newEvent('failed-calendar');
    await field('Date').fill('2026-11-17');
    await field('Start time').fill('9:00 AM');
    await field('End time').fill('10:00 AM');
    await field('Location').fill('Room 3');
    await field('Notes').fill('Keep this draft 🌏');
    await sql(`CREATE TRIGGER fail_calendar_insert BEFORE INSERT ON "${TABLE}"
      WHEN NEW.title LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Calendar storage unavailable'); END`);
    await panel().getByRole('button', { name: 'Add', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(field('Event title')).toHaveValue('failed-calendar');
    await expect(field('Location')).toHaveValue('Room 3');
    await expect(field('Notes')).toHaveValue('Keep this draft 🌏');
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE title = ?`, ['failed-calendar'])).toEqual([]);
    result.failedCreateKeepsFields = true;
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
    result.beforeUnloadGuard = true;
    const axe = await new AxeBuilder({ page }).include('app-calendar-event-editor').analyze();
    result.noViolations = axe.violations;
    await page.screenshot({ path: '/tmp/aiao-calendar-failure.png' });
    await panel().getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    closeWindow();
    await expect(win()).not.toHaveClass(/closing/);
    await expect(panel()).toBeVisible();
    await expect(field('Event title')).toHaveValue('failed-calendar');
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    await expect(panel()).toBeVisible();
    await expect(field('Notes')).toHaveValue('Keep this draft 🌏');
    result.closeAndRestartKeepDraft = true;
    await sql('DROP TRIGGER fail_calendar_insert');
    const retry = panel().getByRole('button', { name: 'Add', exact: true });
    await retry.focus();
    expect(await retry.evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(panel()).toHaveCount(0);
    const created = (await rows(`SELECT id, title, start_minutes, duration_minutes FROM "${TABLE}" WHERE title = ?`, ['failed-calendar']))[0];
    expect(created).toEqual([expect.any(String), 'failed-calendar', 540, 60]);
    result.retryCreatesOneEvent = true;

    await newEvent('pending-calendar');
    await field('Date').fill('2026-11-17');
    await field('Start time').fill('11:00 AM');
    await field('End time').fill('12:00 PM');
    await page.evaluate(() => new Promise(resolve => {
      globalThis.__calendarLock = navigator.locks.request('aiao-desktop-data-write', () => new Promise(release => {
        globalThis.__releaseCalendarLock = release;
        resolve();
      }));
    }));
    await panel().getByRole('button', { name: 'Add', exact: true }).click();
    await expect(panel().getByRole('status')).toHaveText('Saving…');
    await expect(field('Event title')).toBeDisabled();
    await panel().getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    closeWindow();
    await expect(win()).not.toHaveClass(/closing/);
    await page.evaluate(() => globalThis.__releaseCalendarLock());
    await expect.poll(async () => (await rows(`SELECT count(*) FROM "${TABLE}" WHERE title = ?`, ['pending-calendar']))[0][0]).toBe(1);
    await expect(win()).toHaveCount(0);
    result.pendingSaveBlocksClose = true;
    await open();

    const eventId = created[0];
    await win().locator(`[data-ev]`).filter({ hasText: 'failed-calendar' }).first().click();
    await expect(panel()).toBeVisible();
    await field('Event title').fill('failed-calendar-edited');
    await sql(`CREATE TRIGGER fail_calendar_update BEFORE UPDATE ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Calendar update unavailable'); END`);
    await panel().getByRole('button', { name: 'Done', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(field('Event title')).toHaveValue('failed-calendar-edited');
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [eventId])).toEqual([['failed-calendar']]);
    result.failedUpdateKeepsFields = true;
    await sql('DROP TRIGGER fail_calendar_update');
    await panel().getByRole('button', { name: 'Done', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [eventId])).toEqual([['failed-calendar-edited']]);
    await expect(win().locator(`[data-ev]`).filter({ hasText: 'failed-calendar-edited' }).first()).toBeVisible();
    await win().locator(`[data-ev]`).filter({ hasText: 'failed-calendar-edited' }).first().click();
    await expect(panel()).toBeVisible();

    const second = await session.openDesktopPage({ waitForFinder: false });
    await second.helpers.restored();
    await second.helpers.closeAll();
    await second.helpers.launch('Calendar');
    const secondWin = second.helpers.win('calendar');
    await secondWin.locator(`[data-ev]`).filter({ hasText: 'failed-calendar-edited' }).first().click();
    const secondPanel = second.page.getByRole('dialog', { name: 'Calendar event editor', exact: true });
    await secondPanel.getByRole('textbox', { name: 'Event title', exact: true }).fill('remote-calendar');
    await secondPanel.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(secondPanel).toHaveCount(0);
    await field('Event title').fill('local-calendar');
    await expect(panel().getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await panel().getByRole('button', { name: 'Done', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('changed in another window');
    await expect(field('Event title')).toHaveValue('local-calendar');
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [eventId])).toEqual([['remote-calendar']]);
    await panel().getByRole('button', { name: 'Save a Copy', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE title = ?`, ['local-calendar'])).toHaveLength(1);
    result.conflictAndCopyRecovery = true;
    await second.helpers.closeAll();
    await second.page.close();

    await open();
    await win().locator(`[data-ev]`).filter({ hasText: 'remote-calendar' }).first().click();
    await sql(`CREATE TRIGGER fail_calendar_delete BEFORE DELETE ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Calendar delete unavailable'); END`);
    await panel().getByRole('button', { name: 'Delete event', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('Local storage could not complete this change');
    await expect(panel()).toBeVisible();
    await sql('DROP TRIGGER fail_calendar_delete');
    await panel().getByRole('button', { name: 'Delete event', exact: true }).click();
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE title = ?`, ['remote-calendar'])).toEqual([]);
    result.failedDeleteKeepsEvent = true;
    const stop = await pressUntil(page, focus => focus.app === 'calendar' && focus.name === 'New Event');
    expect(stop.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(panel()).toBeVisible();
    await field('Event title').fill('keyboard-calendar');
    await field('Date').fill('2026-11-18');
    await field('Start time').fill('2:00 PM');
    await field('End time').fill('3:15 PM');
    await page.keyboard.press('Enter');
    await expect(panel()).toHaveCount(0);
    expect(await rows(`SELECT duration_minutes FROM "${TABLE}" WHERE title = ?`, ['keyboard-calendar'])).toEqual([[75]]);
    await session.reloadDesktop(page, { finder: false });
    await open();
    expect(await win().locator('[data-ev]').filter({ hasText: 'keyboard-calendar' })).toHaveCount(1);
    result.keyboardAndPersistence = true;
    await helpers.closeAll();
    return { calendarDrafts: result };
  }
};
