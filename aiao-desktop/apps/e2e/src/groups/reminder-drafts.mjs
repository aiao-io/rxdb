import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const TABLE = 'desktop$reminder';

export const reminderDrafts = {
  name: 'reminder-drafts',
  description: '提醒事项真实 SQLite 写失败、草稿重试、稳定 ID、关闭等待与键盘路径',
  keys: [
    'reminderDrafts.failedDraftPreserved',
    'reminderDrafts.failedCloseAndRestartKeepDraft',
    'reminderDrafts.retryCreatesOneRecord',
    'reminderDrafts.pendingWriteBlocksClose',
    'reminderDrafts.savedToggleFailureAndRecovery',
    'reminderDrafts.explicitDiscardIsScoped',
    'reminderDrafts.keyboardAndPersistence',
    'reminderDrafts.beforeUnloadGuard',
    'reminderDrafts.noViolations'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('reminder-drafts');
    const sql = (statement, bindings) => surgery(session, db => db.shell.execute(statement, bindings));
    const rows = (statement, bindings) => surgery(session, db => db.shell.rows(statement, bindings));
    const window = () => helpers.win('reminders');
    const draft = id => window().locator(`[data-draft-id="${id}"]`);
    const saved = id => window().locator(`[data-ri="${id}"]`);
    const open = async () => {
      await helpers.launch('Reminders');
      await expect(window().locator('[data-ri]').first()).toBeVisible();
    };
    const add = async text => {
      const before = new Set(
        await window()
          .locator('[data-draft-id]')
          .evaluateAll(rows => rows.map(row => row.dataset.draftId))
      );
      await window().getByRole('button', { name: 'New Reminder', exact: true }).click();
      const newIds = async () =>
        (
          await window()
            .locator('[data-draft-id]')
            .evaluateAll(rows => rows.map(row => row.dataset.draftId))
        ).filter(id => !before.has(id));
      await expect.poll(newIds).toHaveLength(1);
      const [id] = await newIds();
      await expect(draft(id).getByRole('textbox')).toBeFocused();
      await draft(id).getByRole('textbox').fill(text);
      return id;
    };
    const close = () => window().locator('.tl .c').click();
    await session.openDesktop();
    await helpers.closeAll();
    await open();
    await sql(`CREATE TRIGGER fail_reminder_insert BEFORE INSERT ON "${TABLE}"
      WHEN NEW.title LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Reminder storage unavailable for this check'); END`);
    const id = await add('failed-draft 🌏');
    await draft(id).getByRole('checkbox').click();
    result.beforeUnloadGuard = !(await page.evaluate(() =>
      globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    ));
    await draft(id).getByRole('button', { name: 'Save Reminder', exact: true }).click();
    await expect(draft(id).getByRole('alert')).toContainText('Reminder was not saved');
    await expect(draft(id).getByRole('textbox')).toHaveValue('failed-draft 🌏');
    await expect(draft(id).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([]);
    result.failedDraftPreserved = true;
    await close();
    await expect(window().getByRole('button', { name: 'New Reminder', exact: true })).toBeEnabled();
    await expect(draft(id).getByRole('textbox')).toHaveValue('failed-draft 🌏');
    await page.getByRole('menuitem', { name: 'Apple', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restart…', exact: true }).click();
    /* 重启现在是两步式（macOS 语义）：确认面板里点 Restart 才拆会话。 */
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(window().getByRole('button', { name: 'New Reminder', exact: true })).toBeEnabled();
    await expect(draft(id).getByRole('alert')).toContainText('Reminder was not saved');
    await expect(window()).not.toHaveClass(/closing/);
    result.failedCloseAndRestartKeepDraft = true;
    const axe = await new AxeBuilder({ page }).include('.win[data-app="reminders"]').analyze();
    result.noViolations = axe.violations;
    await expect(draft(id).getByRole('alert')).toContainText(
      'Local storage could not complete this change. Try again.'
    );
    await expect(draft(id).getByRole('alert')).not.toContainText('desktop$reminder');
    await page.screenshot({ path: '/tmp/aiao-reminder-failure.png' });
    await sql('DROP TRIGGER fail_reminder_insert');
    await draft(id).getByRole('button', { name: 'Retry Save', exact: true }).click();
    await expect(saved(id)).toContainText('failed-draft 🌏');
    await expect(draft(id)).toHaveCount(0);
    expect(await rows(`SELECT title, done FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([['failed-draft 🌏', 1]]);
    result.retryCreatesOneRecord = true;

    await page.evaluate(
      () =>
        new Promise(resolve => {
          globalThis.__reminderLock = navigator.locks.request(
            'aiao-desktop-data-write',
            () =>
              new Promise(release => {
                globalThis.__releaseReminderLock = release;
                resolve();
              })
          );
        })
    );
    const pendingId = await add('pending-reminder');
    await draft(pendingId).getByRole('textbox').press('Enter');
    await expect(window().getByRole('status')).toHaveText('Saving…');
    await expect(draft(pendingId).getByRole('textbox')).toBeDisabled();
    await expect(draft(pendingId).getByRole('button', { name: 'Discard Draft', exact: true })).toBeDisabled();
    await close();
    await expect(window().getByRole('button', { name: 'New Reminder', exact: true })).toBeDisabled();
    await expect(window()).not.toHaveClass(/closing/);
    await page.evaluate(() => {
      globalThis.__releaseReminderLock();
    });
    await expect(window()).toHaveCount(0);
    expect(await rows(`SELECT title FROM "${TABLE}" WHERE id = ?`, [pendingId])).toEqual([['pending-reminder']]);
    result.pendingWriteBlocksClose = true;
    await open();
    await expect(saved(id).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    await sql(`CREATE TRIGGER fail_reminder_toggle BEFORE UPDATE ON "${TABLE}"
      BEGIN SELECT RAISE(ABORT, 'Reminder update unavailable for this check'); END`);
    await saved(id).getByRole('checkbox').click();
    await expect(window().getByRole('alert')).toContainText('Reminder was not updated');
    await expect(saved(id).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect(await rows(`SELECT done FROM "${TABLE}" WHERE id = ?`, [id])).toEqual([[1]]);
    await sql('DROP TRIGGER fail_reminder_toggle');
    await saved(id).getByRole('checkbox').click();
    await expect(saved(id).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    await expect(window().getByRole('alert')).toHaveCount(0);
    result.savedToggleFailureAndRecovery = true;

    await sql(`CREATE TRIGGER fail_reminder_discard BEFORE INSERT ON "${TABLE}"
      WHEN NEW.title LIKE 'failed-%' BEGIN SELECT RAISE(ABORT, 'Reminder draft remains local'); END`);
    const discardId = await add('failed-discard');
    await draft(discardId).getByRole('textbox').press('Enter');
    await expect(draft(discardId).getByRole('alert')).toBeVisible();
    const keptId = await add('failed-keep');
    await draft(keptId).getByRole('textbox').press('Enter');
    await expect(draft(keptId).getByRole('alert')).toBeVisible();
    expect(keptId).not.toBe(discardId);
    await draft(discardId).getByRole('button', { name: 'Discard Draft', exact: true }).click();
    await expect(draft(discardId)).toHaveCount(0);
    await expect(draft(keptId).getByRole('textbox')).toHaveValue('failed-keep');
    await draft(keptId).getByRole('button', { name: 'Discard Draft', exact: true }).click();
    await expect(window().getByRole('textbox', { name: 'Reminder text' })).toHaveCount(0);
    expect(await rows(`SELECT id FROM "${TABLE}" WHERE id IN (?, ?)`, [discardId, keptId])).toEqual([]);
    await sql('DROP TRIGGER fail_reminder_discard');
    result.explicitDiscardIsScoped = true;

    const stop = await pressUntil(page, focus => focus.app === 'reminders' && focus.name === 'New Reminder');
    expect(stop.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(window().getByRole('textbox', { name: 'Reminder text' })).toBeFocused();
    await page.keyboard.type('keyboard-reminder');
    await page.keyboard.press('Enter');
    await expect(window().locator('[data-ri]').filter({ hasText: 'keyboard-reminder' })).toHaveCount(1);
    await expect(window().getByRole('status')).toHaveText('Saved');
    expect(await page.evaluate(() => globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(
      true
    );
    await session.reloadDesktop(page, { finder: false });
    await open();
    await expect(window().locator('[data-ri]').filter({ hasText: 'keyboard-reminder' })).toHaveCount(1);
    await expect(saved(pendingId)).toContainText('pending-reminder');
    await expect(saved(id).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    result.keyboardAndPersistence = true;
    await helpers.closeAll();
    return { reminderDrafts: result };
  }
};
